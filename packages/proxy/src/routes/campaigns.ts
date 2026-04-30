import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { campaignGateResults, campaignMetrics, campaignRetrospectives, campaigns } from '@agentdeck/shared';
import { getDb } from '../db.js';
import { evaluateAll, type GateOutcome } from '../services/gate-engine.js';
import { getTemplate, listTemplateNames } from '../services/test-targets-loader.js';

/**
 * Methodology gates (v0.0.10+).
 *
 * `end_campaign` delegates to `services/gate-engine.evaluateAll(campaignId)`
 * which evaluates every gate declared by the campaign's test-target template
 * (process/test-targets/<target>.json) and persists the verdict to
 * `campaign_gate_results`. Backward-compat shim below preserves the legacy
 * 422 `ui_coverage_violation` response shape when the only failing gate is
 * the historical Principe-10 UI-coverage gate (template `full` ships exactly
 * that gate, so unchanged callers get unchanged behavior).
 */

const StartBody = z.object({
  projectName: z.string().min(1),
  cliSource: z.string().min(1).default('claude-code'),
  notes: z.string().optional(),
  /** Test-target template name. Default `full` reproduces the historical Principe-10-only campaign. */
  target: z.string().min(1).default('full'),
});

const MetricBody = z.object({
  name: z.string().min(1),
  value: z.union([z.number(), z.string(), z.boolean()]),
  tags: z.record(z.string(), z.string()).optional(),
});

const RetroBody = z.object({
  whatWentWell: z.string().min(1),
  whatWentBadly: z.string().min(1),
  keyLearnings: z.string().min(1),
  toolingFeedback: z.string().min(1),
  recommendations: z.string().min(1),
});

const EndBody = z.object({
  status: z.enum(['completed', 'aborted', 'failed']).default('completed'),
});

