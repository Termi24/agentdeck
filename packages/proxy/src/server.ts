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
import { reapOrphanBridgesOnBoot, startBridgeWatchdog } from './services/bridge-watchdog.js';

export async function buildServer(): Promise<{ app: FastifyInstance; io: SocketIOServer }> {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === 'production' ? 'info' : 'debug',
      transport: config.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' },
    },
    disableRequestLogging: config.NODE_ENV !== 'development',
  });

  initDb();

  await app.register(cors, { origin: true });
  await app.register(sensible);

  const io = new SocketIOServer(app.server, {
    cors: { origin: true },
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

  app.get('/health', async () => ({ status: 'ok', version: '0.0.1' }));

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
