import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq, gt } from 'drizzle-orm';
import { setTimeout as wait } from 'node:timers/promises';
import { userInputs } from '@agentdeck/shared';
import { getDb } from '../db.js';
import type { EventBus } from '../event-bus.js';
import { appendEvent } from '../persistence.js';

const Body = z.object({ content: z.string().min(1) });
const WaitQuery = z.object({
  timeoutMs: z.coerce.number().int().positive().max(600_000).default(120_000),
  agentId: z.string().optional(),
  agentName: z.string().optional(),
  prompt: z.string().optional(),
});

export const registerUserInputRoutes: FastifyPluginAsync<{ eventBus: EventBus }> = async (app, { eventBus }) => {
  app.post('/sessions/:id/user-input', async (request, reply) => {
    const { id: sessionId } = request.params as { id: string };
    const parsed = Body.safeParse(request.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const id = randomUUID();
    const at = new Date().toISOString();
    getDb().insert(userInputs).values({ id, sessionId, content: parsed.data.content, createdAt: at }).run();
    const event = { type: 'user.input.submitted' as const, sessionId, inputId: id, content: parsed.data.content, at };
    appendEvent(event);
    eventBus.emit(event);
    return reply.code(201).send({ inputId: id, at });
  });

  app.get('/sessions/:id/user-input', async (request) => {
    const { id: sessionId } = request.params as { id: string };
    const rows = getDb().select().from(userInputs).where(eq(userInputs.sessionId, sessionId)).all();
    return { inputs: rows };
  });

  app.post('/sessions/:id/user-input/wait', async (request, reply) => {
    const { id: sessionId } = request.params as { id: string };
    const parsed = WaitQuery.safeParse(request.query);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const { timeoutMs, agentId, agentName, prompt } = parsed.data;

    // Emit "awaiting" so the UI can show the red banner.
    const waitId = randomUUID();
    const startedAt = new Date().toISOString();
    const awaitingEvent = {
      type: 'user.input.awaiting' as const,
      sessionId,
      waitId,
      agentId: agentId ?? null,
      agentName: agentName ?? null,
      prompt: prompt ?? null,
      at: startedAt,
    };
    appendEvent(awaitingEvent);
    eventBus.emit(awaitingEvent);

    const finish = (inputId: string | null, timedOut: boolean) => {
      const resolvedEvent = {
        type: 'user.input.resolved' as const,
        sessionId,
        waitId,
        agentId: agentId ?? null,
        inputId,
        timedOut,
        at: new Date().toISOString(),
      };
      appendEvent(resolvedEvent);
      eventBus.emit(resolvedEvent);
    };

    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const next = getDb()
        .select()
        .from(userInputs)
        .where(and(eq(userInputs.sessionId, sessionId), eq(userInputs.consumed, false)))
        .limit(1)
        .get();
      if (next) {
        getDb().update(userInputs).set({ consumed: true }).where(eq(userInputs.id, next.id)).run();
        finish(next.id, false);
        return { inputId: next.id, content: next.content, at: next.createdAt };
      }
      await wait(500);
    }
    finish(null, true);
    return reply.code(204).send();
  });
  void gt;
};
