#!/usr/bin/env node
/**
 * End-to-end test: launch a `claude -p` headless run with explicit
 * instructions to populate every agentdeck surface, then verify via the
 * agentdeck REST API that the resulting bridge session has:
 *
 *   - root agent identity set (name != "claude-cli")
 *   - >= 2 agents registered (root + at least one sub-agent)
 *   - >= 3 channel messages
 *   - >= 2 tasks in the planning surface (>= 1 completed)
 *   - >= 1 test result reported
 *   - >= 1 doc published
 *
 * Each missing surface = a missing MCP tool call in the skill.
 */
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PROXY = process.env.AGENTDECK_PROXY_URL ?? 'http://127.0.0.1:4317';
const CLAUDE = process.platform === 'win32' ? 'claude.cmd' : 'claude';
const TIMEOUT_MS = 240_000; // 4 minutes — model needs time to chain tool calls

async function api(method, path) {
  const res = await fetch(`${PROXY}${path}`, { method });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`);
  return res.headers.get('content-type')?.includes('json') ? res.json() : res.text();
}

// We invoke the slash command — its prompt is the source of truth in
// `process/commands/agentdeck-self-test.md` (installed to
// ~/.claude/commands/agentdeck-self-test.md by scripts/install-skills.mjs).
const PROMPT = '/agentdeck-self-test';

async function listSessions() {
  return (await api('GET', '/sessions')).sessions;
}

function snap(rows) {
  return new Map(rows.map((r) => [r.id, r]));
}

async function fetchSurfaces(sessionId) {
  const [session, agents, dms] = await Promise.all([
    api('GET', `/sessions/${sessionId}`).catch(() => null),
    api('GET', `/sessions/${sessionId}/agents`).then((r) => r.agents).catch(() => []),
    api('GET', `/sessions/${sessionId}/dm?limit=200`).then((r) => r.messages ?? r.dms ?? r).catch(() => []),
  ]);
  const tasks = await api('GET', `/sessions/${sessionId}/agent-tasks`).then((r) => r.tasks).catch(() => []);
  return { session, agents, dms, tasks };
}

function pretty(label, ok, detail) {
  const tag = ok ? '✓' : '✗';
  const color = ok ? '\x1b[32m' : '\x1b[31m';
  console.log(`  ${color}${tag}\x1b[0m ${label.padEnd(28)} ${detail}`);
  return ok;
}

async function main() {
  console.log(`agentdeck CLI-bridge end-to-end test → ${PROXY}\n`);

  // sanity: proxy reachable
  const health = await api('GET', '/health').catch((e) => {
    throw new Error(`proxy not reachable at ${PROXY}: ${e.message}`);
  });
  console.log(`proxy ok · v${health.version ?? '?'}\n`);

  // claude reachable
  await new Promise((resolve, reject) => {
    const c = spawn(CLAUDE, ['--version'], { shell: process.platform === 'win32' });
    let out = '';
    c.stdout.on('data', (d) => (out += d));
    c.on('close', (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(`claude --version exited ${code}`))));
    c.on('error', reject);
  }).then((v) => console.log(`claude ok · ${v}\n`));

  console.log('snapshotting existing sessions…');
  const before = snap(await listSessions());
  console.log(`  ${before.size} sessions before run\n`);

  console.log('launching `claude -p` (timeout 4 min)…');
  console.log('---');
  const t0 = Date.now();

  // Write the prompt to a tempfile and pipe it to claude via stdin.
  // Direct argv passing is unreliable on Windows when the prompt contains
  // newlines or special chars: node spawn + shell:true mangles it through
  // cmd.exe and claude only sees the first word.
  const promptFile = join(tmpdir(), `agentdeck-bridge-test-${Date.now()}.txt`);
  writeFileSync(promptFile, PROMPT, 'utf8');

  const child = spawn(
    CLAUDE,
    [
      '--permission-mode', 'bypassPermissions',
      // Required: in -p mode, even with bypassPermissions, the model only
      // calls tools that are explicitly allowed. Without this flag, claude
      // exits in ~10s with a text reply and zero tool calls.
      '--allowed-tools', 'mcp__agentdeck__*',
      '-p',
    ],
    {
      shell: process.platform === 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
  child.stdin.write(PROMPT);
  child.stdin.end();

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => {
    stdout += d.toString();
  });
  child.stderr.on('data', (d) => {
    stderr += d.toString();
  });

  const exitCode = await Promise.race([
    new Promise((resolve) => child.once('close', resolve)),
    delay(TIMEOUT_MS).then(() => {
      child.kill();
      return 'timeout';
    }),
  ]);

  console.log('---');
  try { unlinkSync(promptFile); } catch {}
  console.log(`claude exited (${exitCode}) after ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
  console.log(`final response: ${stdout.trim().slice(0, 200) || '(empty)'}\n`);
  if (exitCode !== 0 && exitCode !== 'timeout') {
    console.log(`stderr tail:\n${stderr.split('\n').slice(-10).join('\n')}\n`);
  }

  // Find the new bridge session
  const after = snap(await listSessions());
  const newSessionIds = [...after.keys()].filter((id) => !before.has(id));
  if (newSessionIds.length === 0) {
    console.log('\x1b[31m✗ no new bridge session was created.\x1b[0m');
    console.log('  → the model did not call any mcp__agentdeck__* tool.');
    console.log('  → check `claude mcp list` shows agentdeck and that the proxy is up.');
    process.exit(2);
  }
  if (newSessionIds.length > 1) {
    console.log(`\x1b[33m⚠ ${newSessionIds.length} new sessions created — expected 1. Using newest.\x1b[0m`);
  }
  const sessionId = newSessionIds.sort((a, b) => {
    const ta = after.get(a).startedAt ?? '';
    const tb = after.get(b).startedAt ?? '';
    return tb.localeCompare(ta);
  })[0];
  console.log(`bridge session: ${PROXY.replace(':4317', ':3000')}/sessions/${sessionId}\n`);

  // Inspect surfaces
  const { session, agents, dms, tasks } = await fetchSurfaces(sessionId);

  console.log('surface checks:');
  let allPass = true;
  const root = agents.find((a) => a.parentAgentId === null) ?? agents[0];
  const subs = agents.filter((a) => a.parentAgentId !== null);
  const tasksCompleted = tasks.filter((t) => t.status === 'completed').length;

  allPass &= pretty('root identity set', root && root.name && root.name !== 'claude-cli',
    root ? `name="${root.name}" role="${root.role ?? '—'}"` : 'no root agent found');

  allPass &= pretty('root prompt populated', root && root.prompt && root.prompt.length >= 20,
    root ? `${(root.prompt ?? '').length} chars` : 'no root');

  allPass &= pretty('sub-agents registered', subs.length >= 1,
    `${subs.length} sub-agents (${subs.map((s) => s.name).join(', ') || '—'})`);

  allPass &= pretty('channel messages', (session?.channelMessageCount ?? 0) >= 3,
    `${session?.channelMessageCount ?? 0} messages`);

  allPass &= pretty('direct messages', dms.length >= 1,
    `${dms.length} DMs`);

  allPass &= pretty('tasks planned', tasks.length >= 2,
    `${tasks.length} tasks (${tasksCompleted} completed)`);

  allPass &= pretty('tasks completed', tasksCompleted >= 1,
    `${tasksCompleted} / ${tasks.length}`);

  allPass &= pretty('test results', (session?.testResultCount ?? 0) >= 1,
    `${session?.testResultCount ?? 0} results`);

  allPass &= pretty('docs published', (session?.docCount ?? 0) >= 1,
    `${session?.docCount ?? 0} docs`);

  console.log();
  if (allPass) {
    console.log('\x1b[32m✓ all surfaces populated — the skill template is full-fidelity.\x1b[0m');
    process.exit(0);
  } else {
    console.log('\x1b[31m✗ some surfaces are empty — fix the skill / prompt.\x1b[0m');
    console.log('  inspect: ' + PROXY.replace(':4317', ':3000') + '/sessions/' + sessionId);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('\ntest-cli-bridge failed:', e.message);
  process.exit(1);
});
