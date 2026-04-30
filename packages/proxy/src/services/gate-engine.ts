/**
 * Gate engine — evaluates the BLOCKING gates declared by a campaign's
 * test-target template at `end_campaign` time. Each gate reduces to a
 * deterministic computation over `campaigns` / `campaign_metrics` /
 * `tool_calls` so historical replays produce identical verdicts.
 *
 * Gate kinds (extend by adding (a) a value to `GateSource` in
 * `@agentdeck/shared/test-targets` and (b) a case in `evaluateOne`):
 *   - ui-coverage-principe-10 — per-persona UI ratio with waivers (legacy).
 *   - metric-min               — campaign metric ≥ minimum.
 *   - metric-max               — campaign metric ≤ maximum.
 *   - metric-ratio-min         — numerator/denominator ratio ≥ minimum.
 *
 * Outcomes are persisted to `campaign_gate_results` (one row per gate per
 * end_campaign call — re-runs OVERWRITE prior eval for idempotency). The
 * route layer translates the structured outcome into the legacy 422
 * `ui_coverage_violation` shape when the only failing gate is Principe-10
 * (preserves backward compat with the dashboard + agentdeck-review skill).
 */
import { and, desc, eq } from 'drizzle-orm';
import {
  agents,
  campaignGateResults,
  campaignMetrics,
  campaignRetrospectives,
  campaigns,
  sessions,
  toolCalls,
  type Gate,
} from '@agentdeck/shared';
import { getDb } from '../db.js';
import { getTemplate } from './test-targets-loader.js';

export interface PersonaCoverage {
  agentId: string;
  agentName: string;
  role: string | null;
  sessionId: string;
  uiCalls: number;
  apiCalls: number;
  totalRelevantCalls: number;
  ratio: number | null;
}

export interface GateOutcome {
  name: string;
  source: string;
  blocking: boolean;
  passed: boolean;
  waived: boolean;
  /** The observed value(s). Shape varies per source. */
  value: unknown;
  /** The threshold(s) the value was compared against. Shape varies per source. */
  threshold: unknown;
  /** Engine-specific extra context (per-persona breakdown, numerator/denominator…). */
  detail?: unknown;
}

export interface GateEvaluation {
  /** True iff every BLOCKING gate passed (or was waived). */
  passed: boolean;
  gates: GateOutcome[];
  /** Failing gates that BLOCK end_campaign. */
  blockers: GateOutcome[];
  /** Failing gates that don't block (non-blocking, or blocking-but-waived). */
  warnings: GateOutcome[];
}

const PRINCIPE_10_DEFAULTS = {
  hardFloor: 0.5,
  warnFloor: 0.7,
  minToolCalls: 5,
};
const EXCLUDED_PRINCIPE_10_ROLES = new Set(['orchestrator', 'root', 'bridge', 'claim-validator', 'skill']);

