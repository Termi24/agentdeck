#!/usr/bin/env node
/**
 * agentdeck-test — universal test-target dispatcher CLI.
 *
 * Usage:
 *   agentdeck-test <target> [project-path] [options]
 *
 * Targets: api | ui | regression | full | (whatever ships under process/test-targets/)
 *
 * Options:
 *   --project-name=<name>   Override the campaign projectName (default: directory basename).
 *   --proxy=<url>           Proxy URL (default: http://127.0.0.1:4317).
 *   --json                  Print final summary as JSON (machine-readable).
 *   --fail-on=<hard|warn|none>
 *                           Exit-code policy. Default `hard`: exit 1 if any blocking gate failed.
 *                           `warn` also exits 1 on any soft warning. `none` always exits 0.
 *   --timeout-ms=<n>        Claude run timeout. Default 600_000 (10 min).
 *
 * Behavior:
 *   1. Verifies the proxy is reachable; aborts with a clear message if not.
 *   2. Validates `<target>` against /campaigns/templates; aborts on unknown target.
 *   3. Pre-creates the campaign (POST /campaigns { target }) so the model can't pick the wrong one.
 *   4. Spawns `claude -p "/agentdeck-test <target> <campaignId> <projectName>"` with bypass perms.
 *   5. Streams Claude's stdout to the terminal as it runs.
 *   6. After Claude exits, GET /campaigns/<id> and pretty-prints the gate verdict.
 *   7. Exits with code dictated by --fail-on.
 */
import { spawn } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, isAbsolute, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const HELP = `agentdeck-test — universal test-target dispatcher

Usage:
  agentdeck-test <target> [project-path] [options]

Targets:           depends on process/test-targets/*.json. Try \`agentdeck-test --list-targets\`.
project-path:      directory of the project under test (default: cwd).

Options:
  --project-name=<name>  Override projectName (default: basename of project-path).
  --proxy=<url>          Proxy URL (default: http://127.0.0.1:4317).
  --json                 Print final summary as JSON.
  --fail-on=<policy>     hard | warn | none (default: hard).
  --timeout-ms=<n>       Claude run timeout in ms (default: 600000).
  --list-targets         List available targets from /campaigns/templates and exit.
  --help                 Print this and exit.
`;

function fail(msg, code = 1) {
  process.stderr.write(`${ANSI.red}✗ ${msg}${ANSI.reset}\n`);
  process.exit(code);
}

function parseArgs(argv) {
  const positional = [];
  const opts = {
    projectName: null,
    proxy: process.env.AGENTDECK_PROXY_URL ?? 'http://127.0.0.1:4317',
    json: false,
    failOn: 'hard',
    timeoutMs: 600_000,
    listTargets: false,
    help: false,
  };
  for (const a of argv) {
    if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--list-targets') opts.listTargets = true;
    else if (a === '--json') opts.json = true;
    else if (a.startsWith('--project-name=')) opts.projectName = a.slice('--project-name='.length);
    else if (a.startsWith('--proxy=')) opts.proxy = a.slice('--proxy='.length);
    else if (a.startsWith('--fail-on=')) opts.failOn = a.slice('--fail-on='.length);
    else if (a.startsWith('--timeout-ms=')) opts.timeoutMs = Number(a.slice('--timeout-ms='.length));
    else if (a.startsWith('--')) fail(`unknown option: ${a}`);
    else positional.push(a);
  }
  if (!['hard', 'warn', 'none'].includes(opts.failOn)) fail(`--fail-on must be hard|warn|none (got "${opts.failOn}")`);
  if (!Number.isFinite(opts.timeoutMs) || opts.timeoutMs < 1000) fail(`--timeout-ms must be >= 1000`);
  return { opts, positional };
}

