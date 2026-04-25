import type { FastifyPluginAsync } from 'fastify';
import { getProcedure, loadProcedures } from '../services/procedures-loader.js';

export const registerProceduresRoutes: FastifyPluginAsync = async (app) => {
  app.get('/procedures', async () => {
    const procs = loadProcedures();
    return {
      procedures: procs.map((p) => ({
        name: p.name,
        format: p.format,
        description: p.description,
      })),
    };
  });

  app.get('/procedures/:name', async (request, reply) => {
    const { name } = request.params as { name: string };
    const proc = getProcedure(name);
    if (!proc) return reply.notFound(`procedure ${name} not found`);
    return proc;
  });
};
