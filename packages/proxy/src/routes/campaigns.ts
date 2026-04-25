import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { campaigns, campaignMetrics, campaignRetrospectives } from '@agentdeck/shared';
import { getDb } from '../db.js';

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
    const at = new Date().toISOString();
    getDb()
      .update(campaigns)
      .set({ status: parsed.data.status, endedAt: at })
      .where(eq(campaigns.id, id))
      .run();
    return { ok: true, status: parsed.data.status, endedAt: at };
  });
};
