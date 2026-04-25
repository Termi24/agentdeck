import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq, or, asc } from 'drizzle-orm';
import { directMessages } from '@agentdeck/shared';
import { getDb } from '../db.js';
import type { EventBus } from '../event-bus.js';
import { appendEvent } from '../persistence.js';

const Body = z.object({
  fromAgentId: z.string().min(1),
  fromAgentName: z.string().min(1),
  toAgentId: z.string().min(1),
  content: z.string().min(1),
});

const Query = z.object({
  /** If provided, only returns DMs where this agent is sender OR recipient. */
  agentId: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(500).default(200),
});

export const registerDmRoutes: FastifyPluginAsync<{ eventBus: EventBus }> = async (app, { eventBus }) => {
  app.post('/sessions/:id/dm', async (request, reply) => {
    const { id: sessionId } = request.params as { id: string };
    const parsed = Body.safeParse(request.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const id = randomUUID();
    const at = new Date().toISOString();
    getDb().insert(directMessages).values({ id, sessionId, ...parsed.data, createdAt: at }).run();
    const event = {
      type: 'dm.message.posted' as const,
      sessionId,
      messageId: id,
      fromAgentId: parsed.data.fromAgentId,
      fromAgentName: parsed.data.fromAgentName,
      toAgentId: parsed.data.toAgentId,
      content: parsed.data.content,
      at,
    };
    appendEvent(event);
    eventBus.emit(event);
    return reply.code(201).send({ messageId: id, at });
  });

  app.get('/sessions/:id/dm', async (request, reply) => {
    const { id: sessionId } = request.params as { id: string };
    const parsed = Query.safeParse(request.query);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const whereClause = parsed.data.agentId
      ? and(
          eq(directMessages.sessionId, sessionId),
          or(
            eq(directMessages.toAgentId, parsed.data.agentId),
            eq(directMessages.fromAgentId, parsed.data.agentId),
          ),
        )
      : eq(directMessages.sessionId, sessionId);
    const rows = getDb()
      .select()
      .from(directMessages)
      .where(whereClause)
      .orderBy(asc(directMessages.createdAt))
      .limit(parsed.data.limit)
      .all();
    return { messages: rows };
  });
};
