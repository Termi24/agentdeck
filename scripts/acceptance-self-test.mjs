#!/usr/bin/env node
/**
 * Acceptance test for the test-target dispatcher (v0.0.10+).
 *
 * Validates, end-to-end at the proxy layer, that:
 *   - every template under process/test-targets/*.json loads cleanly,
 *   - each target can be used to start a campaign,
 *   - each `target-<name>` methodology section is synthesized from its template,
 *   - the unknown-target / unknown-section paths return crisp 4xx errors,
 *   - the legacy zero-target end_campaign flow still completes (Principe-10
 *     gate evaluated against the empty-personas case → no violation).
 *
 * Wall-clock < 30 s. Designed to be safe to run in CI without Anthropic API
 * credentials. The full Claude-driven E2E (gated behind ANTHROPIC_API_KEY)
 * is a separate concern — see scripts/test-cli-bridge.mjs.
 *
 * Exits 0 on success, 1 on any check failure.
 */
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createConnection } from 'node:net';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PROXY = process.env.AGENTDECK_PROXY_URL ?? 'http://127.0.0.1:4317';
const isWindows = process.platform === 'win32';
const PROXY_PORT = Number(new URL(PROXY).port || 4317);

const A = {
  reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', dim: '\x1b[2m', bold: '\x1b[1m',
};

let passed = 0;
let failed = 0;

function ok(label, detail) {
  passed++;
  process.stdout.write(`  ${A.green}✓${A.reset} ${label}${detail ? ` ${A.dim}— ${detail}${A.reset}` : ''}\n`);
}
function ko(label, detail) {
  failed++;
  process.stdout.write(`  ${A.red}✗${A.reset} ${label}${detail ? ` ${A.dim}— ${detail}${A.reset}` : ''}\n`);
}

async function api(method, path, body) {
  const res = await fetch(`${PROXY}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const ct = res.headers.get('content-type') ?? '';
  const text = await res.text();
  const data = ct.includes('json') && text ? JSON.parse(text) : text;
  return { status: res.status, ok: res.ok, data };
}

function waitForTcp(port, timeoutMs = 30_000) {
  const started = Date.now();
  return new Promise((resolvePromise, rejectPromise) => {
    const tryOnce = () => {
      const sock = createConnection({ host: '127.0.0.1', port });
      sock.once('connect', () => { sock.destroy(); resolvePromise(); });
      sock.once('error', () => {
        sock.destroy();
        if (Date.now() - started > timeoutMs) return rejectPromise(new Error(`port ${port} not listening`));
        delay(300).then(tryOnce);
      });
    };
    tryOnce();
  });
}

async function maybeStartProxy() {
  // Already up?
  try {
    await waitForTcp(PROXY_PORT, 1500);
    return null; // not ours to clean up
  } catch {
    /* not running — start it */
  }
  process.stdout.write(`${A.dim}proxy not running, spawning…${A.reset}\n`);
  const child = spawn(isWindows ? 'pnpm.cmd' : 'pnpm', ['--filter', '@agentdeck/proxy', 'dev'], {
    cwd: repoRoot,
    shell: isWindows,
    stdio: ['ignore', 'ignore', 'inherit'],
    windowsHide: true,
  });
  await waitForTcp(PROXY_PORT, 60_000);
  return child;
}

function listLocalTemplates() {
  const dir = resolve(repoRoot, 'process', 'test-targets');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort();
}

async function main() {
  process.stdout.write(`${A.bold}agentdeck — acceptance self-test${A.reset}  proxy=${PROXY}\n\n`);

  const spawnedProxy = await maybeStartProxy();

  try {
    // --- 1. Health
    process.stdout.write(`${A.cyan}▸ health${A.reset}\n`);
    {
      const r = await api('GET', '/health');
      r.ok ? ok('GET /health', `200 v${r.data.version ?? '?'}`) : ko('GET /health', `${r.status}`);
    }

    // --- 2. Templates
    process.stdout.write(`\n${A.cyan}▸ templates${A.reset}\n`);
    const localTpls = listLocalTemplates();
    let serverTpls = [];
    {
      const r = await api('GET', '/campaigns/templates');
      if (!r.ok) { ko('GET /campaigns/templates', `${r.status}`); }
      else {
        serverTpls = (r.data.templates ?? []).map((t) => t.target).sort();
        ok('GET /campaigns/templates', `${serverTpls.length} loaded`);
        const missing = localTpls.filter((t) => !serverTpls.includes(t));
        const extra = serverTpls.filter((t) => !localTpls.includes(t));
        if (missing.length === 0 && extra.length === 0) {
          ok('local ↔ server template parity', `${localTpls.join(', ')}`);
        } else {
          ko('local ↔ server template parity', `missing=[${missing.join(',')}] extra=[${extra.join(',')}]`);
        }
      }
    }

    // --- 3. Per-template campaign creation
    process.stdout.write(`\n${A.cyan}▸ per-target campaign creation${A.reset}\n`);
    for (const t of serverTpls) {
      const r = await api('POST', '/campaigns', {
        projectName: `acceptance-${t}`,
        cliSource: 'acceptance',
        target: t,
      });
      if (r.ok && r.data.target === t) ok(`POST /campaigns target=${t}`, r.data.campaignId);
      else ko(`POST /campaigns target=${t}`, `${r.status} ${JSON.stringify(r.data).slice(0, 120)}`);
    }

    // --- 4. Per-target methodology synthesis
    process.stdout.write(`\n${A.cyan}▸ per-target methodology synthesis${A.reset}\n`);
    for (const t of serverTpls) {
      const r = await api('GET', `/methodology?section=target-${encodeURIComponent(t)}`);
      const content = typeof r.data === 'object' ? r.data.content ?? '' : String(r.data);
      if (r.ok && content.length >= 200 && content.includes(`Target — \`${t}\``)) {
        ok(`section target-${t}`, `${content.length} chars`);
      } else {
        ko(`section target-${t}`, `${r.status} content=${content.length}c`);
      }
    }

    // --- 5. Failure paths (must be precise)
    process.stdout.write(`\n${A.cyan}▸ failure paths${A.reset}\n`);
    {
      const r = await api('POST', '/campaigns', { projectName: 'x', cliSource: 'x', target: 'does-not-exist' });
      r.status === 400 && r.data?.error === 'unknown_target'
        ? ok('POST /campaigns target=invalid → 400 unknown_target')
        : ko('POST /campaigns target=invalid', `expected 400 unknown_target, got ${r.status} ${r.data?.error ?? ''}`);
    }
    {
      const r = await api('GET', '/methodology?section=does-not-exist');
      r.status === 404 && r.data?.error === 'unknown_section'
        ? ok('GET /methodology section=invalid → 404 unknown_section')
        : ko('GET /methodology section=invalid', `expected 404 unknown_section, got ${r.status} ${r.data?.error ?? ''}`);
    }
    {
      const r = await api('GET', '/methodology?section=target-bogus');
      r.status === 404 && r.data?.error === 'unknown_target'
        ? ok('GET /methodology section=target-bogus → 404 unknown_target')
        : ko('GET /methodology section=target-bogus', `expected 404 unknown_target, got ${r.status} ${r.data?.error ?? ''}`);
    }

    // --- 6. Legacy end-to-end (no personas → Principe-10 gate cleanly passes)
    process.stdout.write(`\n${A.cyan}▸ legacy end-to-end (target=full, no personas)${A.reset}\n`);
    {
      const c = await api('POST', '/campaigns', { projectName: 'acceptance-legacy', cliSource: 'acceptance' });
      if (!c.ok) { ko('legacy: create campaign', `${c.status}`); }
      else {
        const id = c.data.campaignId;
        const e1 = await api('POST', `/campaigns/${id}/end`, { status: 'completed' });
        e1.status === 409 && e1.data?.error === 'retrospective_required'
          ? ok('legacy: end without retro → 409 retrospective_required')
          : ko('legacy: end without retro', `expected 409, got ${e1.status} ${e1.data?.error ?? ''}`);
        const r = await api('PUT', `/campaigns/${id}/retrospective`, {
          whatWentWell: 'a', whatWentBadly: 'b', keyLearnings: 'c', toolingFeedback: 'd', recommendations: 'e',
        });
        r.ok ? ok('legacy: submit retrospective') : ko('legacy: submit retrospective', `${r.status}`);
        const e2 = await api('POST', `/campaigns/${id}/end`, { status: 'completed' });
        if (e2.ok && Array.isArray(e2.data?.gates) && e2.data.gates.find((g) => g.name === 'ui.coverageRatio' && g.passed === true)) {
          ok('legacy: end with retro → 200 + ui.coverageRatio passed (legacy shape preserved)');
        } else {
          ko('legacy: end with retro', `${e2.status} ${JSON.stringify(e2.data).slice(0, 120)}`);
        }
        if (e2.ok && e2.data?.uiCoverage?.floor === 0.5) ok('legacy: response carries uiCoverage shim');
        else ko('legacy: uiCoverage shim missing', JSON.stringify(e2.data?.uiCoverage));
      }
    }

    process.stdout.write(`\n${A.bold}Result:${A.reset} ${A.green}${passed} passed${A.reset}, ${A.red}${failed} failed${A.reset}\n`);
    process.exit(failed === 0 ? 0 : 1);
  } finally {
    if (spawnedProxy) {
      try { spawnedProxy.kill(); } catch { /* ignore */ }
    }
  }
}

main().catch((e) => {
  process.stderr.write(`${A.red}fatal: ${e.stack ?? e.message}${A.reset}\n`);
  process.exit(2);
});
