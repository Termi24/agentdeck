import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { existsSync } from 'node:fs';
import { sandboxExec, sandboxRead, sandboxWrite, resolveSandboxPath } from '../services/sandbox.js';
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
      // Detect file existence BEFORE the write so the event op accurately
      // reflects create vs modify. Without this every write looked like a
      // 'modify' even on first creation, which broke activity-feed
      // reasoning ("did the agent overwrite or create?").
      const existedBefore = (() => {
        try {
          return existsSync(resolveSandboxPath(sessionId, parsed.data.path));
        } catch {
          return false;
        }
      })();
      const result = sandboxWrite(sessionId, parsed.data.path, parsed.data.content);
      const event = {
        type: 'sandbox.file.changed' as const,
        sessionId,
        path: parsed.data.path,
        op: (existedBefore ? 'modify' : 'create') as 'create' | 'modify',
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
      const ev = {
        type: 'sandbox.exec.completed' as const,
        sessionId,
        agentId: parsed.data.agentId ?? null,
        runId,
        command: parsed.data.command,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        timedOut: result.timedOut,
        at: new Date().toISOString(),
      };
      appendEvent(ev);
      eventBus.emit(ev);
      return { runId, ...result };
    } catch (err) {
      return reply.internalServerError(err instanceof Error ? err.message : String(err));
    }
  });
};
