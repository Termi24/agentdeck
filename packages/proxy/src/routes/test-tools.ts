import type { FastifyPluginAsync } from 'fastify';
import { existsSync, statSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { z } from 'zod';
import { validateClaim } from '../services/validate-claim.js';
import { inventoryRoutes, runInventorySelfCheck } from '../services/api-inventory.js';

const ValidateBody = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  url: z.string().url(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.unknown().optional(),
  expectStatus: z.union([z.number().int(), z.enum(['2xx', '3xx', '4xx', '5xx'])]).optional(),
  expectJsonContains: z.record(z.string(), z.unknown()).optional(),
  expectBodyIncludes: z.string().optional(),
  timeoutMs: z.number().int().positive().max(120_000).optional(),
  maxRetries: z.number().int().min(0).max(10).optional(),
  maxBackoffMs: z.number().int().min(0).max(300_000).optional(),
});

const InventoryBody = z.object({
  framework: z.enum(['flask', 'express', 'fastapi', 'fastify']),
  rootPath: z.string().min(1),
  selfCheck: z
    .object({
      baseUrl: z.string().url(),
      sampleSize: z.number().int().positive().max(50).optional(),
      timeoutMs: z.number().int().positive().max(60_000).optional(),
      threshold: z.number().min(0).max(1).optional(),
    })
    .optional(),
});

export const registerTestToolsRoutes: FastifyPluginAsync = async (app) => {
  app.post('/sessions/:id/validate-claim', async (request, reply) => {
    const parsed = ValidateBody.safeParse(request.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    try {
      const result = await validateClaim(parsed.data);
      return result;
    } catch (err) {
      return reply.internalServerError(err instanceof Error ? err.message : String(err));
    }
  });

  app.post('/sessions/:id/api-inventory', async (request, reply) => {
    const parsed = InventoryBody.safeParse(request.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const root = isAbsolute(parsed.data.rootPath) ? parsed.data.rootPath : resolve(parsed.data.rootPath);
    // Refuse to scan a missing or non-directory rootPath. Without this, a
    // typo'd path returns `{scannedFiles:0, routes:[]}` with HTTP 200, and
    // every coverage matrix built on top of it is silently empty (the
    // "IndusForge meta-bug": 22 false positive bugs in a prior campaign).
    if (!existsSync(root)) {
      return reply.notFound(`rootPath does not exist: ${parsed.data.rootPath}`);
    }
    if (!statSync(root).isDirectory()) {
      return reply.badRequest(`rootPath is not a directory: ${parsed.data.rootPath}`);
    }
    try {
      const result = inventoryRoutes(parsed.data.framework, root);
      if (parsed.data.selfCheck) {
        result.selfCheck = await runInventorySelfCheck(result, parsed.data.selfCheck);
      }
      return result;
    } catch (err) {
      return reply.internalServerError(err instanceof Error ? err.message : String(err));
    }
  });
};
