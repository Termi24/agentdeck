import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { agents } from '@agentdeck/shared';
import type { EventBus } from '../event-bus.js';
import {
  appendEvent,
  getSession,
  insertAgent,
  listSessionAgents,
  listSessionToolCalls,
  listSessions,
  nextSeq,
} from '../persistence.js';
import { createSessionManager } from '../session-manager.js';
import { getDb } from '../db.js';
import { bumpBridgeHeartbeat } from '../services/bridge-watchdog.js';

const StartSessionBody = z.object({
  projectId: z.string().min(1),
  prompt: z.string().min(1),
  title: z.string().optional(),
  bridge: z.boolean().optional(),
  rootAgentName: z.string().optional(),
  rootAgentRole: z.string().optional(),
});

const ListSessionsQuery = z.object({
  limit: z.coerce.number().int().positive().max(1000).optional(),
});

export const registerSessionRoutes: FastifyPluginAsync<{ eventBus: EventBus }> = async (app, { eventBus }) => {
  const manager = createSessionManager(eventBus, { error: (msg) => app.log.error(msg as never) });

  app.get('/sessions', async (request, reply) => {
    const parsed = ListSessionsQuery.safeParse(request.query);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    return { sessions: listSessions(parsed.data.limit ?? 200) };
  });

  app.get('/sessions/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = getSession(id);
    if (!session) return reply.notFound(`session ${id} not found`);
    return session;
  });

  app.get('/sessions/:id/agents', async (request) => {
    const { id } = request.params as { id: string };
    return { agents: listSessionAgents(id) };
  });

  /**
   * Register a logical agent under a session. Used by the CLI bridge + external
   * orchestrators to make their sub-agents visible to agentdeck without going
   * through the SDK translator. Equivalent to what sdk-translator does when it
   * observes a Task tool firing.
   */
  const SpawnAgentBody = z.object({
    name: z.string().min(1),
    role: z.string().optional(),
    prompt: z.string().default(''),
    parentAgentId: z.string().uuid().nullable().optional(),
    model: z.string().optional(),
  });

  app.post('/sessions/:id/agents', async (request, reply) => {
    const { id: sessionId } = request.params as { id: string };
    const parsed = SpawnAgentBody.safeParse(request.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const agentId = randomUUID();
    const now = new Date().toISOString();
    insertAgent({
      id: agentId,
      sessionId,
      parentAgentId: parsed.data.parentAgentId ?? null,
      name: parsed.data.name,
      role: parsed.data.role ?? null,
      model: parsed.data.model ?? null,
      prompt: parsed.data.prompt,
      status: 'running',
      startedAt: now,
    });
    const ev = {
      type: 'agent.spawned' as const,
      sessionId,
      agentId,
      parentAgentId: parsed.data.parentAgentId ?? null,
      name: parsed.data.name,
      role: parsed.data.role ?? undefined,
      prompt: parsed.data.prompt,
      at: now,
      seq: nextSeq(sessionId),
    };
    appendEvent(ev);
    eventBus.emit(ev);
    return reply.code(201).send({ agentId });
  });

  /**
   * Finalize a logical agent registered via POST /agents. Sister endpoint:
   * marks the agent as completed/failed/cancelled.
   */
  const StopAgentBody = z.object({
    status: z.enum(['completed', 'failed', 'cancelled']).default('completed'),
    tokensIn: z.number().int().nonnegative().default(0),
    tokensOut: z.number().int().nonnegative().default(0),
  });

  const PatchAgentBody = z.object({
    name: z.string().min(1).max(100).optional(),
    role: z.string().min(1).max(100).optional(),
  });

  // Rename / re-role an existing agent. Used by set_agent_identity so the
  // bootstrap name (placeholder) can be replaced by a user-chosen value
  // mid-conversation, without having to re-create the bridge session.
  app.patch('/sessions/:id/agents/:agentId', async (request, reply) => {
    const { id: sessionId, agentId } = request.params as { id: string; agentId: string };
    const parsed = PatchAgentBody.safeParse(request.body ?? {});
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const exists = getDb()
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.sessionId, sessionId)))
      .get();
    if (!exists) return reply.notFound(`agent ${agentId} not found in session ${sessionId}`);
    const patch: { name?: string; role?: string } = {};
    if (parsed.data.name !== undefined) patch.name = parsed.data.name;
    if (parsed.data.role !== undefined) patch.role = parsed.data.role;
    if (Object.keys(patch).length === 0) return reply.badRequest('nothing to update');
    getDb().update(agents).set(patch).where(eq(agents.id, agentId)).run();
    return { ok: true, agentId, ...patch };
  });

  app.post('/sessions/:id/agents/:agentId/stop', async (request, reply) => {
    const { id: sessionId, agentId } = request.params as { id: string; agentId: string };
    const parsed = StopAgentBody.safeParse(request.body ?? {});
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const exists = getDb()
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.sessionId, sessionId)))
      .get();
    if (!exists) return reply.notFound(`agent ${agentId} not found in session ${sessionId}`);
    const ev = {
      type: 'agent.stopped' as const,
      sessionId,
      agentId,
      at: new Date().toISOString(),
      status: parsed.data.status,
      tokensIn: parsed.data.tokensIn,
      tokensOut: parsed.data.tokensOut,
      seq: nextSeq(sessionId),
    };
    appendEvent(ev);
    eventBus.emit(ev);
    return reply.code(204).send();
  });

  const ToolCallsQuery = z.object({
    status: z.enum(['running', 'completed', 'failed']).optional(),
    limit: z.coerce.number().int().positive().max(200).optional(),
  });

  app.get('/sessions/:id/tool-calls', async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = ToolCallsQuery.safeParse(request.query);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    return { toolCalls: listSessionToolCalls(id, parsed.data) };
  });

  app.post('/sessions', async (request, reply) => {
    const parsed = StartSessionBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.badRequest(parsed.error.message);
    }
    const result = await manager.start(parsed.data);
    return reply.code(201).send(result);
  });

  app.post('/sessions/:id/cancel', async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = getSession(id);
    if (!session) return reply.notFound(`session ${id} not found`);
    await manager.cancel(id);
    return reply.code(204).send();
  });

  app.post('/sessions/:id/heartbeat', async (request, reply) => {
    const { id } = request.params as { id: string };
    bumpBridgeHeartbeat(id);
    return reply.code(204).send();
  });
};
