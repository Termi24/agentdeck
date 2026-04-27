#!/usr/bin/env node
/**
 * Seed a richer set of realistic demo sessions into a running agentdeck proxy.
 * Used during the visual redesign to populate the hub / dashboards with
 * something to look at: 5 projects, varied statuses, DMs, docs, agent tasks
 * (planning), test results.
 *
 * Idempotent only in the sense that re-running adds another batch — wipe with:
 *   rm data/agentdeck.db && pnpm db:migrate
 */

const PROXY = process.env.AGENTDECK_PROXY_URL ?? 'http://127.0.0.1:4317';

async function api(method, path, body) {
  const res = await fetch(`${PROXY}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${method} ${path} → ${res.status} ${res.statusText}\n${text}`);
  }
  if (res.status === 204) return null;
  const ct = res.headers.get('content-type') ?? '';
  return ct.includes('application/json') ? res.json() : res.text();
}

const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();
const minutes = (n) => n * 60_000;
const hours = (n) => n * 3_600_000;

async function createScenario({
  projectId, title, prompt, rootName, rootRole,
  subs = [], channel = [], dms = [], docs = [], tests = [], tasks = [],
  finalize = false, finalStatus = 'completed',
}) {
  process.stdout.write(`  · ${projectId.padEnd(22)} ${title} ... `);
  const session = await api('POST', '/sessions', {
    projectId,
    prompt,
    title,
    bridge: true,
    rootAgentName: rootName,
    rootAgentRole: rootRole,
  });

  const sessionId = session.sessionId ?? session.id;
  const rootAgentId = session.rootAgentId ?? session.rootId;
  if (!sessionId || !rootAgentId) {
    throw new Error(`unexpected /sessions response: ${JSON.stringify(session)}`);
  }

  const subAgents = [];
  for (const s of subs) {
    const r = await api('POST', `/sessions/${sessionId}/agents`, {
      name: s.name,
      role: s.role,
      prompt: s.prompt,
      parentAgentId: rootAgentId,
    });
    subAgents.push({ ...s, agentId: r.agentId });
  }

  const allAgents = [{ name: rootName, agentId: rootAgentId }, ...subAgents];
  const idOf = (name) => (allAgents.find((a) => a.name === name) ?? allAgents[0]).agentId;

  for (const m of channel) {
    await api('POST', `/sessions/${sessionId}/channel`, {
      fromAgentId: idOf(m.from),
      fromAgentName: m.from,
      content: m.content,
    });
  }

  for (const dm of dms) {
    await api('POST', `/sessions/${sessionId}/dm`, {
      fromAgentId: idOf(dm.from),
      fromAgentName: dm.from,
      toAgentId: idOf(dm.to),
      content: dm.content,
    });
  }

  for (const d of docs) {
    await api('POST', `/sessions/${sessionId}/docs`, {
      path: d.path,
      content: d.content,
      byAgentId: idOf(d.by),
    });
  }

  for (const t of tests) {
    await api('POST', `/sessions/${sessionId}/test-results`, {
      agentId: idOf(t.from),
      suite: t.suite,
      caseName: t.caseName,
      status: t.status,
      message: t.message,
    });
  }

  // Planning tasks: plan → optionally start → optionally complete.
  const taskIdByTitle = new Map();
  for (const tk of tasks) {
    const planRes = await api('POST', `/sessions/${sessionId}/agent-tasks`, {
      agentId: idOf(tk.by),
      title: tk.title,
      description: tk.description,
      plannedStart: tk.plannedStart,
      plannedEnd: tk.plannedEnd,
      dependencies: tk.dependencies?.map((dep) => taskIdByTitle.get(dep)).filter(Boolean) ?? [],
    });
    const taskId = planRes.taskId ?? planRes.id;
    taskIdByTitle.set(tk.title, taskId);

    if (tk.progressPct !== undefined && tk.progressPct > 0) {
      await api('POST', `/sessions/${sessionId}/agent-tasks/${taskId}/progress`, {
        progressPct: tk.progressPct,
        status: tk.status,
      });
    }
    if (tk.complete) {
      await api('POST', `/sessions/${sessionId}/agent-tasks/${taskId}/complete`, {
        status: tk.completeStatus ?? 'completed',
      });
    }
  }

  if (finalize) {
    for (const s of subAgents) {
      await api('POST', `/sessions/${sessionId}/agents/${s.agentId}/stop`, {
        status: finalStatus === 'failed' ? 'failed' : 'completed',
        tokensIn: 1200 + Math.floor(Math.random() * 1800),
        tokensOut: 600 + Math.floor(Math.random() * 900),
      });
    }
    await api('POST', `/sessions/${sessionId}/cancel`, {});
  } else {
    await api('POST', `/sessions/${sessionId}/heartbeat`, {});
  }

  console.log(`✓ ${sessionId.slice(0, 8)}`);
  return sessionId;
}