export const registerCampaignsRoutes: FastifyPluginAsync = async (app) => {
  // List available test-target templates (CLI uses this to validate `--target`)
  app.get('/campaigns/templates', async () => {
    const names = listTemplateNames();
    const templates = names
      .map((n) => getTemplate(n))
      .filter((t): t is NonNullable<typeof t> => Boolean(t))
      .map((t) => ({
        target: t.target,
        description: t.description,
        specialists: t.specialists,
        runbooks: t.runbooks,
        gates: t.gates.map((g) => ({ name: g.name, blocking: g.blocking, source: g.source })),
      }));
    return { templates };
  });

  // Create a campaign
  app.post('/campaigns', async (request, reply) => {
    const parsed = StartBody.safeParse(request.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const tpl = getTemplate(parsed.data.target);
    if (!tpl) {
      return reply.code(400).send({
        error: 'unknown_target',
        message: `Unknown test-target "${parsed.data.target}". Available: ${listTemplateNames().join(', ') || '(none — process/test-targets/ is empty)'}`,
        target: parsed.data.target,
        availableTargets: listTemplateNames(),
      });
    }
    const id = `qa-${randomUUID().replace(/-/g, '').slice(0, 8)}`;
    const at = new Date().toISOString();
    getDb()
      .insert(campaigns)
      .values({
        id,
        projectName: parsed.data.projectName,
        cliSource: parsed.data.cliSource,
        notes: parsed.data.notes ?? null,
        target: parsed.data.target,
        templateName: tpl.target,
        status: 'running',
        startedAt: at,
      })
      .run();
    return reply.code(201).send({ campaignId: id, startedAt: at, target: parsed.data.target });
  });

  // List campaigns (paginated by createdAt desc)
  app.get('/campaigns', async () => {
    const rows = getDb().select().from(campaigns).orderBy(desc(campaigns.startedAt)).all();
    return { campaigns: rows };
  });

  // Get a campaign + its metrics + its retrospective + its gate results
  app.get('/campaigns/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const camp = getDb().select().from(campaigns).where(eq(campaigns.id, id)).get();
    if (!camp) return reply.notFound(`campaign ${id} not found`);
    const metrics = getDb()
      .select()
      .from(campaignMetrics)
      .where(eq(campaignMetrics.campaignId, id))
      .orderBy(campaignMetrics.recordedAt)
      .all();
    const retro = getDb()
      .select()
      .from(campaignRetrospectives)
      .where(eq(campaignRetrospectives.campaignId, id))
      .get();
    const gates = getDb()
      .select()
      .from(campaignGateResults)
      .where(eq(campaignGateResults.campaignId, id))
      .orderBy(campaignGateResults.evaluatedAt)
      .all();
    return { campaign: camp, metrics, retrospective: retro ?? null, gates };
  });

  // Record a metric
  app.post('/campaigns/:id/metrics', async (request, reply) => {
    const { id } = request.params as { id: string };
    const camp = getDb().select().from(campaigns).where(eq(campaigns.id, id)).get();
    if (!camp) return reply.notFound(`campaign ${id} not found`);
    const parsed = MetricBody.safeParse(request.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const now = new Date().toISOString();
    getDb()
      .insert(campaignMetrics)
      .values({
        campaignId: id,
        name: parsed.data.name,
        valueJson: JSON.stringify(parsed.data.value),
        tagsJson: parsed.data.tags ? JSON.stringify(parsed.data.tags) : null,
        recordedAt: now,
      })
      .run();
    return reply.code(201).send({ ok: true });
  });

  // Submit retrospective (idempotent — re-submitting overwrites)
  app.put('/campaigns/:id/retrospective', async (request, reply) => {
    const { id } = request.params as { id: string };
    const camp = getDb().select().from(campaigns).where(eq(campaigns.id, id)).get();
    if (!camp) return reply.notFound(`campaign ${id} not found`);
    const parsed = RetroBody.safeParse(request.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const now = new Date().toISOString();
    // upsert
    const existing = getDb()
      .select()
      .from(campaignRetrospectives)
      .where(eq(campaignRetrospectives.campaignId, id))
      .get();
    if (existing) {
      getDb()
        .update(campaignRetrospectives)
        .set({
          whatWentWell: parsed.data.whatWentWell,
          whatWentBadly: parsed.data.whatWentBadly,
          keyLearnings: parsed.data.keyLearnings,
          toolingFeedback: parsed.data.toolingFeedback,
          recommendations: parsed.data.recommendations,
          submittedAt: now,
        })
        .where(eq(campaignRetrospectives.campaignId, id))
        .run();
    } else {
      getDb()
        .insert(campaignRetrospectives)
        .values({
          campaignId: id,
          whatWentWell: parsed.data.whatWentWell,
          whatWentBadly: parsed.data.whatWentBadly,
          keyLearnings: parsed.data.keyLearnings,
          toolingFeedback: parsed.data.toolingFeedback,
          recommendations: parsed.data.recommendations,
          submittedAt: now,
        })
        .run();
    }
    return { ok: true, submittedAt: now };
  });

  // End campaign — REFUSE if no retrospective submitted (Chantier 4 gate)
  app.post('/campaigns/:id/end', async (request, reply) => {
    const { id } = request.params as { id: string };
    const camp = getDb().select().from(campaigns).where(eq(campaigns.id, id)).get();
    if (!camp) return reply.notFound(`campaign ${id} not found`);
    if (camp.status !== 'running') {
      return reply.badRequest(`campaign ${id} already ${camp.status}`);
    }
    const parsed = EndBody.safeParse(request.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const retro = getDb()
      .select()
      .from(campaignRetrospectives)
      .where(eq(campaignRetrospectives.campaignId, id))
      .get();
    if (!retro) {
      return reply.code(409).send({
        error: 'retrospective_required',
        message:
          'Cannot end campaign without a retrospective. Call PUT /campaigns/:id/retrospective first (or submit_campaign_retrospective from MCP).',
      });
    }

    // ── Gate engine ─────────────────────────────────────────────────────
    const verdict = evaluateAll(id);
    if (!verdict.passed) {
      // Backward-compat: when the only blocking failure is the legacy
      // Principe-10 gate, return the historical 422 `ui_coverage_violation`
      // shape so existing dashboards and the agentdeck-review skill keep
      // working untouched.
      const onlyPrincipe10 =
        verdict.blockers.length === verdict.gates.filter((g) => !g.passed && g.blocking && !g.waived).length &&
        verdict.blockers.every((g) => g.source === 'ui-coverage-principe-10');
      if (onlyPrincipe10 && verdict.blockers.length === 1) {
        return reply.code(422).send(buildLegacyPrinciple10Response(verdict.blockers[0]!));
      }
      return reply.code(422).send({
        error: 'gate_violation',
        message:
          `${verdict.blockers.length} blocking gate(s) failed. Fix the underlying metric(s) or add waiver lines ` +
          `("<GATE-NAME>-EXEMPT: <subject>: <reason>") to retrospective.toolingFeedback, then retry end_campaign.`,
        target: camp.target,
        blockers: verdict.blockers.map(serializeGate),
        warnings: verdict.warnings.map(serializeGate),
        gates: verdict.gates.map(serializeGate),
      });
    }

    const at = new Date().toISOString();
    getDb()
      .update(campaigns)
      .set({
        status: parsed.data.status,
        endedAt: at,
        gateResultsJson: JSON.stringify(verdict.gates.map(serializeGate)),
      })
      .where(eq(campaigns.id, id))
      .run();

    // Legacy shape: keep `uiCoverage` summary on success when the Principe-10
    // gate ran (template `full` and template `ui` ship it). Dashboards rely
    // on this surface today.
    const principe10 = verdict.gates.find((g) => g.source === 'ui-coverage-principe-10');
    const uiCoverage = principe10 ? buildLegacyPrinciple10Summary(principe10) : undefined;

    return {
      ok: true,
      status: parsed.data.status,
      endedAt: at,
      target: camp.target,
      gates: verdict.gates.map(serializeGate),
      warnings: verdict.warnings.map(serializeGate),
      ...(uiCoverage ? { uiCoverage } : {}),
    };
  });
};

// ── Helpers — backward-compat shims for legacy Principe-10 response shapes ──

interface LegacyPersona {
  agentId: string;
  agentName: string;
  role: string | null;
  sessionId: string;
  uiCalls: number;
  apiCalls: number;
  ratio: number | null;
  totalRelevantCalls?: number;
}

interface LegacyDetail {
  violators?: LegacyPersona[];
  warnings?: LegacyPersona[];
  all?: LegacyPersona[];
}

function serializeGate(g: GateOutcome) {
  return {
    name: g.name,
    source: g.source,
    blocking: g.blocking,
    passed: g.passed,
    waived: g.waived,
    value: g.value,
    threshold: g.threshold,
    detail: g.detail,
  };
}

function buildLegacyPrinciple10Response(blocker: GateOutcome) {
  const t = blocker.threshold as { hardFloor?: number; warnFloor?: number };
  const hardFloor = t.hardFloor ?? 0.5;
  const warnFloor = t.warnFloor ?? 0.7;
  const detail = (blocker.detail ?? {}) as LegacyDetail;
  const violators = detail.violators ?? [];
  return {
    error: 'ui_coverage_violation',
    message:
      `Methodology Principe 10 violation: ${violators.length} persona(s) below ${Math.round(hardFloor * 100)}% UI coverage and not waived. ` +
      `Add a "UI-EXEMPT: <agent name>: <reason>" line per persona to retrospective.toolingFeedback, OR re-run the persona via browser_* tools, then retry end_campaign.`,
    floor: hardFloor,
    warnFloor: warnFloor,
    violators: violators.map((p) => ({
      agentId: p.agentId,
      agentName: p.agentName,
      role: p.role,
      sessionId: p.sessionId,
      uiCalls: p.uiCalls,
      apiCalls: p.apiCalls,
      ratio: p.ratio,
    })),
  };
}

function buildLegacyPrinciple10Summary(g: GateOutcome) {
  const t = g.threshold as { hardFloor?: number; warnFloor?: number };
  const detail = (g.detail ?? {}) as LegacyDetail;
  const all = detail.all ?? [];
  const warnings = detail.warnings ?? [];
  return {
    floor: t.hardFloor ?? 0.5,
    warnFloor: t.warnFloor ?? 0.7,
    personasEvaluated: all.length,
    warnings: warnings.map((p) => ({ agentName: p.agentName, ratio: p.ratio, uiCalls: p.uiCalls, apiCalls: p.apiCalls })),
    all: all.map((p) => ({
      agentName: p.agentName,
      ratio: p.ratio,
      uiCalls: p.uiCalls,
      apiCalls: p.apiCalls,
      totalRelevantCalls: p.totalRelevantCalls,
    })),
  };
}
