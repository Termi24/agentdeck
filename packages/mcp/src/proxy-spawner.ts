import { spawn } from 'node:child_process';
import { createConnection, createServer } from 'node:net';
import { existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync, closeSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { setTimeout as wait } from 'node:timers/promises';

const STATE_DIR = resolve(homedir(), '.agentdeck');
const PROXY_INFO_PATH = resolve(STATE_DIR, 'proxy.json');
const SPAWN_LOCK_PATH = resolve(STATE_DIR, 'spawn.lock');

const PROXY_PORT_CANDIDATES = [4317, 4318, 4319, 4320, 4321, 4322, 4323, 4324, 4325, 4326, 4327];
const WEB_PORT_CANDIDATES = [3000, 3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008, 3009, 3010];

export interface ProxyInfo {
  pid: number;
  proxyPort: number;
  webPort: number;
  startedAt: string;
  repoRoot: string;
}

function ensureStateDir(): void {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
}

export function readProxyInfo(): ProxyInfo | null {
  if (!existsSync(PROXY_INFO_PATH)) return null;
  try {
    return JSON.parse(readFileSync(PROXY_INFO_PATH, 'utf8')) as ProxyInfo;
  } catch {
    return null;
  }
}

export function writeProxyInfo(info: ProxyInfo): void {
  ensureStateDir();
  writeFileSync(PROXY_INFO_PATH, JSON.stringify(info, null, 2), 'utf8');
}

export function deleteProxyInfo(): void {
  try {
    unlinkSync(PROXY_INFO_PATH);
  } catch {
    // already gone
  }
}

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    // EPERM means it exists but we cannot signal — still alive.
    return code === 'EPERM';
  }
}

export async function healthCheck(port: number, timeoutMs = 1500): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return false;
    const body = (await res.json().catch(() => ({}))) as { status?: string };
    return body?.status === 'ok';
  } catch {
    return false;
  }
}

export async function waitForHealth(port: number, timeoutMs = 60_000): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await healthCheck(port, 1000)) return true;
    await wait(800);
  }
  return false;
}

async function webReady(port: number, timeoutMs = 1500): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`http://127.0.0.1:${port}/`, { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

export async function waitForWebReady(port: number, timeoutMs = 120_000): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await webReady(port, 1500)) return true;
    await wait(1000);
  }
  return false;
}

function isPortFree(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const srv = createServer();
    srv.once('error', () => resolvePromise(false));
    srv.once('listening', () => {
      srv.close(() => resolvePromise(true));
    });
    srv.listen(port, host);
  });
}

function isPortInUseAndOurs(port: number): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const sock = createConnection({ host: '127.0.0.1', port });
    sock.once('connect', () => {
      sock.destroy();
      resolvePromise(true);
    });
    sock.once('error', () => {
      sock.destroy();
      resolvePromise(false);
    });
  });
}

export async function pickFreePort(candidates: number[]): Promise<number> {
  for (const p of candidates) {
    if (await isPortFree(p)) return p;
  }
  // All candidates busy — let the OS assign one in a higher range.
  const last = candidates[candidates.length - 1] ?? 4317;
  for (let p = last + 1; p < last + 100; p++) {
    if (await isPortFree(p)) return p;
  }
  throw new Error(`no free port found in candidates ${candidates.join(',')} or +100 range`);
}

/**
 * Try to acquire an exclusive spawn lock so that two concurrent MCPs do not
 * both spawn the proxy at the same time. Returns the open file descriptor on
 * success; null if the lock is already held by another process.
 *
 * The lock file is stale-resistant: if it exists but the recorded PID is
 * dead, we delete it and retry once.
 */
export function tryAcquireSpawnLock(): number | null {
  ensureStateDir();
  const acquire = (): number | null => {
    try {
      const fd = openSync(SPAWN_LOCK_PATH, 'wx');
      writeFileSync(SPAWN_LOCK_PATH, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
      return fd;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code !== 'EEXIST') throw err;
      return null;
    }
  };

  let fd = acquire();
  if (fd !== null) return fd;

  // Lock exists — is the holder alive?
  try {
    const raw = readFileSync(SPAWN_LOCK_PATH, 'utf8');
    const { pid } = JSON.parse(raw) as { pid: number };
    if (!isPidAlive(pid)) {
      unlinkSync(SPAWN_LOCK_PATH);
      fd = acquire();
      if (fd !== null) return fd;
    }
  } catch {
    // Corrupted lock file — try to remove and retry once.
    try {
      unlinkSync(SPAWN_LOCK_PATH);
      fd = acquire();
      if (fd !== null) return fd;
    } catch {
      // give up
    }
  }
  return null;
}

export function releaseSpawnLock(fd: number): void {
  try {
    closeSync(fd);
  } catch {
    // ignore
  }
  try {
    unlinkSync(SPAWN_LOCK_PATH);
  } catch {
    // ignore
  }
}

