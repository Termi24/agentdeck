import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { projectMemory } from '@agentdeck/shared';
import { getDb } from '../db.js';
import type { EventBus } from '../event-bus.js';
import { appendEvent } from '../persistence.js';

const WriteBody = z.object({
  value: z.string(),
  updatedByAgentId: z.string().optional(),
  // Required to append a row in `events` (which has session_id NOT NULL).
  // Callers that don't have a session context (server-side bootstrap) can
  // omit it — we just skip the appendEvent in that case so the project
  // memory still gets written but the audit trail is project-only.
  sessionId: z.string().uuid().optional(),
});

export const registerProjectMemoryRoutes: FastifyPluginAsync<{ eventBus: EventBus }> = async (app, { eventBus }) => {
  app.get('/projects/:id/memory', async (request) => {
    const { id: projectId } = request.params as { id: string };
    const rows = getDb().select().from(projectMemory).where(eq(projectMemory.projectId, projectId)).all();
    return { entries: rows };
  });

  app.get('/projects/:id/memory/:key', async (request, reply) => {
    const { id: projectId, key } = request.params as { id: string; key: string };
    const row = getDb()
      .select()
      .from(projectMemory)
      .where(and(eq(projectMemory.projectId, projectId), eq(projectMemory.key, key)))
      .get();
    if (!row) return reply.notFound(`memory key "${key}" not found for project ${projectId}`);
    return row;
  });

  app.post('/projects/:id/memory/:key', async (request, reply) => {
    const { id: projectId, key } = request.params as { id: string; key: string };
    const parsed = WriteBody.safeParse(request.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const at = new Date().toISOString();
    const existing = getDb()
      .select()
      .from(projectMemory)
      .where(and(eq(projectMemory.projectId, projectId), eq(projectMemory.key, key)))
      .get();
    if (existing) {
      getDb()
        .update(projectMemory)
        .set({ value: parsed.data.value, updatedByAgentId: parsed.data.updatedByAgentId ?? null, updatedAt: at })
        .where(and(eq(projectMemory.projectId, projectId), eq(projectMemory.key, key)))
        .run();
    } else {
      getDb()
        .insert(projectMemory)
        .values({
          projectId,
          key,
          value: parsed.data.value,
          updatedByAgentId: parsed.data.updatedByAgentId ?? null,
          updatedAt: at,
        })
        .run();
    }
    const memEv = { type: 'memory.updated' as const, projectId, key, at, sessionId: parsed.data.sessionId ?? '' };
    if (parsed.data.sessionId) {
      // Persist to events only when the caller scoped the write to a session.
      // Skipping the append on session-less writes preserves the
      // events.session_id NOT NULL invariant (CLAUDE.md "Critical invariants").
      appendEvent({ type: 'memory.updated', projectId, key, at, sessionId: parsed.data.sessionId });
    }
    eventBus.emit(memEv);
    return reply.code(existing ? 200 : 201).send({ projectId, key, at });
  });

  app.delete('/projects/:id/memory/:key', async (request, reply) => {
    const { id: projectId, key } = request.params as { id: string; key: string };
    getDb()
      .delete(projectMemory)
      .where(and(eq(projectMemory.projectId, projectId), eq(projectMemory.key, key)))
      .run();
    return reply.code(204).send();
  });
};
