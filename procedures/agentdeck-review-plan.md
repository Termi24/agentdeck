# agentdeck-review-plan

One-week, team-style, full code review of `G:/agentdeck`. The
orchestrator is the user's Claude CLI session (agentdeck MCP bridged
on first tool call, so the whole campaign shows up live in the
agentdeck dashboard). Nine specialist sub-agents own one domain each
and run in the parallel bursts the daily plan describes.

This plan composes with `exhaustive-campaign.md` — the 8 deliverables
(`00-scope.md` … `07-final-report.md`) are the contract; the schedule
below is *how* the team hits that contract inside 5 working days + 2
consolidation days.

## Target under review

- Repo root: `G:/agentdeck`
- Live proxy: `http://127.0.0.1:4317`
- Live web: `http://127.0.0.1:3000`
- Stack: Node 22 / TS / pnpm / Fastify 5 / Socket.IO 4 / Playwright 1.59 / Next.js 15 / React 19 / Drizzle + SQLite / 30 MCP tools.

## Sub-agent roster (9 specialists + 1 patch agent)

| Agent | Domain | Primary deliverables |
|---|---|---|
| `rest-auditor` | Fastify routes (`packages/proxy/src/routes/*`) | 02, 03 |
| `mcp-auditor` | 30 MCP tools (`packages/mcp/*`) | 02, 03 |
| `schema-auditor` | Drizzle schema + zod events (`packages/shared/*`) | 02, 03 |
| `sdk-translator-auditor` | 3-map translator invariants (`sdk-translator.ts`) | 02, 05 |
| `event-replay-auditor` | event sourcing + scrubber equivalence | 02, 05 |
| `ui-playwright-auditor` | web UI dashboard + session + dockview | 02, 03, 04 (a11y) |
| `security-auditor` | secrets AES, sandbox traversal, permission mode, CLI bridge auth | 03, 04 (security) |
| `perf-auditor` | event throughput, UI render with large sessions | 04 (performance) |
| `integration-auditor` | full E2E: session start → subagent spawn → tool calls → UI render → replay | 02, 05 |
| `patch-agent` | gated patch drafting & apply (invoked day 7 only) | n/a |

Each sub-agent skill lives under `.claude/agents/<name>.md` and is
spawnable via `Task(subagent_type: '<name>')`.

## Orchestrator role

The user launches the campaign by invoking `/agentdeck-review` in
their Claude CLI. That puts the CLI in orchestrator mode with the
brief at `.claude/commands/agentdeck-review.md`. The orchestrator:

- keeps the 8 deliverables open and up to date across the week,
- never edits `packages/*/src/` directly — patches go through
  `patch-agent` on day 7 only, gated by `await_user_input`,
- never restarts the proxy during the week (no `pnpm dev`, `pnpm
  build`, no launcher re-run); it trusts the live proxy at 4317/3000,
- posts a `📅 day-N` channel line at the start of each day.

## Day-by-day

### Day 1 (Mon) — Frame & inventory (orchestrator solo, ~4 h)

- 09:00 Kick-off — read `CLAUDE.md`, `README.md`, `procedures/*.md`.
- 10:00 Resolve context: confirm PROXY_URL/WEB_URL/REPO_ROOT; capture
  current git sha (`git -C G:/agentdeck rev-parse HEAD`).
