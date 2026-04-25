import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, asc } from 'drizzle-orm';
import { testResults } from '@agentdeck/shared';
import { getDb } from '../db.js';
import type { EventBus } from '../event-bus.js';
import { appendEvent } from '../persistence.js';

const Body = z.object({
  agentId: z.string().min(1),
  suite: z.string().min(1),
  caseName: z.string().min(1),
  status: z.enum(['passed', 'failed', 'skipped']),
  message: z.string().optional(),
  evidence: z.unknown().optional(),
});

export const registerTestResultsRoutes: FastifyPluginAsync<{ eventBus: EventBus }> = async (app, { eventBus }) => {
  app.post('/sessions/:id/test-results', async (request, reply) => {
    const { id: sessionId } = request.params as { id: string };
    const parsed = Body.safeParse(request.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const id = randomUUID();
    const at = new Date().toISOString();
    getDb()
      .insert(testResults)
      .values({
        id,
        sessionId,
        agentId: parsed.data.agentId,
        suite: parsed.data.suite,
        caseName: parsed.data.caseName,
        status: parsed.data.status,
        message: parsed.data.message ?? null,
        evidence: parsed.data.evidence ?? null,
        createdAt: at,
      })
      .run();
    const event = {
      type: 'test.result.reported' as const,
      sessionId,
      resultId: id,
      agentId: parsed.data.agentId,
      suite: parsed.data.suite,
      caseName: parsed.data.caseName,
      status: parsed.data.status,
      message: parsed.data.message ?? null,
      at,
    };
    appendEvent(event);
    eventBus.emit(event);
    return reply.code(201).send({ resultId: id, at });
  });

  app.get('/sessions/:id/test-results', async (request) => {
    const { id: sessionId } = request.params as { id: string };
    const rows = getDb()
      .select()
      .from(testResults)
      .where(eq(testResults.sessionId, sessionId))
      .orderBy(asc(testResults.createdAt))
      .all();
    return { results: rows };
  });
};
