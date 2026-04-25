import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute, sep } from 'node:path';
import { getDb } from '../db.js';
import { sessions } from '@agentdeck/shared';
import { eq } from 'drizzle-orm';

export function resolveSandboxPath(sessionId: string, relPath: string): string {
  const session = getDb().select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (!session) throw new Error(`session ${sessionId} not found`);
  if (isAbsolute(relPath)) throw new Error('sandbox paths must be relative');
  const sandboxRoot = resolve(session.workspacePath, 'sandbox');
  mkdirSync(sandboxRoot, { recursive: true });
  const target = resolve(sandboxRoot, relPath);
  // Resolve symlinks on root + target. Walk up to the first existing ancestor
  // because sandbox_write can legitimately create a not-yet-existing target.
  const realRoot = safeRealpath(sandboxRoot);
  const realTarget = realpathFirstExisting(target);
  const rel = relative(realRoot, realTarget);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('path escapes the sandbox');
  }
  return target;
}

function safeRealpath(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

function realpathFirstExisting(target: string): string {
  const parts = target.split(sep);
  for (let i = parts.length; i > 0; i--) {
    const head = parts.slice(0, i).join(sep);
    if (head && existsSync(head)) {
      const real = safeRealpath(head);
      const tail = parts.slice(i).join(sep);
      return tail ? real + sep + tail : real;
    }
  }
  return target;
}

export function sandboxWrite(sessionId: string, relPath: string, content: string): { path: string; bytes: number } {
  const target = resolveSandboxPath(sessionId, relPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, 'utf8');
  return { path: relPath, bytes: Buffer.byteLength(content, 'utf8') };
}

export function sandboxRead(sessionId: string, relPath: string): string {
  const target = resolveSandboxPath(sessionId, relPath);
  if (!existsSync(target)) throw new Error(`file not found: ${relPath}`);
  return readFileSync(target, 'utf8');
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

export async function sandboxExec(
  sessionId: string,
  command: string,
  timeoutMs: number,
): Promise<ExecResult> {
  const session = getDb().select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (!session) throw new Error(`session ${sessionId} not found`);
  const sandboxRoot = resolve(session.workspacePath, 'sandbox');
  mkdirSync(sandboxRoot, { recursive: true });

  const started = Date.now();
  return new Promise<ExecResult>((resolveP) => {
    const shell = process.platform === 'win32' ? 'powershell.exe' : 'sh';
    const shellArgs = process.platform === 'win32' ? ['-NoProfile', '-NonInteractive', '-Command', command] : ['-c', command];
    const child = spawn(shell, shellArgs, { cwd: sandboxRoot });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);
    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString('utf8');
    });
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString('utf8');
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolveP({
        exitCode: code ?? -1,
        stdout: truncate(stdout),
        stderr: truncate(stderr),
        durationMs: Date.now() - started,
        timedOut,
      });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolveP({
        exitCode: -1,
        stdout: truncate(stdout),
        stderr: truncate(stderr + '\n' + String(err)),
        durationMs: Date.now() - started,
        timedOut,
      });
    });
  });
}

function truncate(s: string, max = 64_000): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n… [truncated ${s.length - max} bytes]`;
}
