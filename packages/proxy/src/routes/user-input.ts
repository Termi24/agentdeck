import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq, gt } from 'drizzle-orm';
import { setTimeout as wait } from 'node:timers/promises';
import { agentCancelRequests, userInputs } from '@agentdeck/shared';
import { getDb } from '../db.js';
import type { EventBus } from '../event-bus.js';
import { appendEvent } from '../persistence.js';
import { notifyAwaitingInput } from '../services/notify-user.js';

/**
 * Single-word negative responses that mean "halt the agent immediately".
 * Lowercased and trimmed before the test. When matched, the wait endpoint
 * also fires an agent.cancel for the awaiting agent so the CLI doesn't
 * loop "are you sure?" forever — Claude sees a CANCELLED-prefixed reply
 * and a check_cancellation that returns true.
 */
const STOP_KEYWORDS = new Set([
  'stop', 'non', 'no', 'abort', 'cancel', 'halt', 'quit', 'exit',
  'arrête', 'arrete', 'arrêt', 'arret', 'annule', 'annuler', 'stoppe',
]);

function isStopKeyword(content: string): boolean {
  const trimmed = content.trim().toLowerCase().replace(/[!.\s]+$/u, '');
  return STOP_KEYWORDS.has(trimmed);
}

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

    // Surface this outside the dashboard — user is often in the CLI when an
    // agent blocks on await_user_input, so a native toast saves them from
    // having to babysit the web UI.
    const dashboardUrl = process.env.AGENTDECK_DASHBOARD_URL ?? 'http://127.0.0.1:3000';
    notifyAwaitingInput({
      sessionId,
      agentId: agentId ?? null,
      agentName: agentName ?? null,
      prompt: prompt ?? null,
      dashboardUrl: `${dashboardUrl}/sessions/${sessionId}`,
    });

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
        // If the user's reply is a clear "stop / non / cancel" keyword, also
        // record a cancel request for the awaiting agent so the next
        // check_cancellation polls returns true. Avoids the infamous "agent
        // re-asks 'are you sure?' until the human ragequits the CLI" loop.
        const cancelled = agentId ? isStopKeyword(next.content) : false;
        if (cancelled && agentId) {
          const at = new Date().toISOString();
          const existing = getDb()
            .select()
            .from(agentCancelRequests)
            .where(and(eq(agentCancelRequests.agentId, agentId), eq(agentCancelRequests.sessionId, sessionId)))
            .get();
          if (!existing) {
            getDb()
              .insert(agentCancelRequests)
              .values({ agentId, sessionId, requestedAt: at, requestedByAgentId: null })
              .run();
          }
          const cancelEvent = {
            type: 'agent.cancel.requested' as const,
            sessionId,
            agentId,
            requestedByAgentId: null,
            at,
          };
          appendEvent(cancelEvent);
          eventBus.emit(cancelEvent);
        }
        return { inputId: next.id, content: next.content, at: next.createdAt, cancelled };
      }
      await wait(500);
    }
    finish(null, true);
    return reply.code(204).send();
  });
  void gt;
};
