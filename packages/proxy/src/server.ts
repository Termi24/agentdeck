import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import { Server as SocketIOServer } from 'socket.io';
import { config } from './config.js';
import { registerSessionRoutes } from './routes/sessions.js';
import { registerChannelRoutes } from './routes/channel.js';
import { registerDocsRoutes } from './routes/docs.js';
import { registerSandboxRoutes } from './routes/sandbox.js';
import { registerProceduresRoutes } from './routes/procedures.js';
import { registerTestResultsRoutes } from './routes/test-results.js';
import { registerProjectMemoryRoutes } from './routes/project-memory.js';
import { registerDmRoutes } from './routes/direct-messages.js';
import { registerSecretsRoutes } from './routes/secrets.js';
import { registerUserInputRoutes } from './routes/user-input.js';
import { registerAgentCancelRoutes } from './routes/agent-cancel.js';
import { registerBrowserRoutes } from './routes/browser.js';
import { registerExecDiffRoutes } from './routes/exec-diff.js';
import { registerTestToolsRoutes } from './routes/test-tools.js';
import { registerMethodologyRoutes } from './routes/methodology.js';
import { registerCampaignsRoutes } from './routes/campaigns.js';
import { createEventBus } from './event-bus.js';
import { initDb } from './db.js';
import { sessionExists } from './persistence.js';
import { reapOrphanBridgesOnBoot, startBridgeWatchdog } from './services/bridge-watchdog.js';

/**
 * Match `/sessions/<uuid>/...` URLs. Used by the global onRequest hook
 * below to reject requests that target a session that does not exist —
 * before they hit the route handler and either silently return an empty
 * collection or crash with `SQLITE_CONSTRAINT_FOREIGNKEY` (both observed
 * in the 2026-04-25 self-audit).
 */
const SESSION_SCOPED_RE =
  /^\/sessions\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//i;

/** Resolve the proxy package version once at boot from package.json, so
 * `/health` reflects the bumped version after every release without any
 * hard-coded prose to keep in sync. Walks up from the compiled file to
 * the package root (works under both `tsx` dev and `dist` prod). */
function readPackageVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const candidates = [
      resolve(here, '../package.json'),
      resolve(here, '../../package.json'),
    ];
    for (const path of candidates) {
      try {
        const pkg = JSON.parse(readFileSync(path, 'utf8')) as { version?: string };
        if (pkg.version) return pkg.version;
      } catch {
        // try next candidate
      }
    }
  } catch {
    // fall through
  }
  return 'unknown';
}
const PROXY_VERSION = readPackageVersion();

export async function buildServer(): Promise<{ app: FastifyInstance; io: SocketIOServer }> {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === 'production' ? 'info' : 'debug',
      transport: config.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' },
    },
    disableRequestLogging: config.NODE_ENV !== 'development',
  });

  initDb();

  // Restrict CORS to the local dashboard origins. The previous
  // `origin: true` reflected ANY caller's Origin header, which on a
  // workstation lets a tab on `evil.example.com` issue cross-origin
  // requests to the local proxy and read secrets, sandbox files,
  // exec runs, etc. — the proxy has no auth by design (localhost only).
  // The launcher can spawn the dashboard on any port in 3000–3010 (auto-
  // pick first free), so we whitelist the whole range. Server-side
  // callers (the bridged CLI's MCP, Playwright probes) don't send an
  // Origin header at all, so they bypass this check.
  const isAllowedOrigin = (origin: string | undefined): boolean => {
    if (!origin) return true;
    return /^http:\/\/(?:127\.0\.0\.1|localhost):(?:300[0-9]|3010)$/.test(origin);
  };
  await app.register(cors, {
    origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
  });
  await app.register(sensible);

  const io = new SocketIOServer(app.server, {
    cors: {
      origin: (origin, cb) => cb(null, isAllowedOrigin(origin) ? origin ?? '*' : false),
    },
    path: '/ws',
  });

  const eventBus = createEventBus(io);

  io.on('connection', (socket) => {
    socket.on('session:join', (sessionId: string) => {
      socket.join(`session:${sessionId}`);
      eventBus.replayFor(socket, sessionId);
    });
    socket.on('session:leave', (sessionId: string) => {
      socket.leave(`session:${sessionId}`);
    });
  });

  app.get('/health', async () => ({ status: 'ok', version: PROXY_VERSION }));

  // Global guard: reject any request to a sub-resource of a non-existent
  // session with a clean 404 instead of letting it reach the route
  // handler and either (a) silently return an empty collection (GETs on
  // /channel /docs /tool-calls /test-results /agents /dm) or (b) leak a
  // raw `SQLITE_CONSTRAINT_FOREIGNKEY` 500 (POSTs on /channel
  // /test-results /...). Single SELECT-by-PK per request, cheap.
  // Skipped for `/sessions/:id` (no trailing slash) because that route
  // already runs its own getSession() check and returns the row body.
  app.addHook('onRequest', async (request, reply) => {
    const path = request.url.split('?')[0] ?? '';
    const m = SESSION_SCOPED_RE.exec(path);
    if (!m) return;
    const sessionId = m[1]!;
    if (!sessionExists(sessionId)) {
      return reply.notFound(`session ${sessionId} not found`);
    }
  });

  await app.register(registerSessionRoutes, { eventBus });
  await app.register(registerChannelRoutes, { eventBus });
  await app.register(registerDocsRoutes, { eventBus });
  await app.register(registerSandboxRoutes, { eventBus });
  await app.register(registerProceduresRoutes);
  await app.register(registerTestResultsRoutes, { eventBus });
  await app.register(registerProjectMemoryRoutes, { eventBus });
  await app.register(registerDmRoutes, { eventBus });
  await app.register(registerSecretsRoutes);
  await app.register(registerUserInputRoutes, { eventBus });
  await app.register(registerAgentCancelRoutes, { eventBus });
  await app.register(registerBrowserRoutes, { eventBus });
  await app.register(registerExecDiffRoutes);
  await app.register(registerTestToolsRoutes);
  await app.register(registerMethodologyRoutes);
  await app.register(registerCampaignsRoutes);

  // Finalize any bridge sessions still marked running from a prior proxy
  // run — a bridged CLI can no longer reach the new proxy instance, so
  // those rows are by definition stale ghosts.
  const reaped = reapOrphanBridgesOnBoot(eventBus);
  if (reaped > 0) app.log.info(`bridge-watchdog: reaped ${reaped} orphan bridge session(s) at boot`);
  startBridgeWatchdog(eventBus, { info: (m) => app.log.info(m) });

  return { app, io };
}