- 11:00 Pre-reqs checklist adapted from `SAAS-PREREQS.md`:
  accounts (N/A), rate limits (N/A local), seed (agentdeck's own DB),
  logs (proxy stdout is the log), source access (repo mounted),
  RBAC (N/A), cleanup (delete per-session workspaces + DB rows).
  Anything missing → surface and stop.
- 13:00 Surface inventory:
  - `api_inventory` on `packages/proxy` (fastify) — MUST self-check.
  - `sandbox_exec` `grep -RnE "app\.(get|post|put|patch|delete)" packages/proxy/src/routes/` — cross-verify.
  - Parse MCP tool list from `packages/mcp/src/tools.ts`.
  - Parse Drizzle schema table list from `packages/shared/src/schema.ts`.
  - Parse web routes from `apps/web/src/app/`.
- 15:00 Compose `01-inventory.json`: 4 top-level arrays
  (`restRoutes`, `mcpTools`, `dbTables`, `webRoutes`).
- 16:00 Draft `00-scope.md` with the in-scope tables, blockers, and
  the sub-agent fan-out plan for days 2-5.
- 17:00 Day-1 checkpoint doc `checkpoint-day1.md`: what was
  enumerated, what was skipped, open questions.

Exit gate: `00-scope.md` and `01-inventory.json` published.

### Day 2 (Tue) — Backend deep dive (3 sub-agents in parallel, ~6 h)

Spawn in one Task burst:
- `rest-auditor` — every REST endpoint × {happy, one-failure-per-class}.
- `schema-auditor` — Drizzle tables exist as documented, every zod
  event round-trips through `z.toJSONSchema`, every events-schema
  discriminator has a corresponding table write.
- `sdk-translator-auditor` — spawn a probe session, verify the 3-map
  routing by checking message attribution to orchestrator vs.
  subagents.

Orchestrator waits for the three done-signals on channel, then
classifies failures into `02-coverage-positive.md` / `03-coverage-negative.md`.

Exit gate: coverage matrices updated with backend rows; any REAL
bug candidate logged in `05-cross-validation.md` as `pending`.

### Day 3 (Wed) — MCP & replay (2 sub-agents in parallel, ~5 h)

- `mcp-auditor` — all 30 `mcp__agentdeck__*` tools, direct invocation
  from inside the CLI session (which is itself a bridged session),
  verify each tool's side effect via a follow-up call.
- `event-replay-auditor` — fold the event stream of an existing
  complete session, cross-check counts against REST endpoints,
  run the replay scrubber end-to-end via UI (handed to the UI
  sub-agent on day 4 if selectors are tricky).

Exit gate: MCP rows + replay rows added to the matrices; the
`05-cross-validation.md` table grows.

### Day 4 (Thu) — UI & performance (2 sub-agents in parallel, ~6 h)

- `ui-playwright-auditor` — dashboard at `/`, session page at
  `/sessions/[id]`, dockview at `/sessions/[id]/dockview`, every
  fixed dockview tab (Channel / Docs / Sandbox / Procedures /
  Results / Browser / Memory / Secrets), replay scrubber, UserInputBar.
  Mandatory first call `browser_new_context({ reset: true })`.
  A11y quick pass (keyboard nav, landmarks, contrast on main screens).
- `perf-auditor` — synthesise a session with ≥ 5000 events,
  measure initial render, scrubber responsiveness at different
  positions, event-bus throughput. Budgets live in `00-scope.md`.

Exit gate: UI + a11y rows in 02/03; perf section added to
`04-non-functional.md` with p50/p95 per screen-class.

### Day 5 (Fri) — Security & integration (2 sub-agents in parallel, ~6 h)

- `security-auditor` — secrets AES-256-GCM round-trip, sandbox path
  traversal refusal (`../`, absolute path, symlink escape), proxy
  auth posture (current: no auth — document it), CLI bridge install
  script idempotency, master-key rotation scenario.
- `integration-auditor` — E2E campaign: `POST /sessions` non-bridge,
  spawn two Task subagents via SDK, verify every event lands in UI
  (via HTTP poll of `/sessions/<id>/events` if present, else via
  `socket.io-client` from a `sandbox_exec` script), cancel mid-flight,
  verify `session.ended` with `status=cancelled`, replay from scrubber.

Exit gate: security findings in `04-non-functional.md`; integration
findings in 02/05. End-of-week checkpoint `checkpoint-day5.md`
summarising what remains for the weekend.

### Day 6 (Sat) — Cross-validation & triage (orchestrator solo, ~4 h)

- Walk `05-cross-validation.md` line by line. Every pending claim
  → pick an independent channel (validate_claim for UI/API, DB
  dump via sandbox_exec for persistence, diff_exec for stdout),
  execute, fill the classification column.
- Re-run every FLAKE once. Demote passing reruns to notes.
- Produce `06-triage.md` with FLAKE / ARTEFACT / REAL sections,
  REAL bugs ordered by severity.

Exit gate: zero orphan failures; every row in 05 classified.

### Day 7 (Sun) — Report & patches (orchestrator + optional patch-agent, ~4 h)

- Compose `07-final-report.md` per the 7 sections from
  `exhaustive-campaign.md`.
- Run the go/no-go gate. Emit
  `report_test_result suite='campaign' caseName='exhaustiveness'`
  with pass/fail + `evidence.missing` list if fail.
- If REAL bug count > 0:
  1. `post_to_channel` a one-line call-out per bug.
  2. `await_user_input` — *« N bugs réels. `GO` / `SKIP` / `HALT` ? »*.
  3. On `GO`: spawn `patch-agent` once per bug. It drafts a `.patch`,
     publishes for review, waits for per-patch `APPLY <n>`.
  4. On `SKIP` / `HALT`: publish the corresponding close-out doc.
- `project_memory_write` the run summary keys.
- `post_to_channel` the scoreboard.

Exit gate: all 8 deliverables present, final `report_test_result`
emitted, memory updated.

## Meeting cadence

Solo-orchestrator friendly but pretend it's a team: each day's
checkpoint doc acts as a stand-up write-up. Two sync points:

- **Monday end of day** (after Frame & inventory) — orchestrator calls
  `await_user_input` asking Amine to confirm the scope doc is right
  before day 2 work kicks off. Timeout 60 min → default to proceed.
- **Friday end of day** (after security + integration) — orchestrator
  calls `await_user_input` to walk the preliminary findings before
  the weekend triage. Timeout 60 min → default to proceed.

No other sync is blocking; channel is always open for pings.

## Artefact layout in the session

```
session doc space (publish_doc)
├── 00-scope.md
├── 01-inventory.json
├── 02-coverage-positive.md
├── 03-coverage-negative.md
├── 04-non-functional.md
├── 05-cross-validation.md
├── 06-triage.md
├── 07-final-report.md
├── checkpoint-day1.md
├── checkpoint-day5.md
└── patches/
    ├── bug-01.md (per bug proposal)
    └── …

session sandbox
├── audit/
│   ├── rest/
│   ├── mcp/
│   ├── schema/
│   ├── translator/
│   ├── replay/
│   ├── ui/ (screenshots, per-case png)
│   ├── security/
│   ├── perf/
│   └── integration/
└── patches/
    ├── bug-01.patch
    └── …
```

## Risk register (kept at the top of `00-scope.md`)

- Proxy restart during the week → entire session dies. Treat as P0.
  Never run `pnpm dev` / `pnpm build` / relaunch script.
- `better-sqlite3` native compile dependency — unrelated to review
  but a dep of the proxy; don't bump it.
- The `apps/desktop` directory is deferred (Tauri 2). Out of scope.
- Windows-specific spawn logic in `scripts/launch.mjs` — in scope for
  review but the review does NOT run the launcher.

## Success definition

Run is successful when:
- All 8 deliverables published.
- `07-final-report.md` listed under the Docs tab of the bridged
  session and readable top-to-bottom.
- REAL bug count posted to channel as the campaign scoreboard.
- Patches either applied (with a short reviewer note per bug) or
  explicitly parked with a reason.
- `campaign:last_run_summary` written to project memory for
  run-to-run delta tracking.
