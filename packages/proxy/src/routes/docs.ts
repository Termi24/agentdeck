import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq, asc } from 'drizzle-orm';
import { docs } from '@agentdeck/shared';
import { getDb } from '../db.js';
import type { EventBus } from '../event-bus.js';
import { appendEvent, inTx } from '../persistence.js';

const PublishBody = z.object({
  path: z.string().min(1),
  content: z.string(),
  byAgentId: z.string().min(1),
});

export const registerDocsRoutes: FastifyPluginAsync<{ eventBus: EventBus }> = async (app, { eventBus }) => {
  app.post('/sessions/:id/docs', async (request, reply) => {
    const { id: sessionId } = request.params as { id: string };
    const parsed = PublishBody.safeParse(request.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);

    const existing = getDb()
      .select()
      .from(docs)
      .where(and(eq(docs.sessionId, sessionId), eq(docs.path, parsed.data.path)))
      .get();

    const now = new Date().toISOString();
    const id = existing?.id ?? randomUUID();
    // First write of this path → `doc.published`. Subsequent rewrites of
    // the same path → `doc.updated`. Decoupled so a naïve
    // `count(events.type='doc.published')` reducer matches `count(docs)`
    // without needing per-path dedup (the previous code emitted the same
    // type on insert and update, breaking that invariant — see
    // event-replay-auditor 2026-04-25).
    const event = existing
      ? {
          type: 'doc.updated' as const,
          sessionId,
          docId: id,
          path: parsed.data.path,
          byAgentId: parsed.data.byAgentId,
          at: now,
        }
      : {
          type: 'doc.published' as const,
          sessionId,
          docId: id,
          path: parsed.data.path,
          byAgentId: parsed.data.byAgentId,
          at: now,
        };
    inTx(() => {
      if (existing) {
        getDb()
          .update(docs)
          .set({ content: parsed.data.content, updatedByAgentId: parsed.data.byAgentId, updatedAt: now })
          .where(eq(docs.id, id))
          .run();
      } else {
        getDb()
          .insert(docs)
          .values({
            id,
            sessionId,
            path: parsed.data.path,
            content: parsed.data.content,
            updatedByAgentId: parsed.data.byAgentId,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }
      appendEvent(event);
    });
    eventBus.emit(event);

    return reply.code(existing ? 200 : 201).send({ docId: id, at: now });
  });

  app.get('/sessions/:id/docs', async (request) => {
    const { id: sessionId } = request.params as { id: string };
    const rows = getDb()
      .select({ id: docs.id, path: docs.path, updatedByAgentId: docs.updatedByAgentId, updatedAt: docs.updatedAt })
      .from(docs)
      .where(eq(docs.sessionId, sessionId))
      .orderBy(asc(docs.path))
      .all();
    return { docs: rows };
  });

  app.get('/sessions/:id/docs/*', async (request, reply) => {
    const { id: sessionId } = request.params as { id: string; '*': string };
    const docPath = (request.params as { '*': string })['*'];
    const row = getDb()
      .select()
      .from(docs)
      .where(and(eq(docs.sessionId, sessionId), eq(docs.path, docPath)))
      .get();
    if (!row) return reply.notFound(`doc ${docPath} not found`);
    return row;
  });
};
