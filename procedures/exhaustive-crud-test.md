# exhaustive-crud-test

Zero-omission test campaign: inventory every mutation route in the target
backend, exercise CREATE → UPDATE → ACTION → DELETE for each with fixtures
wired from prior responses, and produce a per-persona coverage matrix.

This procedure is the distilled learning from the IndusForge week
(`G:\eyeot\ERP\_team\phase-bc-final-report.md`). Before it existed, an
agent had to rediscover the scan → login → fixture-chain → retry-on-429
recipe from scratch every run.

## Required inputs (or secrets)

- `TARGET_BASE_URL` — e.g. `https://erp.eyeot.fr`
- `TARGET_REPO_PATH` — absolute path to the target codebase root (e.g. `/opt/eyeot-erp/backend` or an equivalent local checkout)
- `TARGET_FRAMEWORK` — one of `flask|fastapi|express|fastify`
- `PERSONAS` — JSON array `[{email, password, role}]`; secret name `PERSONAS_JSON` also accepted

## Steps

1. **Inventory.** Call `api_inventory` with `{framework: TARGET_FRAMEWORK, rootPath: TARGET_REPO_PATH, selfCheck: {baseUrl: TARGET_BASE_URL}}`. The `selfCheck` block probes 8 static GET routes on the live backend: if the response contains `suspectedParsingIssue: true` or any entries in `suspicious[]`, **stop and surface it to the human immediately** — the inventory has a resolution bug and building a test matrix on top of it will produce dozens of false positives (see IndusForge run 1, 22 false-positive BUG reports caused by 2 silent parsing bugs). Only persist `inventory.json` after the self-check is clean.
2. **Group routes** by verb: CREATE (POST), UPDATE (PUT/PATCH), ACTION (POST without body or with imperative path segment e.g. `/send`, `/accept`, `/transition`), DELETE.
3. **Login every persona.** For each persona in `PERSONAS`, call `validate_claim` with `method=POST`, `url={BASE}/api/v1/auth/login`, `body={email,password}`, `expectStatus='2xx'`. Extract the access token from `sampleBody`. Store `{persona.email: token}` in a sandbox file `tokens.json`. On 429, backoff 2s and retry up to 3×.
4. **Exercise each route.** For every route × every persona whose role should allow it:
   1. Substitute path params from a rolling `fixtures.json` (ids captured from previous CREATE responses).
   2. Call `validate_claim` with the right method, `Authorization: Bearer <token>` header, JSON body built from the Marshmallow/zod schema nearby in source.
   3. Record `{persona, method, path, status, ok, mismatches}` in a results array.
   4. If the route returned a 2xx with a JSON id in the body, append to `fixtures.json` keyed by the resource name (e.g. `client_id`, `quote_id`).
5. **RBAC probe.** For every route × every persona whose role should NOT allow it, call `validate_claim` with `expectStatus='4xx'`. A 200 here is a real RBAC bug — `report_test_result` with status=failed.
6. **Cross-validate claims.** Any time a sub-agent has reported a UI bug on this campaign's channel, re-run the equivalent API call via `validate_claim` and compare. If the claim was produced by contaminated browser state, flag it as a false positive.
7. **Report.** Aggregate the results array into a Markdown matrix (rows = routes, columns = personas, cells = `✓` / `403` / `500` / `—`). Write it to `coverage-matrix.md`. Then `publish_doc` it so the human reviewer sees it.
8. **Tracking.** For every failing cell, `report_test_result` with `suite='exhaustive-crud'`, `caseName='<method> <path> as <persona>'`, status, and mismatches as evidence.

## Notes

- Rate limits: `validate_claim` auto-retries on HTTP 429 (honours `Retry-After`, falls back to exponential back-off capped at 30 s, default 3 retries). Inspect `retries` / `backoffMs` in the result if a probe was slow. You rarely need to hand-throttle any more — but for very long runs you can still set `maxRetries: 5` or `maxBackoffMs: 60_000` per call.
- Fixture chains matter: supplier before order, client before quote, quote before invoice. If a fixture is missing, skip that branch with `report_test_result` status=skipped, not failed.
- DELETE last. Always. Deleting a fixture mid-run cascades to invalidate downstream CREATE attempts.
