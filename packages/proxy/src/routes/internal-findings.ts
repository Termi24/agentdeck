/**
 * REST surface for the internal bug tracker (FB-10).
 *
 *   GET    /internal/findings           — list, filterable + sortable
 *   GET    /internal/findings/summary   — counters per status / severity
 *   PATCH  /internal/findings/:id       — update status / fixedInVersion
 *   DELETE /internal/findings/:id       — purge a single finding
 *
 * No auth — same posture as every other agentdeck route. Localhost only.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { internalFindings } from '@agentdeck/shared';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '../db.js';

const ListQuery = z.object({
  status: z.enum(['open', 'triaged', 'fixed', 'wontfix', 'all']).default('all'),
  severity: z.enum(['info', 'warn', 'error', 'critical', 'all']).default('all'),
  source: z.enum(['proxy', 'mcp', 'browser', 'watchdog', 'ui', 'other', 'all']).default('all'),
  limit: z.coerce.number().int().positive().max(500).default(200),
});

const PatchBody = z.object({
  status: z.enum(['open', 'triaged', 'fixed', 'wontfix']).optional(),
  fixedInVersion: z.string().nullable().optional(),
});

export const registerInternalFindingsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/internal/findings', async (request, reply) => {
    const parsed = ListQuery.safeParse(request.query);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const q = parsed.data;
    const db = getDb();

    let where = sql`1 = 1`;
    if (q.status !== 'all') where = sql`${where} AND ${internalFindings.status} = ${q.status}`;
    if (q.severity !== 'all') where = sql`${where} AND ${internalFindings.severity} = ${q.severity}`;
    if (q.source !== 'all') where = sql`${where} AND ${internalFindings.source} = ${q.source}`;

    const rows = db
      .select()
      .from(internalFindings)
      .where(where)
      .orderBy(sql`${internalFindings.lastSeenAt} DESC`)
      .limit(q.limit)
      .all();

    return { findings: rows };
  });

  app.get('/internal/findings/summary', async () => {
    const db = getDb();
    const counts = db
      .select({
        status: internalFindings.status,
        severity: internalFindings.severity,
        n: sql<number>`count(*)`,
      })
      .from(internalFindings)
      .groupBy(internalFindings.status, internalFindings.severity)
      .all();

    type StatusKey = 'open' | 'triaged' | 'fixed' | 'wontfix';
    type SeverityKey = 'info' | 'warn' | 'error' | 'critical';
    const byStatus: Record<StatusKey, number> = { open: 0, triaged: 0, fixed: 0, wontfix: 0 };
    const bySeverity: Record<SeverityKey, number> = { info: 0, warn: 0, error: 0, critical: 0 };
    let total = 0;
    let openHighSeverity = 0;
    for (const row of counts) {
      const n = Number(row.n);
      total += n;
      byStatus[row.status as StatusKey] += n;
      bySeverity[row.severity as SeverityKey] += n;
      if (row.status === 'open' && (row.severity === 'error' || row.severity === 'critical')) {
        openHighSeverity += n;
      }
    }
    return { total, ...byStatus, bySeverity, openHighSeverity };
  });

  app.patch('/internal/findings/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = PatchBody.safeParse(request.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const db = getDb();
    const existing = db
      .select({ id: internalFindings.id })
      .from(internalFindings)
      .where(eq(internalFindings.id, id))
      .get();
    if (!existing) return reply.notFound(`finding ${id} not found`);
    const patch: Record<string, unknown> = {};
    if (parsed.data.status !== undefined) patch.status = parsed.data.status;
    if (parsed.data.fixedInVersion !== undefined) patch.fixedInVersion = parsed.data.fixedInVersion;
    if (Object.keys(patch).length === 0) return reply.code(400).send({ error: 'no fields to patch' });
    db.update(internalFindings).set(patch).where(eq(internalFindings.id, id)).run();
    return { ok: true };
  });

  app.delete('/internal/findings/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();
    const existing = db
      .select({ id: internalFindings.id })
      .from(internalFindings)
      .where(eq(internalFindings.id, id))
      .get();
    if (!existing) return reply.notFound(`finding ${id} not found`);
    db.delete(internalFindings).where(eq(internalFindings.id, id)).run();
    return { ok: true };
  });
};
