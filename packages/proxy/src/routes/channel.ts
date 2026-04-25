import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq, gt, asc } from 'drizzle-orm';
import { channelMessages } from '@agentdeck/shared';
import { getDb } from '../db.js';
import type { EventBus } from '../event-bus.js';
import { appendEvent, inTx, inBulkTx } from '../persistence.js';

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
    const event = {
      type: 'channel.message.posted' as const,
      sessionId,
      messageId,
      fromAgentId: parsed.data.fromAgentId,
      fromAgentName: parsed.data.fromAgentName,
      content: parsed.data.content,
      at,
    };
    inTx(() => {
      getDb()
        .insert(channelMessages)
        .values({ id: messageId, sessionId, ...parsed.data, createdAt: at })
        .run();
      appendEvent(event);
    });
    eventBus.emit(event);

    return reply.code(201).send({ messageId, at });
  });

  // Bulk channel insert — accepts {messages: [{fromAgentId, fromAgentName, content}, ...]}
  // and persists them in one transaction with deferred FK checking. ~200×
  // faster than N individual POSTs on 1000+ row payloads, and atomic on crash.
  const PostBulkBody = z.object({
    messages: z.array(PostBody).min(1).max(5000),
  });

  app.post('/sessions/:id/channel/bulk', async (request, reply) => {
    const { id: sessionId } = request.params as { id: string };
    const parsed = PostBulkBody.safeParse(request.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const items = parsed.data.messages.map((m) => {
      const messageId = randomUUID();
      const at = new Date().toISOString();
      return { messageId, at, msg: m };
    });
    const events = items.map(({ messageId, at, msg }) => ({
      type: 'channel.message.posted' as const,
      sessionId,
      messageId,
      fromAgentId: msg.fromAgentId,
      fromAgentName: msg.fromAgentName,
      content: msg.content,
      at,
    }));
    inBulkTx(() => {
      const db = getDb();
      for (const it of items) {
        db.insert(channelMessages)
          .values({
            id: it.messageId,
            sessionId,
            fromAgentId: it.msg.fromAgentId,
            fromAgentName: it.msg.fromAgentName,
            content: it.msg.content,
            createdAt: it.at,
          })
          .run();
      }
      for (const event of events) appendEvent(event);
    });
    for (const event of events) eventBus.emit(event);
    return reply.code(201).send({ inserted: items.length });
  });

  app.get('/sessions/:id/channel', async (request, reply) => {
    const { id: sessionId } = request.params as { id: string };
    // Use safeParse so a malformed `since=` (e.g. caller passing a
    // non-ISO string) returns a clean 400 instead of bubbling up as a
    // 500 with the zod stack trace in the body.
    const parsed = ReadQuery.safeParse(request.query);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const { since, limit } = parsed.data;
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