/**
 * Walk up from this file's location to find the agentdeck repo root
 * (identified by pnpm-workspace.yaml or scripts/launch.mjs).
 */
export function findRepoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 12; i++) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml')) && existsSync(resolve(dir, 'scripts/launch.mjs'))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('cannot locate agentdeck repo root from MCP runtime location');
}

/**
 * Spawn the launcher (`scripts/launch.mjs`) detached, with the given ports.
 * Returns the child PID on success. The child is fully detached so it
 * survives the death of the spawning MCP process.
 */
export function spawnDetachedLauncher(opts: { repoRoot: string; proxyPort: number; webPort: number }): number {
  const launcherPath = resolve(opts.repoRoot, 'scripts/launch.mjs');
  if (!existsSync(launcherPath)) {
    throw new Error(`launcher not found at ${launcherPath}`);
  }

  const child = spawn(process.execPath, [launcherPath], {
    cwd: opts.repoRoot,
    env: {
      ...process.env,
      PROXY_PORT: String(opts.proxyPort),
      NEXT_PORT: String(opts.webPort),
      AGENTDECK_AUTO_SPAWN: '1',
    },
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
  if (!child.pid) throw new Error('failed to spawn launcher (no pid)');
  return child.pid;
}

export interface EnsureProxyResult {
  proxyPort: number;
  webPort: number;
  freshSpawn: boolean;
}

/**
 * Ensure a proxy is reachable. Returns the ports it is reachable on.
 *
 * Order of attempts:
 *  1. If the user explicitly set AGENTDECK_PROXY_URL and that proxy is up,
 *     use it (do not spawn anything — explicit env wins over auto).
 *  2. Read ~/.agentdeck/proxy.json. If the recorded PID is alive AND
 *     /health on the recorded port responds, reuse that proxy.
 *  3. Otherwise, acquire the spawn lock, pick free ports, spawn the launcher
 *     detached, wait for /health, persist proxy.json, release the lock.
 *  4. If we cannot acquire the lock (someone else is spawning), poll until
 *     the proxy.json appears and points to a healthy proxy.
 */
export async function ensureProxyReachable(opts: { explicitProxyUrl?: string }): Promise<EnsureProxyResult> {
  if (opts.explicitProxyUrl) {
    const m = /:(\d+)/.exec(opts.explicitProxyUrl);
    const port = m ? Number(m[1]) : 4317;
    if (await healthCheck(port)) {
      const info = readProxyInfo();
      const webPort = info?.webPort ?? 3000;
      return { proxyPort: port, webPort, freshSpawn: false };
    }
    // Explicit URL given but not reachable — fall through to auto-spawn.
  }

  const existing = readProxyInfo();
  if (existing && isPidAlive(existing.pid) && (await healthCheck(existing.proxyPort))) {
    // Proxy is up; the web may still be compiling on a fresh launcher. Block
    // until it answers so the dashboard URL we hand out is immediately usable.
    if (!(await webReady(existing.webPort))) {
      await waitForWebReady(existing.webPort, 60_000);
    }
    return { proxyPort: existing.proxyPort, webPort: existing.webPort, freshSpawn: false };
  }
  if (existing) deleteProxyInfo();

  const lockFd = tryAcquireSpawnLock();
  if (lockFd === null) {
    // Another MCP is spawning. Wait for proxy.json to appear and for both
    // proxy /health and the web root to be reachable before returning, so any
    // dashboard URL we surface is immediately clickable.
    const started = Date.now();
    while (Date.now() - started < 120_000) {
      const info = readProxyInfo();
      if (info && (await healthCheck(info.proxyPort)) && (await webReady(info.webPort))) {
        return { proxyPort: info.proxyPort, webPort: info.webPort, freshSpawn: false };
      }
      await wait(500);
    }
    throw new Error('timed out waiting for concurrent MCP to spawn the proxy');
  }

  try {
    const repoRoot = findRepoRoot();
    const proxyPort = await pickFreePort(PROXY_PORT_CANDIDATES);
    const webPort = await pickFreePort(WEB_PORT_CANDIDATES);
    const pid = spawnDetachedLauncher({ repoRoot, proxyPort, webPort });
    writeProxyInfo({
      pid,
      proxyPort,
      webPort,
      startedAt: new Date().toISOString(),
      repoRoot,
    });
    const ok = await waitForHealth(proxyPort, 90_000);
    if (!ok) {
      throw new Error(`proxy did not become healthy on :${proxyPort} within 90s`);
    }
    // Next.js dev compiles lazily, so /health on the proxy is not enough — the
    // dashboard URL we are about to announce is on the web port. Wait for an
    // actual 200 from the Next root before letting the banner go out.
    const webOk = await waitForWebReady(webPort, 120_000);
    if (!webOk) {
      throw new Error(`web did not become ready on :${webPort} within 120s`);
    }
    return { proxyPort, webPort, freshSpawn: true };
  } finally {
    releaseSpawnLock(lockFd);
  }
}
