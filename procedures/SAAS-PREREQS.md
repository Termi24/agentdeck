# SaaS-prereqs

Checklist to verify a target SaaS is ready for an agentdeck test campaign.
Skipping any item in this list is the #1 reason a campaign wastes the
first hour on re-discovered environmental friction.

## 0. agentdeck itself

- [ ] **Proxy reachable** : `curl -fsS http://127.0.0.1:4317/health` returns `200` and a JSON body. If it fails, `pnpm dev` (or `start.cmd`) hasn't booted yet — wait for `Listening on :4317`. Skipping this step is the #1 cause of the ui-playwright auditor losing its first cycle to `fetch failed`.
- [ ] **Web UI reachable** : `curl -fsS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000` returns `200`. Hub may take 5-10 s longer than the proxy on cold boot.
- [ ] **Bridge MCP up** : in any `claude` CLI, the first tool call should print `[agentdeck] bridged session: http://127.0.0.1:3000/sessions/<id>`. If it errors with `fetch failed`, the proxy died after install-claude — restart `pnpm dev`.

## 1. Accounts & isolation

- [ ] **One account per role** exists on the target. Passwords are known and stored under a secret (`PERSONAS_JSON`).
- [ ] Accounts are in a **dedicated test organisation**, isolated from real customer data. In multi-tenant apps, create an `industest`-style tenant.
- [ ] **Email verification bypassed** for test accounts (flag `email_verified=True` on the seed). Otherwise first login sends a verification mail and locks the flow.
- [ ] **Password reset cooldown** either lifted on these accounts or long enough that the campaign doesn't trip it.

## 2. Rate limiting

- [ ] Test accounts / test tenant **whitelisted** on login throttles (Flask-Limiter, express-rate-limit, etc.). Otherwise `exhaustive-crud-test` step 3 eats the budget in login-only.
- [ ] A higher per-route bucket for these accounts if possible (10× normal).

## 3. Data seeding

- [ ] A **seed command** exists and is documented (`flask seed-industest`, `rails db:seed:test`, whatever). Running it from scratch restores a known baseline.
- [ ] The seed is **idempotent** (safe to run multiple times between campaigns).
- [ ] The campaign ends with a **reset command** (or at least DELETEs everything it created) so the next run starts clean.

## 4. Observability

- [ ] Logs reachable from the sandbox. For docker, at least `docker compose logs` equivalent; for cloud, a one-liner to tail CloudWatch / Logtail / etc.
- [ ] Error tracking (Sentry, PostHog errors, etc.) **scoped to a separate project** for the test tenant so real user errors aren't drowned by test-induced noise.

## 5. Backend access for `validate_claim`

- [ ] The target backend is **reachable from the proxy's network**. If it's behind a VPN or IP allowlist, the proxy host must be added.
- [ ] **CORS** not a concern — `validate_claim` is server-side fetch, no CORS.

## 6. Source tree access for `api_inventory`

- [ ] The backend repo is either:
  - Checked out on the proxy host under a known path (`rootPath`), or
  - Accessible read-only to the sandbox (git clone in a sandbox script before the run).
- [ ] Generated code (migrations, auto-registered decorators) is not the only source of truth — ensure the route decorators show up in grep-able Python/JS.

## 7. RBAC matrix

- [ ] Either the permission decorators are parseable (Flask `@permissions_required('module:action')`) so `api_inventory` captures them, or a hand-authored `rbac-matrix.json` is checked into the repo.
- [ ] The **seed of roles ↔ permissions** (`rbac_seeds.py` equivalent) is up to date with what production uses. Otherwise the `rbac-probe` will false-positive when roles differ.

## 8. Cleanup hooks

- [ ] A way to **drop all created test data** in <1 min (SQL truncate of test-tenant rows, or `docker compose exec db …`).
- [ ] A way to **flush caches** (Redis FLUSHDB restricted to test-tenant keys) between campaigns so stale permission caches don't mask RBAC changes.

---

Tick every box before starting `exhaustive-crud-test` or
`isolated-ui-smoke`. If any is blocked, surface it to the human **first**
— don't start a run that will fail 20 minutes in for an environmental
reason.
