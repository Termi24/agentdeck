import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq, desc, sql } from 'drizzle-orm';
import { agents, campaigns, campaignMetrics, campaignRetrospectives, sessions, toolCalls } from '@agentdeck/shared';
import { getDb } from '../db.js';

/**
 * Methodology Principe 10 — UI-only en Phase 4 personas.
 *
 * Computes per-persona uiCoverageRatio = browser_* / (browser_* + API direct)
 * and surfaces the result on end_campaign. Blocks the campaign close when
 * any non-orchestrator persona has < 50 % UI coverage AND the retrospective
 * does not list an explicit waiver.
 *
 * Waivers live in retrospective.toolingFeedback as lines matching:
 *   UI-EXEMPT: <persona name>: <reason>
 * Multiple waivers are allowed (one per line).
 */
const UI_COVERAGE_HARD_FLOOR = 0.5;
const UI_COVERAGE_WARN_FLOOR = 0.7;
const MIN_TOOL_CALLS_FOR_RATIO = 5; // below this we don't have enough data to judge
const EXCLUDED_ROLES = new Set(['orchestrator', 'root', 'bridge', 'claim-validator', 'skill']);

interface PersonaCoverage {
  agentId: string;
  agentName: string;
  role: string | null;
  sessionId: string;
  uiCalls: number;
  apiCalls: number;
  totalRelevantCalls: number;
  ratio: number | null;
}

function isApiBypassCall(toolName: string, inputJson: string | null): boolean {
  if (toolName === 'validate_claim' || toolName === 'validate_claims_bulk') return true;
  if (toolName === 'sandbox_exec' && inputJson) {
    try {
      const parsed = JSON.parse(inputJson) as { command?: string };
      const cmd = (parsed.command ?? '').toLowerCase();
      if (/\b(curl|wget|httpie|http\s)/.test(cmd)) return true;
    } catch {
      // not json → ignore
    }
  }
  return false;
}

function computePersonaCoverage(campaignProjectName: string): PersonaCoverage[] {
  const db = getDb();
  // Sessions of this campaign = sessions whose projectId matches projectName.
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
    .where(eq(sessions.projectId, campaignProjectName))
    .all();

  const out: PersonaCoverage[] = [];
  for (const p of personaRows) {
    if (p.parentAgentId === null) continue; // skip root / bridge / orchestrator-as-root
    const role = (p.role ?? '').toLowerCase();
    if (EXCLUDED_ROLES.has(role)) continue;

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

function parseWaivers(toolingFeedback: string): Set<string> {
  const out = new Set<string>();
  for (const line of toolingFeedback.split(/\r?\n/)) {
    const m = /^UI-EXEMPT:\s*([^:]+?)\s*:\s*(.+)$/.exec(line.trim());
    if (m && m[1]) out.add(m[1].trim().toLowerCase());
  }
  return out;
}

const StartBody = z.object({
  projectName: z.string().min(1),
  cliSource: z.string().min(1).default('claude-code'),
  notes: z.string().optional(),
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
  // Create a campaign
  app.post('/campaigns', async (request, reply) => {
    const parsed = StartBody.safeParse(request.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const id = `qa-${randomUUID().replace(/-/g, '').slice(0, 8)}`;
    const at = new Date().toISOString();
    getDb()
      .insert(campaigns)
      .values({
        id,
        projectName: parsed.data.projectName,
        cliSource: parsed.data.cliSource,
        notes: parsed.data.notes ?? null,
        status: 'running',
        startedAt: at,
      })
      .run();
    return reply.code(201).send({ campaignId: id, startedAt: at });
  });

  // List campaigns (paginated by createdAt desc)
  app.get('/campaigns', async () => {
    const rows = getDb().select().from(campaigns).orderBy(desc(campaigns.startedAt)).all();
    return { campaigns: rows };
  });

  // Get a campaign + its metrics + its retrospective
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
    return { campaign: camp, metrics, retrospective: retro ?? null };
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

    // ── Principe 10 gate ────────────────────────────────────────────────
    const coverage = computePersonaCoverage(camp.projectName);
    const waivers = parseWaivers(retro.toolingFeedback);
    const violators: PersonaCoverage[] = [];
    const warned: PersonaCoverage[] = [];
    for (const p of coverage) {
      if (p.totalRelevantCalls < MIN_TOOL_CALLS_FOR_RATIO) continue; // not enough data
      if (p.ratio === null) continue;
      const waived = waivers.has(p.agentName.toLowerCase());
      if (p.ratio < UI_COVERAGE_HARD_FLOOR && !waived) {
        violators.push(p);
      } else if (p.ratio < UI_COVERAGE_WARN_FLOOR && !waived) {
        warned.push(p);
      }
    }
    if (violators.length > 0) {
      return reply.code(422).send({
        error: 'ui_coverage_violation',
        message:
          `Methodology Principe 10 violation: ${violators.length} persona(s) below ${Math.round(UI_COVERAGE_HARD_FLOOR * 100)}% UI coverage and not waived. ` +
          `Add a "UI-EXEMPT: <agent name>: <reason>" line per persona to retrospective.toolingFeedback, OR re-run the persona via browser_* tools, then retry end_campaign.`,
        floor: UI_COVERAGE_HARD_FLOOR,
        warnFloor: UI_COVERAGE_WARN_FLOOR,
        violators: violators.map((p) => ({
          agentId: p.agentId,
          agentName: p.agentName,
          role: p.role,
          sessionId: p.sessionId,
          uiCalls: p.uiCalls,
          apiCalls: p.apiCalls,
          ratio: p.ratio,
        })),
      });
    }

    const at = new Date().toISOString();
    getDb()
      .update(campaigns)
      .set({ status: parsed.data.status, endedAt: at })
      .where(eq(campaigns.id, id))
      .run();
    return {
      ok: true,
      status: parsed.data.status,
      endedAt: at,
      uiCoverage: {
        floor: UI_COVERAGE_HARD_FLOOR,
        warnFloor: UI_COVERAGE_WARN_FLOOR,
        personasEvaluated: coverage.length,
        warnings: warned.map((p) => ({ agentName: p.agentName, ratio: p.ratio, uiCalls: p.uiCalls, apiCalls: p.apiCalls })),
        all: coverage.map((p) => ({ agentName: p.agentName, ratio: p.ratio, uiCalls: p.uiCalls, apiCalls: p.apiCalls, totalRelevantCalls: p.totalRelevantCalls })),
      },
    };
  });
};
