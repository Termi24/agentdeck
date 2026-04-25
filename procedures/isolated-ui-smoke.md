# isolated-ui-smoke

Persona-parallel UI smoke with **hard browser isolation**: each sub-agent
gets its own Playwright BrowserContext (separate cookies, localStorage,
service workers, cache) so parallel personas never contaminate each
other's identity. This is the remediation for the IndusForge
cross-contamination pattern (`IRR-540/541/542` — artefacts, not bugs).

## Prerequisite

- The target app must be set up for the persona set (one account per role, known passwords). Seed it first (`sandbox_exec` the seeder script) if needed.
- `TARGET_BASE_URL` secret.
- `PERSONAS_JSON` secret — `[{name, email, password, suite}]`.

## Steps

1. **Claim isolation.** First tool call of the sub-agent: `browser_new_context` with `{reset: true}`. This destroys any prior context for this agent id and creates a fresh one. From this point every `browser_*` call routes to the isolated context automatically (the MCP passes `agentId` behind the scenes).
2. **Sanity probe.** `browser_navigate` to `{BASE}/sign-in`. `browser_snapshot` — verify URL contains `/sign-in` and body has the login form. If not, the SW from a prior run survived — abort and re-run step 1 with `reset: true`.
3. **Login.** `browser_fill_form` with email + password. `browser_click` the submit. `browser_wait_for` text containing the persona's dashboard marker (e.g. "Tableau de bord" for eyeot ERP).
4. **Suite execution.** Run the per-persona suite of smoke flows (create client, add opportunity, move stage, etc.) using only `browser_*` tools. No API shortcuts — this suite is specifically about UI coverage.
5. **Screenshot everything.** `browser_screenshot` before and after every state change with `caption='<persona>:<step>'`. Screenshots are auto-attached to the Browser panel and written to the session workspace.
6. **Validate any surprise.** If something looks wrong (unexpected 403 page, missing nav entry, stale badge), DO NOT assume a bug. Call `validate_claim` against the relevant backend endpoint with the persona's token to confirm the backend actually disagrees with the UI. Only escalate via `report_test_result` status=failed when both disagree.
7. **Log irritants** (UX frictions that aren't bugs) to the shared channel with `post_to_channel` prefixed `💡 IRR:` so the orchestrator can collect them for the end-of-week backlog.
8. **Cleanup.** `browser_dispose_context` at the very end, before returning.

## Why not reuse the session default context?

Because in a multi-agent session every agent calling `browser_navigate`
without `agentId` lands on the same `defaultPage`. Any login survives to
the next agent's first page view — that's the whole contamination bug.
The isolated context is the clean fix.
