import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { sandboxExec, sandboxRead, sandboxWrite } from '../services/sandbox.js';
import type { EventBus } from '../event-bus.js';
import { appendEvent } from '../persistence.js';
import { getDb } from '../db.js';
import { execRuns } from '@agentdeck/shared';

const WriteBody = z.object({
  path: z.string().min(1),
  content: z.string(),
});

const ReadQuery = z.object({ path: z.string().min(1) });

const ExecBody = z.object({
  command: z.string().min(1),
  timeoutMs: z.number().int().positive().max(600_000).default(120_000),
  agentId: z.string().optional(),
});

export const registerSandboxRoutes: FastifyPluginAsync<{ eventBus: EventBus }> = async (app, { eventBus }) => {
  app.post('/sessions/:id/sandbox/write', async (request, reply) => {
    const { id: sessionId } = request.params as { id: string };
    const parsed = WriteBody.safeParse(request.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    try {
      const result = sandboxWrite(sessionId, parsed.data.path, parsed.data.content);
      const event = {
        type: 'sandbox.file.changed' as const,
        sessionId,
        path: parsed.data.path,
        op: 'modify' as const,
        at: new Date().toISOString(),
      };
      appendEvent(event);
      eventBus.emit(event);
      return reply.code(200).send(result);
    } catch (err) {
      return reply.badRequest(err instanceof Error ? err.message : String(err));
    }
  });

  app.get('/sessions/:id/sandbox/read', async (request, reply) => {
    const { id: sessionId } = request.params as { id: string };
    const parsed = ReadQuery.safeParse(request.query);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    try {
      const content = sandboxRead(sessionId, parsed.data.path);
      return { path: parsed.data.path, content };
    } catch (err) {
      return reply.notFound(err instanceof Error ? err.message : String(err));
    }
  });

  app.post('/sessions/:id/sandbox/exec', async (request, reply) => {
    const { id: sessionId } = request.params as { id: string };
    const parsed = ExecBody.safeParse(request.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    try {
      const result = await sandboxExec(sessionId, parsed.data.command, parsed.data.timeoutMs);
      const runId = randomUUID();
      getDb()
        .insert(execRuns)
        .values({
          id: runId,
          sessionId,
          agentId: parsed.data.agentId ?? null,
          command: parsed.data.command,
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          durationMs: result.durationMs,
          timedOut: result.timedOut,
        })
        .run();
      return { runId, ...result };
    } catch (err) {
      return reply.internalServerError(err instanceof Error ? err.message : String(err));
    }
  });
};
