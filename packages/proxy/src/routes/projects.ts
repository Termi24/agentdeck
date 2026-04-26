import type { FastifyPluginAsync } from 'fastify';
import { listProjects, listSessions } from '../persistence.js';

/**
 * Hub-level read API. The dashboard at `/` renders one card per project; the
 * per-project page at `/projects/[id]` renders the underlying sessions.
 *
 * No project mutation endpoints — projects are purely a derived grouping over
 * sessions.projectId. To "delete" a project, finalize / delete its sessions.
 */
export const registerProjectRoutes: FastifyPluginAsync = async (app) => {
  app.get('/projects', async () => ({ projects: listProjects() }));

  app.get('/projects/:projectId/sessions', async (request) => {
    const { projectId } = request.params as { projectId: string };
    const all = listSessions(1000);
    return { sessions: all.filter((s) => s.projectId === projectId) };
  });
};
