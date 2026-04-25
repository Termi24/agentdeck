#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as wait } from 'node:timers/promises';
import { createConnection } from 'node:net';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';
const pnpmBin = isWindows ? 'pnpm.cmd' : 'pnpm';

function log(tag, msg) {
  const stamp = new Date().toISOString().slice(11, 19);
  process.stdout.write(`[${stamp}] ${tag.padEnd(8)} ${msg}\n`);
}

function pipeLabeled(child, tag) {
  child.stdout?.on('data', (d) => {
    for (const line of d.toString().split('\n')) if (line.trim()) log(tag, line.trimEnd());
  });
  child.stderr?.on('data', (d) => {
    for (const line of d.toString().split('\n')) if (line.trim()) log(tag, line.trimEnd());
  });
}

function waitForTcp(host, port, label, timeoutMs = 120_000) {
  const started = Date.now();
  return new Promise((resolvePromise, rejectPromise) => {
    const tryOnce = () => {
      const sock = createConnection({ host, port });
      sock.once('connect', () => {
        sock.destroy();
        log('launcher', `${label} listening on ${host}:${port}`);
        resolvePromise();
      });
      sock.once('error', () => {
        sock.destroy();
        if (Date.now() - started > timeoutMs) {
          rejectPromise(new Error(`${label} failed to listen on ${host}:${port} within ${timeoutMs}ms`));
          return;
        }
        wait(500).then(tryOnce);
      });
    };
    tryOnce();
  });
}

function openBrowser(url) {
  if (isWindows) {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
  } else if (process.platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  }
}

function findTsxCli() {
  const pnpmDir = resolve(repoRoot, 'node_modules/.pnpm');
  if (!existsSync(pnpmDir)) return null;
  const entries = readdirSync(pnpmDir).filter((e) => e.startsWith('tsx@'));
  for (const e of entries) {
    const cli = resolve(pnpmDir, e, 'node_modules/tsx/dist/cli.mjs');
    if (existsSync(cli)) return cli;
  }
  return null;
}

function findNextCli() {
  const candidates = [
    resolve(repoRoot, 'apps/web/node_modules/next/dist/bin/next'),
    resolve(repoRoot, 'node_modules/next/dist/bin/next'),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return null;
}

async function main() {
  log('launcher', `repo: ${repoRoot}`);

  const proxyPort = Number(process.env.PROXY_PORT ?? 4317);
  const webPort = Number(process.env.NEXT_PORT ?? 3000);
  const autoSpawn = process.env.AGENTDECK_AUTO_SPAWN === '1';

  const needInstall =
    !existsSync(resolve(repoRoot, 'node_modules')) || !existsSync(resolve(repoRoot, 'packages/proxy/node_modules'));
  if (needInstall) {
    log('launcher', 'node_modules missing — installing (first run can take a few minutes)');
    const install = spawn(pnpmBin, ['install'], { cwd: repoRoot, shell: isWindows, stdio: 'inherit' });
    const [code] = await once(install, 'exit');
    if (code !== 0) throw new Error(`pnpm install failed with exit code ${code}`);
  }

  log('launcher', 'applying DB migrations');
  const migrate = spawn(pnpmBin, ['db:migrate'], { cwd: repoRoot, shell: isWindows, stdio: 'inherit' });
  const [migrateCode] = await once(migrate, 'exit');
  if (migrateCode !== 0) throw new Error(`pnpm db:migrate failed with exit code ${migrateCode}`);

  const tsxCli = findTsxCli();
  if (!tsxCli) throw new Error('cannot locate tsx cli.mjs under node_modules/.pnpm');
  const nextCli = findNextCli();
  if (!nextCli) throw new Error('cannot locate next cli under apps/web/node_modules/next');

  const proxyDir = resolve(repoRoot, 'packages/proxy');
  const webDir = resolve(repoRoot, 'apps/web');

  log('launcher', `starting proxy on :${proxyPort}`);
  const proxy = spawn(process.execPath, [tsxCli, 'watch', 'src/index.ts'], {
    cwd: proxyDir,
    env: { ...process.env, PROXY_PORT: String(proxyPort) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  pipeLabeled(proxy, 'proxy');

  log('launcher', `starting web on :${webPort}`);
  const web = spawn(process.execPath, [nextCli, 'dev', '--port', String(webPort), '--hostname', '127.0.0.1'], {
    cwd: webDir,
    env: { ...process.env, NEXT_PUBLIC_PROXY_URL: `http://127.0.0.1:${proxyPort}` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  pipeLabeled(web, 'web');

  const killAll = () => {
    try { proxy.kill(); } catch {}
    try { web.kill(); } catch {}
  };

  const shutdown = (sig) => {
    log('launcher', `received ${sig}, stopping children`);
    killAll();
    setTimeout(() => process.exit(0), 500).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  try {
    await Promise.all([
      waitForTcp('127.0.0.1', proxyPort, 'proxy'),
      waitForTcp('127.0.0.1', webPort, 'web'),
    ]);
    const url = `http://127.0.0.1:${webPort}`;
    if (!autoSpawn) {
      log('launcher', `opening browser at ${url}`);
      openBrowser(url);
    } else {
      log('launcher', `auto-spawned by MCP; not opening browser. dashboard: ${url}`);
    }
    log('launcher', 'agentdeck running — press Ctrl+C to stop');
  } catch (err) {
    log('launcher', `startup failed: ${err?.message ?? err}`);
    killAll();
    process.exit(1);
  }

  await Promise.race([once(proxy, 'exit'), once(web, 'exit')]);
  log('launcher', 'child process exited — shutting down');
  killAll();
}

main().catch((err) => {
  log('launcher', `fatal: ${err?.stack ?? err}`);
  process.exit(1);
});