async function api(opts, method, path, body) {
  const res = await fetch(`${opts.proxy}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const ct = res.headers.get('content-type') ?? '';
  const text = await res.text();
  const data = ct.includes('json') && text ? JSON.parse(text) : text;
  return { status: res.status, ok: res.ok, data };
}

async function checkProxy(opts) {
  const r = await api(opts, 'GET', '/health').catch((e) => {
    fail(`proxy unreachable at ${opts.proxy}: ${e.message}\n  → start it with: pnpm dev   (or: node scripts/launch.mjs)`);
  });
  if (!r.ok) fail(`proxy returned ${r.status} on /health`);
  return r.data;
}

async function listTargets(opts) {
  const r = await api(opts, 'GET', '/campaigns/templates');
  if (!r.ok) fail(`GET /campaigns/templates → ${r.status}`);
  return r.data.templates;
}

async function createCampaign(opts, target, projectName) {
  const r = await api(opts, 'POST', '/campaigns', {
    projectName,
    cliSource: 'agentdeck-test-cli',
    target,
  });
  if (r.status === 400 && r.data?.error === 'unknown_target') {
    fail(`unknown target "${target}". Available: ${(r.data.availableTargets ?? []).join(', ')}`);
  }
  if (!r.ok) fail(`POST /campaigns → ${r.status}: ${JSON.stringify(r.data)}`);
  return r.data;
}

async function getCampaign(opts, campaignId) {
  const r = await api(opts, 'GET', `/campaigns/${encodeURIComponent(campaignId)}`);
  if (!r.ok) fail(`GET /campaigns/${campaignId} → ${r.status}`);
  return r.data;
}

function spawnClaude(opts, target, campaignId, projectName) {
  const claude = process.platform === 'win32' ? 'claude.cmd' : 'claude';
  const PROMPT = `/agentdeck-test ${target} ${campaignId} ${projectName}`;
  // Pipe via stdin to avoid argv mangling on Windows
  const promptFile = `${tmpdir()}/agentdeck-test-${Date.now()}.txt`;
  writeFileSync(promptFile, PROMPT, 'utf8');

  const child = spawn(
    claude,
    [
      '--permission-mode', 'bypassPermissions',
      '--allowed-tools', 'mcp__agentdeck__*,Read,Grep,Glob,Bash,Task',
      '-p',
    ],
    {
      shell: process.platform === 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
  child.stdin.write(PROMPT);
  child.stdin.end();
  return { child, promptFile };
}

function fmtGateLine(g) {
  const tag = g.passed ? `${ANSI.green}✓${ANSI.reset}` : `${ANSI.red}✗${ANSI.reset}`;
  const block = g.blocking ? '' : ` ${ANSI.dim}(non-blocking)${ANSI.reset}`;
  const waived = g.waived ? ` ${ANSI.yellow}[waived]${ANSI.reset}` : '';
  let valStr = '';
  if (typeof g.valueJson === 'string') {
    try { valStr = JSON.stringify(JSON.parse(g.valueJson)); } catch { valStr = g.valueJson; }
  } else if (g.value !== undefined) {
    valStr = JSON.stringify(g.value);
  }
  let thrStr = '';
  if (typeof g.thresholdJson === 'string') {
    try { thrStr = JSON.stringify(JSON.parse(g.thresholdJson)); } catch { thrStr = g.thresholdJson; }
  } else if (g.threshold !== undefined) {
    thrStr = JSON.stringify(g.threshold);
  }
  return `  ${tag} ${ANSI.bold}${g.gateName ?? g.name}${ANSI.reset}${block}${waived}\n      value=${valStr}  threshold=${thrStr}`;
}

function classify(gates) {
  const blockers = gates.filter((g) => !g.passed && g.blocking && !g.waived);
  const warnings = gates.filter((g) => !g.passed && (!g.blocking || g.waived));
  const passed = gates.filter((g) => g.passed);
  return { blockers, warnings, passed };
}

async function main() {
  const { opts, positional } = parseArgs(process.argv.slice(2));
  if (opts.help) { process.stdout.write(HELP); process.exit(0); }
  if (opts.listTargets) {
    await checkProxy(opts);
    const tpls = await listTargets(opts);
    process.stdout.write(`${ANSI.bold}Available test targets:${ANSI.reset}\n`);
    for (const t of tpls) {
      process.stdout.write(`  ${ANSI.cyan}${t.target.padEnd(14)}${ANSI.reset} ${t.description}\n`);
      const g = (t.gates ?? []).map((x) => x.name).join(', ');
      if (g) process.stdout.write(`      ${ANSI.dim}gates: ${g}${ANSI.reset}\n`);
    }
    process.exit(0);
  }

  if (positional.length === 0) {
    process.stderr.write(HELP);
    process.exit(2);
  }

  const target = positional[0];
  const projectPath = positional[1] ? (isAbsolute(positional[1]) ? positional[1] : resolve(process.cwd(), positional[1])) : process.cwd();
  const projectName = opts.projectName ?? basename(projectPath);

  process.stdout.write(`${ANSI.bold}agentdeck-test${ANSI.reset} target=${ANSI.cyan}${target}${ANSI.reset} project=${ANSI.cyan}${projectName}${ANSI.reset}\n`);
  process.stdout.write(`proxy: ${opts.proxy}\n\n`);

  // 1. Proxy check
  const health = await checkProxy(opts);
  process.stdout.write(`${ANSI.green}✓${ANSI.reset} proxy ok · v${health.version ?? '?'}\n`);

  // 2. Target validation + campaign creation
  const camp = await createCampaign(opts, target, projectName);
  process.stdout.write(`${ANSI.green}✓${ANSI.reset} campaign ${ANSI.bold}${camp.campaignId}${ANSI.reset} created (target=${camp.target})\n`);
  const dashUrl = opts.proxy.replace(/:4317$/, ':3000');
  process.stdout.write(`  dashboard: ${ANSI.blue}${dashUrl}/campaigns${ANSI.reset}\n\n`);

  // 3. Spawn claude
  process.stdout.write(`${ANSI.bold}--- claude run ---${ANSI.reset}\n`);
  const t0 = Date.now();
  const { child, promptFile } = spawnClaude(opts, target, camp.campaignId, projectName);

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => {
    const s = d.toString();
    stdout += s;
    process.stdout.write(`${ANSI.dim}${s}${ANSI.reset}`);
  });
  child.stderr.on('data', (d) => {
    stderr += d.toString();
  });

  const exitCode = await Promise.race([
    new Promise((resolvePromise) => child.once('close', resolvePromise)),
    delay(opts.timeoutMs).then(() => {
      child.kill();
      return 'timeout';
    }),
  ]);
  try { unlinkSync(promptFile); } catch {}
  process.stdout.write(`\n${ANSI.bold}--- claude exit (${exitCode}) — ${((Date.now() - t0) / 1000).toFixed(1)}s ---${ANSI.reset}\n\n`);
  if (exitCode !== 0 && exitCode !== 'timeout') {
    process.stderr.write(`${ANSI.yellow}claude exited non-zero — stderr tail:${ANSI.reset}\n${stderr.split('\n').slice(-10).join('\n')}\n\n`);
  }

  // 4. Read final campaign verdict
  const final = await getCampaign(opts, camp.campaignId);
  // gates is the rows from campaign_gate_results; if end_campaign was never
  // called, it'll be empty — flag that as a hard failure since we can't verify.
  const gates = final.gates ?? [];
  const verdict = classify(gates);

  if (opts.json) {
    process.stdout.write(JSON.stringify({
      campaignId: camp.campaignId,
      target: camp.target,
      campaign: final.campaign,
      gates,
      verdict: { blockers: verdict.blockers.length, warnings: verdict.warnings.length, passed: verdict.passed.length },
      claudeExit: exitCode,
      durationMs: Date.now() - t0,
    }, null, 2) + '\n');
  } else {
    process.stdout.write(`${ANSI.bold}Gate results (${gates.length} evaluated):${ANSI.reset}\n`);
    if (gates.length === 0) {
      process.stdout.write(`  ${ANSI.yellow}⚠ no gate results${ANSI.reset} — end_campaign was likely never called by the orchestrator.\n`);
      process.stdout.write(`    Inspect: ${ANSI.blue}${dashUrl}/campaigns${ANSI.reset}\n`);
    } else {
      for (const g of gates) process.stdout.write(fmtGateLine(g) + '\n');
    }
    process.stdout.write('\n');
    process.stdout.write(`${ANSI.bold}Summary:${ANSI.reset} ${ANSI.green}${verdict.passed.length} passed${ANSI.reset}, ${ANSI.yellow}${verdict.warnings.length} warning(s)${ANSI.reset}, ${ANSI.red}${verdict.blockers.length} blocker(s)${ANSI.reset}\n`);
    process.stdout.write(`Campaign status: ${final.campaign?.status ?? '(unknown)'}\n`);
  }

  // 5. Exit code
  let exit = 0;
  if (gates.length === 0) exit = 1; // never closed = failure
  else if (verdict.blockers.length > 0 && opts.failOn !== 'none') exit = 1;
  else if (verdict.warnings.length > 0 && opts.failOn === 'warn') exit = 1;
  process.exit(exit);
}

main().catch((e) => {
  process.stderr.write(`${ANSI.red}fatal: ${e.stack ?? e.message}${ANSI.reset}\n`);
  process.exit(1);
});
