import type { FastifyPluginAsync } from 'fastify';
import { existsSync, statSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { z } from 'zod';
import { validateClaim } from '../services/validate-claim.js';
import { inventoryRoutes, runInventorySelfCheck } from '../services/api-inventory.js';
import { inventorySchema } from '../services/inventory-schema.js';
import { inventoryEvents } from '../services/inventory-events.js';
import { inventoryMcpTools } from '../services/inventory-mcp-tools.js';
import { inventoryReactHooks } from '../services/inventory-react-hooks.js';

const ValidateBody = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  url: z.string().url(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.unknown().optional(),
  // Coerce numeric strings ("200") to int — some MCP clients stringify integers
  // when bridging through their tool-call shim, and rejecting that form forces
  // the caller to fight their own runtime.
  expectStatus: z.union([z.coerce.number().int(), z.enum(['2xx', '3xx', '4xx', '5xx'])]).optional(),
  expectJsonContains: z.record(z.string(), z.unknown()).optional(),
  expectBodyIncludes: z.string().optional(),
  timeoutMs: z.number().int().positive().max(120_000).optional(),
  maxRetries: z.number().int().min(0).max(10).optional(),
  maxBackoffMs: z.number().int().min(0).max(300_000).optional(),
  followRedirects: z.boolean().optional(),
  maxRedirects: z.number().int().min(0).max(20).optional(),
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
  /**
   * When true, omit the per-route list and return only aggregated counts
   * (per blueprint × method). Caller can then drill down with `filter`.
   * Cuts a 760-route inventory from ~70 KB to ~2 KB so MCP callers don't
   * blow their token budget on the first call.
   */
  summary: z.boolean().optional(),
  /** Restrict the returned `routes[]` to entries matching all given criteria. */
  filter: z
    .object({
      method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
      pathPrefix: z.string().min(1).optional(),
      blueprint: z.string().min(1).optional(),
    })
    .optional(),
  /** Slice into the (filtered) routes for paging — default no slicing. */
  limit: z.number().int().positive().max(2000).optional(),
  offset: z.number().int().min(0).optional(),
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

  // Bulk validate-claims — execute up to 100 claims with bounded
  // server-side parallelism. One MCP roundtrip instead of N. Crucial for
  // audit matrices (32-67 probes per round, 9 sub-agents per campaign).
  // Default parallelism = 8, capped at 20 to avoid hammering rate-limited
  // SaaS backends. Each result carries its own ok/status — partial
  // failures don't short-circuit the batch.
  const BulkValidateBody = z.object({
    claims: z.array(ValidateBody).min(1).max(100),
    parallelism: z.number().int().min(1).max(20).default(8),
  });

  app.post('/sessions/:id/validate-claims/bulk', async (request, reply) => {
    const parsed = BulkValidateBody.safeParse(request.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const { claims, parallelism } = parsed.data;
    const results: Array<unknown> = new Array(claims.length);
    let cursor = 0;
    const startedAt = Date.now();
    async function worker(): Promise<void> {
      for (;;) {
        const idx = cursor++;
        if (idx >= claims.length) return;
        try {
          results[idx] = await validateClaim(claims[idx]!);
        } catch (err) {
          results[idx] = {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(parallelism, claims.length) }, worker));
    return {
      results,
      total: claims.length,
      passed: results.filter((r) => (r as { ok?: boolean }).ok === true).length,
      durationMs: Date.now() - startedAt,
    };
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

      // Apply filter (method / pathPrefix / blueprint) if provided.
      const filter = parsed.data.filter;
      let routes = result.routes;
      if (filter) {
        routes = routes.filter((r) => {
          if (filter.method && r.method !== filter.method) return false;
          if (filter.pathPrefix && !r.path.startsWith(filter.pathPrefix)) return false;
          if (filter.blueprint && r.blueprint !== filter.blueprint) return false;
          return true;
        });
      }
      const totalAfterFilter = routes.length;

      // Apply paging on the filtered set.
      const offset = parsed.data.offset ?? 0;
      const limit = parsed.data.limit;
      const paged = limit !== undefined ? routes.slice(offset, offset + limit) : routes.slice(offset);

      // Build the per-blueprint × method aggregation. Always cheap to
      // include — gives the caller a one-shot view of where the surface
      // weight sits, even when they also asked for the full list.
      const aggBp: Record<string, Record<string, number>> = {};
      const aggMethod: Record<string, number> = {};
      for (const r of result.routes) {
        const bp = r.blueprint ?? '(none)';
        aggBp[bp] = aggBp[bp] ?? {};
        aggBp[bp][r.method] = (aggBp[bp][r.method] ?? 0) + 1;
        aggMethod[r.method] = (aggMethod[r.method] ?? 0) + 1;
      }
      const summary = {
        total: result.routes.length,
        totalAfterFilter,
        byMethod: aggMethod,
        byBlueprint: aggBp,
      };

      // `summary: true` = drop the heavy `routes[]` payload entirely so
      // MCP callers don't blow their token budget on the first call.
      if (parsed.data.summary) {
        return {
          framework: result.framework,
          rootPath: result.rootPath,
          scannedFiles: result.scannedFiles,
          summary,
          blueprintPrefixes: result.blueprintPrefixes,
          selfCheck: result.selfCheck,
        };
      }

      return {
        framework: result.framework,
        rootPath: result.rootPath,
        scannedFiles: result.scannedFiles,
        routes: paged,
        summary,
        blueprintPrefixes: result.blueprintPrefixes,
        selfCheck: result.selfCheck,
        ...(limit !== undefined || filter
          ? { paging: { offset, limit: limit ?? null, returned: paged.length, totalAfterFilter } }
          : {}),
      };
    } catch (err) {
      return reply.internalServerError(err instanceof Error ? err.message : String(err));
    }
  });

  // Cousin scanners to api_inventory — same UX, broader cartography:
  // schema (Drizzle tables), events (zod discriminated union),
  // mcp-tools (TOOL_DEFINITIONS array), react-hooks (use* exports).
  // Each accepts {rootPath} and returns a structured inventory.
  const SchemaInvBody = z.object({ rootPath: z.string().min(1) });

  app.post('/sessions/:id/schema-inventory', async (request, reply) => {
    const parsed = SchemaInvBody.safeParse(request.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const root = isAbsolute(parsed.data.rootPath) ? parsed.data.rootPath : resolve(parsed.data.rootPath);
    if (!existsSync(root) || !statSync(root).isDirectory()) {
      return reply.notFound(`rootPath does not exist or is not a directory: ${parsed.data.rootPath}`);
    }
    try {
      return inventorySchema(root);
    } catch (err) {
      return reply.internalServerError(err instanceof Error ? err.message : String(err));
    }
  });

  app.post('/sessions/:id/events-inventory', async (request, reply) => {
    const parsed = SchemaInvBody.safeParse(request.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const root = isAbsolute(parsed.data.rootPath) ? parsed.data.rootPath : resolve(parsed.data.rootPath);
    if (!existsSync(root) || !statSync(root).isDirectory()) {
      return reply.notFound(`rootPath does not exist or is not a directory: ${parsed.data.rootPath}`);
    }
    try {
      return inventoryEvents(root);
    } catch (err) {
      return reply.internalServerError(err instanceof Error ? err.message : String(err));
    }
  });

  app.post('/sessions/:id/mcp-tools-inventory', async (request, reply) => {
    const parsed = SchemaInvBody.safeParse(request.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const target = isAbsolute(parsed.data.rootPath) ? parsed.data.rootPath : resolve(parsed.data.rootPath);
    if (!existsSync(target)) {
      return reply.notFound(`path does not exist: ${parsed.data.rootPath}`);
    }
    try {
      return inventoryMcpTools(target);
    } catch (err) {
      return reply.internalServerError(err instanceof Error ? err.message : String(err));
    }
  });

  app.post('/sessions/:id/react-hooks-inventory', async (request, reply) => {
    const parsed = SchemaInvBody.safeParse(request.body);
    if (!parsed.success) return reply.badRequest(parsed.error.message);
    const root = isAbsolute(parsed.data.rootPath) ? parsed.data.rootPath : resolve(parsed.data.rootPath);
    if (!existsSync(root) || !statSync(root).isDirectory()) {
      return reply.notFound(`rootPath does not exist or is not a directory: ${parsed.data.rootPath}`);
    }
    try {
      return inventoryReactHooks(root);
    } catch (err) {
      return reply.internalServerError(err instanceof Error ? err.message : String(err));
    }
  });
};
