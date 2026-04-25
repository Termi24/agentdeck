import { buildServer } from './server.js';
import { config } from './config.js';

async function main() {
  const { app } = await buildServer();
  await app.listen({ host: config.PROXY_HOST, port: config.PROXY_PORT });
  app.log.info(`agentdeck proxy ready on http://${config.PROXY_HOST}:${config.PROXY_PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
