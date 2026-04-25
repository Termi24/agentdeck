import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as wait } from 'node:timers/promises';
import { createConnection } from 'node:net';

// When packaged by pkg, process.execPath is the .exe sitting at the repo root.
// In dev (plain node scripts/exe-launch.mjs), we resolve relative to this file.
// @ts-ignore
const isPackaged = Boolean(process.pkg);
const repoRoot = isPackaged
  ? dirname(process.execPath)
  : resolve(dirname(fileURLToPath(import.meta.url)), '..');

const isWindows = process.platform === 'win32';

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

function waitForTcp(host, port, label, timeoutMs = 180_000) {
  const started = Date.now();
  return new Promise((resolvePromise, rejectPromise) => {
    const tryOnce = () => {
      const sock = createConnection({ host, port });
      sock.once('connect', () => {
        sock.destroy();
        log('launcher', `${label} listening on ${host}:${port}`);
        resolvePromise(undefined);
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
  for (const e of readdirSync(pnpmDir).filter((x) => x.startsWith('tsx@'))) {
    const cli = resolve(pnpmDir, e, 'node_modules/tsx/dist/cli.mjs');
    if (existsSync(cli)) return cli;
  }
  return null;
}

function findNextCli() {
  const p = resolve(repoRoot, 'apps/web/node_modules/next/dist/bin/next');
  return existsSync(p) ? p : null;
}

function findNodeExe() {
  if (!isPackaged) return process.execPath;
  // When packaged, process.execPath IS agentdeck.exe — we need a real node.
  const candidates = [
    process.env.NODE ?? '',
    'C:/Program Files/nodejs/node.exe',
    'C:/Program Files (x86)/nodejs/node.exe',
    resolve(process.env.APPDATA ?? '', 'npm/node.exe'),
    resolve(process.env.LOCALAPPDATA ?? '', 'Programs/nodejs/node.exe'),
    'G:/NodeJs/node.exe',
  ].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error(
    'Cannot find system node.exe. Install Node.js from https://nodejs.org or set the NODE env var to its path.',
  );
}

async function main() {
  log('launcher', `agentdeck repo: ${repoRoot}`);
  log('launcher', `packaged: ${isPackaged ? 'yes (single .exe)' : 'no (dev)'}`);

  if (!existsSync(resolve(repoRoot, 'node_modules')) || !existsSync(resolve(repoRoot, 'packages/proxy/node_modules'))) {
    throw new Error(
      `node_modules missing under ${repoRoot}. Run 'pnpm install' once in the repo (or double-click start.cmd for the first time).`,
    );
  }

  const tsxCli = findTsxCli();
  if (!tsxCli) throw new Error(`cannot locate tsx CLI under ${repoRoot}/node_modules/.pnpm`);
  const nextCli = findNextCli();
  if (!nextCli) throw new Error(`cannot locate next CLI under ${repoRoot}/apps/web/node_modules/next`);
  const nodeExe = findNodeExe();

  log('launcher', 'starting proxy');
  const proxy = spawn(nodeExe, [tsxCli, 'watch', 'src/index.ts'], {
    cwd: resolve(repoRoot, 'packages/proxy'),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  pipeLabeled(proxy, 'proxy');

  log('launcher', 'starting web');
  const web = spawn(nodeExe, [nextCli, 'dev', '--port', '3000', '--hostname', '127.0.0.1'], {
    cwd: resolve(repoRoot, 'apps/web'),
    env: process.env,
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
      waitForTcp('127.0.0.1', 4317, 'proxy'),
      waitForTcp('127.0.0.1', 3000, 'web'),
    ]);
    const url = 'http://127.0.0.1:3000';
    log('launcher', `opening browser at ${url}`);
    openBrowser(url);
    log('launcher', 'agentdeck running — close this window or press Ctrl+C to stop.');
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
  if (isWindows && isPackaged) {
    process.stdout.write('\nPress any key to close…');
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.once('data', () => process.exit(1));
  } else {
    process.exit(1);
  }
});
