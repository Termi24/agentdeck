import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq, gt, asc } from 'drizzle-orm';
import { channelMessages } from '@agentdeck/shared';
import { getDb } from '../db.js';
import type { EventBus } from '../event-bus.js';
import { appendEvent } from '../persistence.js';

const PostBody = z.object({
  fromAgentId: z.string().min(1),
  fromAgentName: z.string().min(1),
  content: z.string().min(1),
});

const ReadQuery = z.object({
  since: z.iso.datetime().optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export const registerChannelRoutes: FastifyPluginAsync<{ eventBus: EventBus }> = async (app, { eventBus }) => {
  app.post('/sessions/:id/channel', async (request, reply) => {
    const { id: sessionId } = request.params as { id: string };
    const parsed = PostBody.safeParse(request.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);

    const messageId = randomUUID();
    const at = new Date().toISOString();
    getDb()
      .insert(channelMessages)
      .values({ id: messageId, sessionId, ...parsed.data, createdAt: at })
      .run();

    const event = {
      type: 'channel.message.posted' as const,
      sessionId,
      messageId,
      fromAgentId: parsed.data.fromAgentId,
      fromAgentName: parsed.data.fromAgentName,
      content: parsed.data.content,
      at,
    };
    appendEvent(event);
    eventBus.emit(event);

    return reply.code(201).send({ messageId, at });
  });

  app.get('/sessions/:id/channel', async (request) => {
    const { id: sessionId } = request.params as { id: string };
    const { since, limit } = ReadQuery.parse(request.query);
    const rows = getDb()
      .select()
      .from(channelMessages)
      .where(since ? and(eq(channelMessages.sessionId, sessionId), gt(channelMessages.createdAt, since)) : eq(channelMessages.sessionId, sessionId))
      .orderBy(asc(channelMessages.createdAt))
      .limit(limit)
      .all();
    return { messages: rows };
  });
};