function isApiBypassCall(toolName: string, inputJson: string | null): boolean {
  if (toolName === 'validate_claim' || toolName === 'validate_claims_bulk') return true;
  if (toolName === 'sandbox_exec' && inputJson) {
    try {
      const parsed = JSON.parse(inputJson) as { command?: string };
      const cmd = (parsed.command ?? '').toLowerCase();
      if (/\b(curl|wget|httpie|http\s)/.test(cmd)) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

function computePersonaCoverage(projectName: string): PersonaCoverage[] {
  const db = getDb();
  const personaRows = db
    .select({
      agentId: agents.id,
      agentName: agents.name,
      role: agents.role,
      sessionId: agents.sessionId,
      parentAgentId: agents.parentAgentId,
    })
    .from(agents)
    .innerJoin(sessions, eq(sessions.id, agents.sessionId))
    .where(eq(sessions.projectId, projectName))
    .all();
  const out: PersonaCoverage[] = [];
  for (const p of personaRows) {
    if (p.parentAgentId === null) continue;
    const role = (p.role ?? '').toLowerCase();
    if (EXCLUDED_PRINCIPE_10_ROLES.has(role)) continue;
    const calls = db
      .select({ toolName: toolCalls.toolName, input: toolCalls.input })
      .from(toolCalls)
      .where(eq(toolCalls.agentId, p.agentId))
      .all();
    let ui = 0;
    let api = 0;
    for (const c of calls) {
      if (c.toolName.startsWith('browser_')) ui++;
      else if (isApiBypassCall(c.toolName, typeof c.input === 'string' ? c.input : JSON.stringify(c.input))) api++;
    }
    const total = ui + api;
    out.push({
      agentId: p.agentId,
      agentName: p.agentName,
      role: p.role,
      sessionId: p.sessionId,
      uiCalls: ui,
      apiCalls: api,
      totalRelevantCalls: total,
      ratio: total === 0 ? null : ui / total,
    });
  }
  return out;
}

/**
 * Parse waiver lines out of `retrospective.toolingFeedback`.
 *
 * Two formats accepted:
 *   UI-EXEMPT: <persona>: <reason>             (legacy, only for ui.coverageRatio)
 *   <GATE-NAME>-EXEMPT: <subject>: <reason>    (generic future-proof form)
 *
 * The `subject` string is matched case-insensitively against the persona /
 * metric name the engine cares about. Multiple lines allowed.
 */
function parseWaivers(retroToolingFeedback: string, gateName: string): Set<string> {
  const out = new Set<string>();
  const legacyAccepted = gateName === 'ui.coverageRatio';
  const tag = `${gateName.toUpperCase().replace(/[^A-Z0-9]+/g, '-')}-EXEMPT`;
  const genericRe = new RegExp(`^${tag}:\\s*([^:]+?)\\s*:\\s*(.+)$`);
  const legacyRe = /^UI-EXEMPT:\s*([^:]+?)\s*:\s*(.+)$/;
  for (const line of retroToolingFeedback.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (legacyAccepted) {
      const m = legacyRe.exec(trimmed);
      if (m && m[1]) out.add(m[1].trim().toLowerCase());
    }
    const m2 = genericRe.exec(trimmed);
    if (m2 && m2[1]) out.add(m2[1].trim().toLowerCase());
  }
  return out;
}

function readLatestMetricNumeric(campaignId: string, name: string): number | null {
  const db = getDb();
  const row = db
    .select()
    .from(campaignMetrics)
    .where(and(eq(campaignMetrics.campaignId, campaignId), eq(campaignMetrics.name, name)))
    .orderBy(desc(campaignMetrics.recordedAt))
    .get();
  if (!row) return null;
  let v: unknown;
  try {
    v = JSON.parse(row.valueJson);
  } catch {
    return null;
  }
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  if (typeof v === 'boolean') return v ? 1 : 0;
  return null;
}

function evaluateOne(
  gate: Gate,
  campaign: { id: string; projectName: string },
  retroToolingFeedback: string | null,
): GateOutcome {
  const waivers = retroToolingFeedback ? parseWaivers(retroToolingFeedback, gate.name) : new Set<string>();

  switch (gate.source) {
    case 'ui-coverage-principe-10': {
      const hardFloor = gate.hardFloor ?? PRINCIPE_10_DEFAULTS.hardFloor;
      const warnFloor = gate.warnFloor ?? PRINCIPE_10_DEFAULTS.warnFloor;
      const minToolCalls = gate.minSamples ?? PRINCIPE_10_DEFAULTS.minToolCalls;
      const coverage = computePersonaCoverage(campaign.projectName);
      const violators: PersonaCoverage[] = [];
      const warned: PersonaCoverage[] = [];
      for (const p of coverage) {
        if (p.totalRelevantCalls < minToolCalls) continue;
        if (p.ratio === null) continue;
        const waived = waivers.has(p.agentName.toLowerCase());
        if (p.ratio < hardFloor && !waived) violators.push(p);
        else if (p.ratio < warnFloor && !waived) warned.push(p);
      }
      const passed = violators.length === 0;
      return {
        name: gate.name,
        source: gate.source,
        blocking: gate.blocking,
        passed,
        waived: false,
        value: { violators: violators.length, warnings: warned.length, evaluated: coverage.length },
        threshold: { hardFloor, warnFloor, minToolCalls },
        detail: { violators, warnings: warned, all: coverage },
      };
    }
    case 'metric-min': {
      if (!gate.metric || gate.minimum === undefined) {
        throw new Error(`gate ${gate.name}: metric-min requires { metric, minimum }`);
      }
      const v = readLatestMetricNumeric(campaign.id, gate.metric);
      const passed = v !== null && v >= gate.minimum;
      return {
        name: gate.name,
        source: gate.source,
        blocking: gate.blocking,
        passed,
        waived: false,
        value: v,
        threshold: { minimum: gate.minimum },
        detail: { metric: gate.metric, observed: v, missing: v === null },
      };
    }
    case 'metric-max': {
      if (!gate.metric || gate.maximum === undefined) {
        throw new Error(`gate ${gate.name}: metric-max requires { metric, maximum }`);
      }
      const v = readLatestMetricNumeric(campaign.id, gate.metric);
      const passed = v !== null && v <= gate.maximum;
      return {
        name: gate.name,
        source: gate.source,
        blocking: gate.blocking,
        passed,
        waived: false,
        value: v,
        threshold: { maximum: gate.maximum },
        detail: { metric: gate.metric, observed: v, missing: v === null },
      };
    }
    case 'metric-ratio-min': {
      if (!gate.numeratorMetric || !gate.denominatorMetric || gate.minimum === undefined) {
        throw new Error(`gate ${gate.name}: metric-ratio-min requires { numeratorMetric, denominatorMetric, minimum }`);
      }
      const num = readLatestMetricNumeric(campaign.id, gate.numeratorMetric);
      const den = readLatestMetricNumeric(campaign.id, gate.denominatorMetric);
      // Missing numerator OR missing/zero denominator → fail (no silent pass).
      if (num === null || den === null || den === 0) {
        return {
          name: gate.name,
          source: gate.source,
          blocking: gate.blocking,
          passed: false,
          waived: false,
          value: null,
          threshold: { minimum: gate.minimum },
          detail: {
            numeratorMetric: gate.numeratorMetric,
            denominatorMetric: gate.denominatorMetric,
            numerator: num,
            denominator: den,
            reason: 'missing-or-zero-denominator',
          },
        };
      }
      const ratio = num / den;
      return {
        name: gate.name,
        source: gate.source,
        blocking: gate.blocking,
        passed: ratio >= gate.minimum,
        waived: false,
        value: ratio,
        threshold: { minimum: gate.minimum },
        detail: {
          numeratorMetric: gate.numeratorMetric,
          denominatorMetric: gate.denominatorMetric,
          numerator: num,
          denominator: den,
          ratio,
        },
      };
    }
  }
}

/**
 * Evaluate every gate of `campaignId`'s template, persist outcomes to
 * `campaign_gate_results` (overwriting prior rows), and return the verdict.
 *
 * No template found for `campaign.target` → returns `{passed:true, gates:[]}`.
 * That's the "no constraint" interpretation; choose target='full' explicitly
 * to opt back into the historical Principe-10 gate.
 */
export function evaluateAll(campaignId: string): GateEvaluation {
  const db = getDb();
  const campaign = db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get();
  if (!campaign) throw new Error(`campaign ${campaignId} not found`);
  const tpl = getTemplate(campaign.target);
  if (!tpl) {
    return { passed: true, gates: [], blockers: [], warnings: [] };
  }
  const retro = db
    .select()
    .from(campaignRetrospectives)
    .where(eq(campaignRetrospectives.campaignId, campaignId))
    .get();
  const outcomes: GateOutcome[] = [];
  for (const g of tpl.gates) {
    outcomes.push(evaluateOne(g, campaign, retro?.toolingFeedback ?? null));
  }
  const now = new Date().toISOString();
  // Idempotent: clear prior eval, write fresh.
  db.delete(campaignGateResults).where(eq(campaignGateResults.campaignId, campaignId)).run();
  if (outcomes.length > 0) {
    db.insert(campaignGateResults)
      .values(
        outcomes.map((o) => ({
          campaignId,
          gateName: o.name,
          valueJson: JSON.stringify(o.value),
          thresholdJson: JSON.stringify(o.threshold),
          passed: o.passed,
          blocking: o.blocking,
          waived: o.waived,
          detailJson: o.detail ? JSON.stringify(o.detail) : null,
          evaluatedAt: now,
        })),
      )
      .run();
  }
  const blockers = outcomes.filter((o) => o.blocking && !o.passed && !o.waived);
  const warnings = outcomes.filter((o) => !o.passed && (!o.blocking || o.waived));
  return { passed: blockers.length === 0, gates: outcomes, blockers, warnings };
}
