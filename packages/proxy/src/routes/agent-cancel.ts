import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { agentCancelRequests, agents } from '@agentdeck/shared';
import { getDb } from '../db.js';
import type { EventBus } from '../event-bus.js';
import { appendEvent } from '../persistence.js';

const Body = z.object({ requestedByAgentId: z.string().optional() });

export const registerAgentCancelRoutes: FastifyPluginAsync<{ eventBus: EventBus }> = async (app, { eventBus }) => {
  app.post('/sessions/:sid/agents/:aid/cancel', async (request, reply) => {
    const { sid: sessionId, aid: agentId } = request.params as { sid: string; aid: string };
    const parsed = Body.safeParse(request.body ?? {});
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const agentRow = getDb()
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.sessionId, sessionId)))
      .get();
    if (!agentRow) return reply.notFound(`agent ${agentId} not found in session ${sessionId}`);
    const at = new Date().toISOString();
    const existing = getDb()
      .select()
      .from(agentCancelRequests)
      .where(
        and(
          eq(agentCancelRequests.agentId, agentId),
          eq(agentCancelRequests.sessionId, sessionId),
        ),
      )
      .get();
    if (!existing) {
      getDb()
        .insert(agentCancelRequests)
        .values({
          agentId,
          sessionId,
          requestedAt: at,
          requestedByAgentId: parsed.data.requestedByAgentId ?? null,
        })
        .run();
    }
    const event = {
      type: 'agent.cancel.requested' as const,
      sessionId,
      agentId,
      requestedByAgentId: parsed.data.requestedByAgentId ?? null,
      at,
    };
    appendEvent(event);
    eventBus.emit(event);
    return reply.code(201).send({ agentId, at });
  });

  app.get('/sessions/:sid/agents/:aid/cancel', async (request) => {
    const { sid: sessionId, aid: agentId } = request.params as { sid: string; aid: string };
    const existing = getDb()
      .select()
      .from(agentCancelRequests)
      .where(
        and(
          eq(agentCancelRequests.agentId, agentId),
          eq(agentCancelRequests.sessionId, sessionId),
        ),
      )
      .get();
    return { cancelled: !!existing, requestedAt: existing?.requestedAt ?? null };
  });
};
