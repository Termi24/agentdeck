import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { secrets } from '@agentdeck/shared';
import { getDb } from '../db.js';
import { decryptSecret, encryptSecret } from '../services/crypto-store.js';

const WriteBody = z.object({
  value: z.string(),
});

export const registerSecretsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/projects/:id/secrets', async (request) => {
    const { id: projectId } = request.params as { id: string };
    const rows = getDb()
      .select({ name: secrets.name, updatedAt: secrets.updatedAt })
      .from(secrets)
      .where(eq(secrets.projectId, projectId))
      .all();
    return { secrets: rows };
  });

  app.get('/projects/:id/secrets/:name', async (request, reply) => {
    const { id: projectId, name } = request.params as { id: string; name: string };
    const row = getDb()
      .select()
      .from(secrets)
      .where(and(eq(secrets.projectId, projectId), eq(secrets.name, name)))
      .get();
    if (!row) return reply.notFound(`secret ${name} not found for project ${projectId}`);
    try {
      const value = decryptSecret(row);
      return { name, value };
    } catch (err) {
      return reply.internalServerError(`decryption failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  app.post('/projects/:id/secrets/:name', async (request, reply) => {
    const { id: projectId, name } = request.params as { id: string; name: string };
    const parsed = WriteBody.safeParse(request.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const { valueEncrypted, iv, tag } = encryptSecret(parsed.data.value);
    const at = new Date().toISOString();
    const existing = getDb()
      .select()
      .from(secrets)
      .where(and(eq(secrets.projectId, projectId), eq(secrets.name, name)))
      .get();
    if (existing) {
      getDb()
        .update(secrets)
        .set({ valueEncrypted, iv, tag, updatedAt: at })
        .where(and(eq(secrets.projectId, projectId), eq(secrets.name, name)))
        .run();
    } else {
      getDb().insert(secrets).values({ projectId, name, valueEncrypted, iv, tag, updatedAt: at }).run();
    }
    return reply.code(existing ? 200 : 201).send({ name, updatedAt: at });
  });

  app.delete('/projects/:id/secrets/:name', async (request, reply) => {
    const { id: projectId, name } = request.params as { id: string; name: string };
    getDb().delete(secrets).where(and(eq(secrets.projectId, projectId), eq(secrets.name, name))).run();
    return reply.code(204).send();
  });
};
