# rbac-probe

Systematically probe every route × every persona pair against the
declared permission matrix. Any disagreement (allow-should-deny, or
deny-should-allow) is a real RBAC bug.

The eyeot ERP `tenant_get` incident (commit `e63afea`) — a single UUID/str
comparison bug caused a systematic 403 on UPDATE/DELETE across the whole
app and was invisible to humans because nobody clicks every Edit button
every day. A scheduled `rbac-probe` run would have caught it the day it
shipped.

## Required inputs

- `TARGET_BASE_URL`
- `PERSONAS_JSON`
- `inventory.json` produced by `exhaustive-crud-test` (step 1). If absent, run `api_inventory` first. **Always pass `selfCheck: {baseUrl: TARGET_BASE_URL}`** — a broken inventory (suspicious 3xx / 404 / 5xx ratio) would cause this entire probe to misclassify every cell.
- A **permission matrix** mapping route → allowed roles. Build this either from:
  - The `permissionRequired` field returned by `api_inventory` (matches `@permissions_required('module:action')`), cross-referenced with each role's permission list from the seed file.
  - A hand-authored `rbac-matrix.json` checked into the target repo.

## Steps

1. **Login** each persona (see `exhaustive-crud-test` step 3).
2. **For every route × every persona** call `validate_claim` with the correct verb, minimal body (empty `{}` for POST/PATCH is fine for the RBAC check alone — we're measuring status, not business logic).
3. **Classify**:
   - Persona allowed AND got 2xx/4xx-business (not 401/403): `OK-allow`.
   - Persona allowed AND got 401/403: `BUG-denied-wrongly` → `report_test_result` failed with severity=high.
   - Persona denied AND got 401/403: `OK-deny`.
   - Persona denied AND got 2xx: `BUG-allowed-wrongly` → `report_test_result` failed with severity=**critical** (privilege escalation).
4. **Write the matrix** to `rbac-matrix.md` as a grid (routes × personas, cell = classification letter). `publish_doc` it.
5. **Tenant isolation probe (critical).** Pick two tenants (two different orgs). For each protected route that reads a resource by id, obtain an id created by tenant A and try to GET / PATCH / DELETE it using tenant B's token. Expected: 404 (preferred) or 403. Anything else is a tenant-leak bug — file it with severity=critical.
6. **Report summary** via `post_to_channel`: `RBAC probe done: N routes × M personas = X tests, Y critical, Z high.`

## Cadence

Run nightly in CI, and on demand before every prod deploy. The run takes
~2 min for ~400 routes × 8 personas on a warm proxy (IP rate-limit
back-off is handled inside `validate_claim`; if you see tail-end probes
taking 25 s+, inspect `retries` / `backoffMs` in the results rather than
widening the delay between calls).
