import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { EventBus } from '../event-bus.js';
import {
  appendEvent,
  getAgentTask,
  insertAgentTask,
  listAgentTasks,
  updateAgentTask,
} from '../persistence.js';

const PlanBody = z.object({
  agentId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  plannedStart: z.iso.datetime(),
  plannedEnd: z.iso.datetime(),
  dependencies: z.array(z.string()).optional(),
});

const ProgressBody = z.object({
  taskId: z.string().min(1),
  progressPct: z.number().int().min(0).max(100),
  status: z.enum(['planned', 'in_progress', 'blocked', 'completed', 'cancelled']).optional(),
});

const CompleteBody = z.object({
  taskId: z.string().min(1),
  status: z.enum(['completed', 'cancelled']).default('completed'),
});

/**
 * Agent task planning surface. Backs the dashboard Gantt + calendar +
 * progress views. Three write endpoints are deliberately small so MCP tool
 * shims can map 1:1 onto them: plan / update / complete.
 */
export const registerAgentTaskRoutes: FastifyPluginAsync<{ eventBus: EventBus }> = async (app, { eventBus }) => {
  app.get('/sessions/:id/agent-tasks', async (request) => {
    const { id } = request.params as { id: string };
    return { tasks: listAgentTasks(id) };
  });

  app.post('/sessions/:id/agent-tasks', async (request, reply) => {
    const { id: sessionId } = request.params as { id: string };
    const parsed = PlanBody.safeParse(request.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const { agentId, title, description, plannedStart, plannedEnd, dependencies } = parsed.data;
    const taskId = randomUUID();
    const now = new Date().toISOString();
    insertAgentTask({
      id: taskId,
      sessionId,
      agentId,
      title,
      description: description ?? null,
      status: 'planned',
      progressPct: 0,
      plannedStart,
      plannedEnd,
      actualStart: null,
      actualEnd: null,
      dependenciesJson: dependencies && dependencies.length ? JSON.stringify(dependencies) : null,
      createdAt: now,
      updatedAt: now,
    });
    const event = {
      type: 'agent.task.planned' as const,
      sessionId,
      agentId,
      taskId,
      title,
      description: description ?? null,
      plannedStart,
      plannedEnd,
      dependencies,
      at: now,
    };
    appendEvent(event);
    eventBus.emit(event);
    return reply.code(201).send({ taskId });
  });

  app.post('/sessions/:id/agent-tasks/:taskId/progress', async (request, reply) => {
    const { id: sessionId, taskId } = request.params as { id: string; taskId: string };
    const parsed = ProgressBody.safeParse({ ...(request.body as object), taskId });
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const existing = getAgentTask(taskId);
    if (!existing || existing.sessionId !== sessionId) return reply.notFound(`task ${taskId} not found`);
    const now = new Date().toISOString();
    const nextStatus = parsed.data.status ?? (parsed.data.progressPct > 0 && existing.status === 'planned' ? 'in_progress' : existing.status);
    const actualStart = existing.actualStart ?? (nextStatus === 'in_progress' ? now : null);
    updateAgentTask(taskId, {
      progressPct: parsed.data.progressPct,
      status: nextStatus,
      actualStart,
      updatedAt: now,
    });
    const event = {
      type: 'agent.task.progressed' as const,
      sessionId,
      agentId: existing.agentId,
      taskId,
      progressPct: parsed.data.progressPct,
      status: nextStatus,
      at: now,
    };
    appendEvent(event);
    eventBus.emit(event);
    if (existing.status === 'planned' && nextStatus === 'in_progress') {
      const startedEvent = {
        type: 'agent.task.started' as const,
        sessionId,
        agentId: existing.agentId,
        taskId,
        at: now,
      };
      appendEvent(startedEvent);
      eventBus.emit(startedEvent);
    }
    return { ok: true };
  });

  app.post('/sessions/:id/agent-tasks/:taskId/complete', async (request, reply) => {
    const { id: sessionId, taskId } = request.params as { id: string; taskId: string };
    const parsed = CompleteBody.safeParse({ ...(request.body as object), taskId });
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const existing = getAgentTask(taskId);
    if (!existing || existing.sessionId !== sessionId) return reply.notFound(`task ${taskId} not found`);
    const now = new Date().toISOString();
    updateAgentTask(taskId, {
      status: parsed.data.status,
      progressPct: parsed.data.status === 'completed' ? 100 : existing.progressPct,
      actualEnd: now,
      updatedAt: now,
    });
    const event = {
      type: 'agent.task.completed' as const,
      sessionId,
      agentId: existing.agentId,
      taskId,
      status: parsed.data.status,
      at: now,
    };
    appendEvent(event);
    eventBus.emit(event);
    return { ok: true };
  });
};