async function main() {
  console.log(`agentdeck demo seeder → ${PROXY}\n`);

  const health = await api('GET', '/health').catch((e) => {
    throw new Error(`proxy not reachable at ${PROXY} — start it with \`pnpm dev\` first\n  ${e.message}`);
  });
  console.log(`proxy ok · v${health.version ?? '?'}\n`);

  console.log('seeding 5 projects:');

  // ───────────────────────────────────────────────────────────────────
  // 1. INDUSFORGE — running campaign with personas, full DMs/docs/tasks
  // ───────────────────────────────────────────────────────────────────
  await createScenario({
    projectId: 'indusforge',
    title: 'Phase 4 · isolated UI smoke',
    prompt: 'Run the isolated-ui-smoke procedure against the staging admin panel. Personas: A (admin), B (viewer).',
    rootName: 'orchestrator',
    rootRole: 'orchestrator',
    subs: [
      { name: 'persona-A', role: 'ui-tester', prompt: 'Drive the admin panel as the admin persona. Use an isolated browser context (browser_new_context). Test full CRUD on /admin/users, /admin/products, /admin/categories. Report every screenshot to channel.' },
      { name: 'persona-B', role: 'ui-tester', prompt: 'Drive the same admin panel as a read-only viewer. Confirm 403 on every write endpoint. Use an isolated browser context.' },
      { name: 'claim-validator', role: 'claim-validator', prompt: 'Re-validate every "I saw X" claim from persona-A and persona-B via direct HTTP probes (validate_claim). Antidote to false positives from contaminated browser state.' },
    ],
    channel: [
      { from: 'orchestrator', content: 'Procedure isolated-ui-smoke loaded. Spawning 2 personas with isolated browser contexts.' },
      { from: 'persona-A', content: 'Logged in as admin@indusforge.test · navigated to /admin/users · 142 rows visible.' },
      { from: 'persona-B', content: 'Logged in as viewer@indusforge.test · /admin/users returns 403, expected.' },
      { from: 'persona-A', content: 'Created user "demo-2026-04-27" via POST /admin/users · 201, id=u_8421.' },
      { from: 'claim-validator', content: 'Re-validated POST /admin/users → 201 server-side, claim confirmed.' },
      { from: 'persona-A', content: 'Screenshot taken on /admin/users · Found 3 disabled rows.' },
      { from: 'persona-A', content: 'Editing user u_8421 · email field accepts unicode emoji 😀 — possible encoding bug in /admin/users/edit.' },
      { from: 'claim-validator', content: 'Bug confirmed: PATCH /admin/users/u_8421 with emoji → 200 but returns mojibake. Filed audit/finding-emoji-encoding.md.' },
    ],
    dms: [
      { from: 'orchestrator', to: 'persona-A', content: 'Focus on the create+edit flow first, leave delete for after viewer confirms 403.' },
      { from: 'persona-A', to: 'orchestrator', content: 'Done. Found an encoding bug on /admin/users/edit — emoji in email becomes mojibake.' },
      { from: 'orchestrator', to: 'claim-validator', content: 'Re-check persona-A\'s emoji claim. Don\'t use her browser context, hit the API directly.' },
      { from: 'claim-validator', to: 'orchestrator', content: 'Confirmed. PATCH returns 200 but body has corrupted unicode. Logged.' },
      { from: 'persona-B', to: 'orchestrator', content: 'All 12 write routes return 403 as expected. Should I probe the read-only endpoints for data leaks?' },
      { from: 'orchestrator', to: 'persona-B', content: 'Yes — focus on /admin/users and /admin/audit-log. Report any field that exposes more than the role should see.' },
    ],
    docs: [
      { path: 'incidents/emoji-encoding.md', by: 'claim-validator', content: '# Emoji Encoding Bug\n\n**Endpoint:** PATCH /admin/users/:id\n**Severity:** medium\n\nRequest body containing UTF-8 emoji is stored corrupted (mojibake) in the database. Manifests as `\\xf0\\x9f...` sequences in the response.\n\n## Repro\n\n```\ncurl -X PATCH /admin/users/u_8421 \\\n  -H "Content-Type: application/json" \\\n  -d \'{"email":"test+😀@example.com"}\'\n```\n\nReturns 200 but body shows `test+ð\\u009f\\u0098\\u0080@example.com`.\n\n## Root cause (suspected)\n\nThe Express middleware decodes the body twice — once via `bodyParser.json()` and once explicitly in the controller. UTF-8 → latin-1 → UTF-8 round-trip corrupts.' },
      { path: 'audit/phase-4-summary.md', by: 'orchestrator', content: '# Phase 4 — Isolated UI Smoke\n\n## Personas\n- A: admin\n- B: viewer\n- claim-validator: cross-check\n\n## Findings\n- 1 medium bug (emoji encoding)\n- All RBAC checks pass for viewer (12/12 write routes return 403)\n- 142 user rows confirmed\n\n## Coverage\n- /admin/users: full CRUD ✓\n- /admin/products: full CRUD ✓\n- /admin/categories: read only (no write tests yet)' },
    ],
    tests: [
      { from: 'persona-A', suite: 'admin-flows', caseName: 'create-user', status: 'passed' },
      { from: 'persona-A', suite: 'admin-flows', caseName: 'edit-user', status: 'passed' },
      { from: 'persona-A', suite: 'admin-flows', caseName: 'edit-user-emoji', status: 'failed', message: 'emoji in email field corrupted on round-trip' },
      { from: 'persona-A', suite: 'admin-flows', caseName: 'delete-user', status: 'passed' },
      { from: 'persona-A', suite: 'product-flows', caseName: 'create-product', status: 'passed' },
      { from: 'persona-A', suite: 'product-flows', caseName: 'bulk-import', status: 'passed' },
      { from: 'persona-B', suite: 'rbac', caseName: 'viewer-cannot-create-user', status: 'passed', message: '403 as expected' },
      { from: 'persona-B', suite: 'rbac', caseName: 'viewer-cannot-edit-user', status: 'passed', message: '403 as expected' },
      { from: 'persona-B', suite: 'rbac', caseName: 'viewer-cannot-delete-user', status: 'passed', message: '403 as expected' },
      { from: 'persona-B', suite: 'rbac', caseName: 'viewer-cannot-create-product', status: 'passed' },
      { from: 'persona-B', suite: 'rbac', caseName: 'viewer-can-read-audit-log', status: 'passed', message: 'expected; viewer has read access' },
      { from: 'claim-validator', suite: 'claim-validation', caseName: 'emoji-encoding-bug', status: 'failed', message: 'reproduced via direct HTTP — confirmed' },
    ],
    tasks: [
      { by: 'orchestrator', title: 'Spawn personas + isolated contexts', plannedStart: iso(-minutes(20)), plannedEnd: iso(-minutes(18)), progressPct: 100, complete: true },
      { by: 'persona-A', title: 'Cover /admin/users CRUD', plannedStart: iso(-minutes(18)), plannedEnd: iso(-minutes(10)), progressPct: 100, complete: true },
      { by: 'persona-A', title: 'Cover /admin/products CRUD', plannedStart: iso(-minutes(10)), plannedEnd: iso(-minutes(2)), progressPct: 100, complete: true },
      { by: 'persona-A', title: 'Cover /admin/categories CRUD', plannedStart: iso(-minutes(2)), plannedEnd: iso(minutes(8)), progressPct: 25, status: 'in_progress' },
      { by: 'persona-B', title: 'RBAC matrix probe', plannedStart: iso(-minutes(15)), plannedEnd: iso(-minutes(5)), progressPct: 100, complete: true },
      { by: 'claim-validator', title: 'Re-validate persona claims', plannedStart: iso(-minutes(20)), plannedEnd: iso(minutes(15)), progressPct: 70, status: 'in_progress' },
      { by: 'orchestrator', title: 'Compose audit/phase-4-summary.md', plannedStart: iso(minutes(8)), plannedEnd: iso(minutes(15)), progressPct: 0, status: 'planned' },
    ],
    finalize: false,
  });

  // ───────────────────────────────────────────────────────────────────
  // 2. EYEOT-ERP — RBAC matrix, partially blocked
  // ───────────────────────────────────────────────────────────────────
  await createScenario({
    projectId: 'eyeot-erp',
    title: 'RBAC matrix · admin-vs-viewer',
    prompt: 'Probe the full RBAC matrix on /api/v1/* between admin and viewer roles. Report any mismatch.',
    rootName: 'orchestrator',
    rootRole: 'orchestrator',
    subs: [
      { name: 'admin-bot', role: 'rbac-prober', prompt: 'Send authenticated requests as admin against every route returned by api_inventory({path:"/api/v1"}). Compare expected vs actual status codes.' },
      { name: 'viewer-bot', role: 'rbac-prober', prompt: 'Same as admin-bot but with viewer credentials. Every write endpoint MUST return 403 — anything else is a privilege escalation.' },
    ],
    channel: [
      { from: 'orchestrator', content: 'API inventory loaded · 87 routes discovered.' },
      { from: 'admin-bot', content: 'Probing 87/87 routes as admin · 84 OK, 3 unexpected (404 on routes that should exist).' },
      { from: 'viewer-bot', content: 'Probing 87/87 routes as viewer · expected 56 × 403 on writes...' },
      { from: 'viewer-bot', content: '⚠ POST /invoices/9821 returned 200 instead of 403 — possible privilege escalation.' },
      { from: 'orchestrator', content: 'awaiting validate_claim on POST /invoices/9821 …' },
    ],
    dms: [
      { from: 'orchestrator', to: 'admin-bot', content: 'The 3 unexpected 404s — paste the routes here.' },
      { from: 'admin-bot', to: 'orchestrator', content: '/invoices/recurring/list, /invoices/draft/clone, /reports/legacy. All POST. Probably refactored away.' },
      { from: 'orchestrator', to: 'viewer-bot', content: 'Stop probing. Need confirmation on POST /invoices/9821 first — could be a real CVE.' },
    ],
    tasks: [
      { by: 'orchestrator', title: 'Build api_inventory', plannedStart: iso(-minutes(45)), plannedEnd: iso(-minutes(40)), progressPct: 100, complete: true },
      { by: 'admin-bot', title: 'Probe 87 routes (admin)', plannedStart: iso(-minutes(40)), plannedEnd: iso(-minutes(15)), progressPct: 100, complete: true },
      { by: 'viewer-bot', title: 'Probe 87 routes (viewer)', plannedStart: iso(-minutes(40)), plannedEnd: iso(-minutes(10)), progressPct: 80, status: 'blocked' },
      { by: 'orchestrator', title: 'Investigate POST /invoices/9821', plannedStart: iso(-minutes(5)), plannedEnd: iso(minutes(10)), progressPct: 30, status: 'in_progress' },
    ],
    tests: [
      { from: 'admin-bot', suite: 'rbac', caseName: 'GET /api/v1/health', status: 'passed' },
      { from: 'admin-bot', suite: 'rbac', caseName: 'GET /api/v1/invoices', status: 'passed' },
      { from: 'admin-bot', suite: 'rbac', caseName: 'POST /api/v1/invoices/recurring/list', status: 'failed', message: '404 — route refactored away?' },
      { from: 'admin-bot', suite: 'rbac', caseName: 'POST /api/v1/invoices/draft/clone', status: 'failed', message: '404 — route refactored away?' },
      { from: 'admin-bot', suite: 'rbac', caseName: 'POST /api/v1/reports/legacy', status: 'failed', message: '404 — route refactored away?' },
      { from: 'viewer-bot', suite: 'rbac', caseName: 'POST /invoices/9821', status: 'failed', message: 'expected 403, got 200 — privilege escalation' },
      { from: 'viewer-bot', suite: 'rbac', caseName: 'GET /api/v1/users', status: 'passed' },
      { from: 'viewer-bot', suite: 'rbac', caseName: 'POST /api/v1/users', status: 'passed', message: '403 as expected' },
    ],
    finalize: false,
  });

  // ───────────────────────────────────────────────────────────────────
  // 3. AGENTDECK SELF-AUDIT — completed daily probe
  // ───────────────────────────────────────────────────────────────────
  await createScenario({
    projectId: 'agentdeck-self-audit',
    title: 'rest-auditor · daily probe',
    prompt: 'Run the rest-auditor campaign against the local proxy. Cover all /api/v1/* endpoints from the inventory.',
    rootName: 'rest-auditor',
    rootRole: 'orchestrator',
    subs: [],
    channel: [
      { from: 'rest-auditor', content: 'Discovered 28 routes from packages/proxy/src/routes/ · all reachable.' },
      { from: 'rest-auditor', content: '28/28 probes returned expected status codes.' },
      { from: 'rest-auditor', content: 'campaign closed · 0 violations · published audit/15-rest.md' },
    ],
    docs: [
      { path: 'audit/15-rest.md', by: 'rest-auditor', content: '# REST Audit · 2026-04-27\n\n28 routes probed, 0 violations.\n\nAll endpoints documented in `packages/proxy/src/routes/` are reachable, return expected status codes, and accept the documented body shapes (zod-validated).' },
    ],
    tests: Array.from({ length: 28 }, (_, i) => ({
      from: 'rest-auditor',
      suite: 'rest',
      caseName: `route-${i + 1}`,
      status: 'passed',
    })),
    tasks: [
      { by: 'rest-auditor', title: 'Build inventory', plannedStart: iso(-hours(2)), plannedEnd: iso(-hours(2) + minutes(10)), progressPct: 100, complete: true },
      { by: 'rest-auditor', title: 'Probe 28 routes', plannedStart: iso(-hours(2) + minutes(10)), plannedEnd: iso(-hours(1) + minutes(50)), progressPct: 100, complete: true },
      { by: 'rest-auditor', title: 'Publish audit/15-rest.md', plannedStart: iso(-hours(1) + minutes(50)), plannedEnd: iso(-hours(1) + minutes(55)), progressPct: 100, complete: true },
    ],
    finalize: true,
  });

  // ───────────────────────────────────────────────────────────────────
  // 4. ECOM-BENCH — perf benchmark, FAILED
  // ───────────────────────────────────────────────────────────────────
  await createScenario({
    projectId: 'ecom-bench',
    title: 'k6 load test · checkout flow',
    prompt: 'Run a 5-minute load test on the checkout flow with 200 VUs ramping up. Report p95/p99 latencies and error rates.',
    rootName: 'orchestrator',
    rootRole: 'orchestrator',
    subs: [
      { name: 'k6-runner', role: 'load-tester', prompt: 'Start a k6 run against /checkout/init, /checkout/pay, /checkout/confirm with 200 VUs over 5 min. Stream metrics.' },
      { name: 'metrics-watcher', role: 'observer', prompt: 'Tail /metrics and watch for SLO breaches (p99 > 800ms, 5xx > 1%). Page the orchestrator if any SLO is breached.' },
    ],
    channel: [
      { from: 'orchestrator', content: 'Load test configured. 200 VUs, 5 min ramp.' },
      { from: 'k6-runner', content: 'Started k6 · scenarios: checkout-init, checkout-pay, checkout-confirm.' },
      { from: 'metrics-watcher', content: 'p95 latency at 60s mark: 312ms · within SLO.' },
      { from: 'metrics-watcher', content: 'p99 latency at 180s mark: 1.4s · ⚠ SLO breach (target < 800ms).' },
      { from: 'metrics-watcher', content: '5xx rate spiking: 4.2% on /checkout/pay · 🚨 critical SLO breach.' },
      { from: 'orchestrator', content: 'Aborting test. Failure: SLO breach on /checkout/pay.' },
    ],
    docs: [
      { path: 'audit/load-test-failure.md', by: 'orchestrator', content: '# Load Test FAILED\n\n**Date:** 2026-04-27\n**Test:** k6 200 VUs over 5 min\n**Outcome:** ❌ aborted at 3min mark\n\n## SLO breaches\n\n- p99 on /checkout/pay: **1.4s** (target < 800ms)\n- 5xx rate on /checkout/pay: **4.2%** (target < 1%)\n\n## Root cause (suspected)\n\nThe payment provider sandbox throttles connections from a single IP. Need to either (a) use a residential proxy pool or (b) negotiate a higher rate limit.' },
    ],
    tests: [
      { from: 'k6-runner', suite: 'load', caseName: 'checkout-init-p95', status: 'passed' },
      { from: 'k6-runner', suite: 'load', caseName: 'checkout-pay-p95', status: 'failed', message: 'p95 1.2s exceeds target 500ms' },
      { from: 'k6-runner', suite: 'load', caseName: 'checkout-pay-p99', status: 'failed', message: 'p99 1.4s exceeds target 800ms' },
      { from: 'k6-runner', suite: 'load', caseName: 'checkout-pay-5xx-rate', status: 'failed', message: '4.2% exceeds target 1%' },
    ],
    finalize: true,
    finalStatus: 'failed',
  });

  // ───────────────────────────────────────────────────────────────────
  // 5. CLIENT-ACME — exhaustive CRUD, RUNNING with many sub-agents
  // ───────────────────────────────────────────────────────────────────
  await createScenario({
    projectId: 'client-acme',
    title: 'exhaustive-crud · 47 entities',
    prompt: 'Run the exhaustive-crud-test procedure across all 47 entities of the ACME CRM. Zero-omission rule.',
    rootName: 'orchestrator',
    rootRole: 'orchestrator',
    subs: [
      { name: 'cartographer', role: 'mapper', prompt: 'Build the entity inventory by reading the OpenAPI spec at /api/openapi.json. Group by namespace.' },
      { name: 'crud-runner-1', role: 'crud-tester', prompt: 'Run full CRUD tests on entities 1-16: contacts, accounts, leads, opportunities, ...' },
      { name: 'crud-runner-2', role: 'crud-tester', prompt: 'Run full CRUD tests on entities 17-32: cases, products, price-books, quotes, ...' },
      { name: 'crud-runner-3', role: 'crud-tester', prompt: 'Run full CRUD tests on entities 33-47: campaigns, reports, dashboards, custom-objects, ...' },
      { name: 'invariant-auditor', role: 'auditor', prompt: 'After every CRUD pass, verify the entity count matches the API count and that no orphan rows are left behind.' },
    ],
    channel: [
      { from: 'orchestrator', content: 'Procedure exhaustive-crud-test loaded. Building inventory.' },
      { from: 'cartographer', content: 'Inventory built · 47 entities discovered, grouped into 8 namespaces.' },
      { from: 'orchestrator', content: 'Splitting work across 3 crud-runners (16/16/15 entities).' },
      { from: 'crud-runner-1', content: 'Started entities 1-16 · contacts: 8 cases passed, 0 failed.' },
      { from: 'crud-runner-2', content: 'Started entities 17-32 · cases: 8/8 passed.' },
      { from: 'crud-runner-3', content: 'Started entities 33-47 · campaigns: 8 passed, 1 failed (delete returns 500).' },
      { from: 'invariant-auditor', content: 'After contacts pass · entity count consistent · no orphans.' },
      { from: 'crud-runner-3', content: 'POST /campaigns/c_4421/recipients returns 504 timeout occasionally — flaky.' },
      { from: 'invariant-auditor', content: 'Detected 2 orphan rows in campaigns.recipients after delete-cascade test — possible bug.' },
    ],
    dms: [
      { from: 'orchestrator', to: 'crud-runner-3', content: 'The 504 on /campaigns/recipients — is it a flake or systematic? Retry 5x and report.' },
      { from: 'crud-runner-3', to: 'orchestrator', content: '3/5 attempts hit 504. Systematic for batches > 50 recipients.' },
      { from: 'orchestrator', to: 'invariant-auditor', content: 'Cross-check the orphan rows. If real, document as a bug.' },
    ],
    docs: [
      { path: 'incidents/campaigns-orphan-recipients.md', by: 'invariant-auditor', content: '# Orphan recipients in campaigns\n\n**Severity:** medium\n\nDeleting a campaign cascades to `campaigns.recipients` but leaves 2 orphan rows when the recipient count > 50. Reproduced 3/3 times.' },
    ],
    tasks: [
      { by: 'cartographer', title: 'Build entity inventory', plannedStart: iso(-minutes(35)), plannedEnd: iso(-minutes(30)), progressPct: 100, complete: true },
      { by: 'crud-runner-1', title: 'CRUD entities 1-16', plannedStart: iso(-minutes(30)), plannedEnd: iso(minutes(15)), progressPct: 55, status: 'in_progress' },
      { by: 'crud-runner-2', title: 'CRUD entities 17-32', plannedStart: iso(-minutes(30)), plannedEnd: iso(minutes(15)), progressPct: 60, status: 'in_progress' },
      { by: 'crud-runner-3', title: 'CRUD entities 33-47', plannedStart: iso(-minutes(30)), plannedEnd: iso(minutes(15)), progressPct: 45, status: 'in_progress' },
      { by: 'invariant-auditor', title: 'Cross-check invariants', plannedStart: iso(-minutes(25)), plannedEnd: iso(minutes(20)), progressPct: 60, status: 'in_progress' },
      { by: 'orchestrator', title: 'Compose final audit', plannedStart: iso(minutes(15)), plannedEnd: iso(minutes(25)), progressPct: 0, status: 'planned' },
    ],
    tests: [
      // 16 passing for crud-runner-1
      ...Array.from({ length: 16 }, (_, i) => ({
        from: 'crud-runner-1', suite: 'crud', caseName: `entity-${i + 1}-crud`, status: 'passed',
      })),
      // 16 passing for crud-runner-2
      ...Array.from({ length: 16 }, (_, i) => ({
        from: 'crud-runner-2', suite: 'crud', caseName: `entity-${i + 17}-crud`, status: 'passed',
      })),
      // 14 passing + 1 failure for crud-runner-3
      ...Array.from({ length: 14 }, (_, i) => ({
        from: 'crud-runner-3', suite: 'crud', caseName: `entity-${i + 33}-crud`, status: 'passed',
      })),
      { from: 'crud-runner-3', suite: 'crud', caseName: 'entity-47-campaigns-recipients-delete-cascade', status: 'failed', message: 'leaves 2 orphan rows' },
      { from: 'invariant-auditor', suite: 'invariants', caseName: 'no-orphans-after-cascade', status: 'failed', message: 'campaigns.recipients orphans confirmed' },
    ],
    finalize: false,
  });

  console.log('\ndone — open http://127.0.0.1:3000\n');
  console.log('hub  : http://127.0.0.1:3000/');
  console.log('proj : http://127.0.0.1:3000/projects/client-acme');
  console.log('sess : (click any card on the hub)');
  console.log('finds: http://127.0.0.1:3000/internal/findings');
}

main().catch((e) => {
  console.error('\nseed-demo failed:', e.message);
  process.exit(1);
});
