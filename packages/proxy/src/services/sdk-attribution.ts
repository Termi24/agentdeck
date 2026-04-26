import type { FastifyInstance } from 'fastify';
import { getToolUseOwner } from './multi-agent-registry.js';

// BUG-SDK-1 forward-compat middleware. Reads the X-Agent-Tool-Use-Id header
// (populated by the MCP shim from CallToolRequest._meta.toolUseId) and
// rewrites the matching agent-attribution field in the request body so the
// downstream route handler inserts the row with the real sub-agent UUID
// instead of the bridge root.
//
// No-op fallback when:
//   - the header is missing (host doesn't pass tool_use_id in _meta)
//   - the session is bridge-mode (not in the multi-agent registry)
//   - the toolUseId resolves to no entry in toolUseOwner (translator hasn't
//     processed the matching tool_use event yet — race; the original body
//     value, typically the root agent, stays untouched)
//
// Routes covered (matches packages/mcp/src/proxy-client.ts surface):
//   POST /sessions/:id/channel              → fromAgentId
//   POST /sessions/:id/dm                   → fromAgentId
//   POST /sessions/:id/docs                 → byAgentId
//   POST /sessions/:id/sandbox/exec         → agentId
//   POST /sessions/:id/test-results         → agentId
//   POST /sessions/:id/agents               → parentAgentId  (spawn_agent fix)
//   POST /sessions/:id/agents/:aid/cancel   → requestedByAgentId
//
// project-memory writes (POST /projects/:p/memory/:k) and browser screenshots
// are NOT covered — they don't carry a sessionId in the URL. A future patch
// can add an X-Agent-Session-Id header from the shim to enable resolution
// for those paths.
//
// Cf. audit/13-sdk-1-design-memo.md.

interface RouteRule {
  method: string;
  pattern: RegExp;
  sessionIdGroup: number;
  fields: string[];
}

const ROUTE_RULES: RouteRule[] = [
  { method: 'POST', pattern: /^\/sessions\/([^/]+)\/channel$/, sessionIdGroup: 1, fields: ['fromAgentId'] },
  { method: 'POST', pattern: /^\/sessions\/([^/]+)\/dm$/, sessionIdGroup: 1, fields: ['fromAgentId'] },
  { method: 'POST', pattern: /^\/sessions\/([^/]+)\/docs$/, sessionIdGroup: 1, fields: ['byAgentId'] },
  { method: 'POST', pattern: /^\/sessions\/([^/]+)\/sandbox\/exec$/, sessionIdGroup: 1, fields: ['agentId'] },
  { method: 'POST', pattern: /^\/sessions\/([^/]+)\/test-results$/, sessionIdGroup: 1, fields: ['agentId'] },
  { method: 'POST', pattern: /^\/sessions\/([^/]+)\/agents$/, sessionIdGroup: 1, fields: ['parentAgentId'] },
  {
    method: 'POST',
    pattern: /^\/sessions\/([^/]+)\/agents\/[^/]+\/cancel$/,
    sessionIdGroup: 1,
    fields: ['requestedByAgentId'],
  },
];

export function registerSdkAttributionMiddleware(app: FastifyInstance): void {
  app.addHook('preHandler', async (request) => {
    const headerVal = request.headers['x-agent-tool-use-id'];
    const toolUseId = Array.isArray(headerVal) ? headerVal[0] : headerVal;
    if (typeof toolUseId !== 'string' || toolUseId.length === 0) return;
    const method = request.method;
    if (method !== 'POST') return;
    const path = request.url.split('?')[0] ?? '';

    for (const rule of ROUTE_RULES) {
      if (rule.method !== method) continue;
      const m = path.match(rule.pattern);
      if (!m) continue;
      const sessionId = m[rule.sessionIdGroup];
      if (!sessionId) return;

      const owner = getToolUseOwner(sessionId, toolUseId);
      if (!owner) return;

      const body = request.body as Record<string, unknown> | null | undefined;
      if (!body || typeof body !== 'object') return;
      for (const f of rule.fields) {
        body[f] = owner;
      }
      return;
    }
  });
}
