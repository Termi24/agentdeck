# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Product

**agentdeck** — a local desktop app that observes Claude Agent SDK orchestrators and Claude CLI bridges in real time, AND lets them drive a real headless browser to test SaaS / web apps. 47 MCP tools (authoritative count: `TOOL_DEFINITIONS.length` in `packages/mcp/src/tools.ts`) wire the agents into agentdeck's own primitives (channel, docs, sandbox, browser, tests, memory, secrets, coordination, per-agent browser isolation, claim validation, API inventory, methodology, campaign tracking, agent identity, sub-agent registration, agent task planning). **Two-page web UI** (v0.0.9+): `/` is the hub — one card per connected CLI / project, with KPIs, last-channel preview, status badge and an inline `Show N teams ▾` expander to browse historical sessions per project; `/sessions/[id]` is a single-session dashboard (agent tree + unified activity feed + running tool calls + detail tabs incl. Planning with Gantt / Calendar / progress views). Click any project card → jumps directly to its latest session dashboard. The dockview tiling workspace is still available at `/sessions/[id]/dockview` for power users.

User-facing language is French (user: Amine). Internal code, logs, and technical documentation are in English.

## Architecture

Four moving parts, all TypeScript, ESM:

1. **`packages/proxy`** — Node 22 + Fastify 5 + Socket.IO 4 + `@anthropic-ai/claude-agent-sdk` + **Playwright 1.59**. Receives `POST /sessions`, runs a Claude SDK session with `includePartialMessages: true`, `permissionMode: 'bypassPermissions'`, and 47 `allowedTools` pre-approving the full MCP tool surface (kept in sync manually with `packages/mcp/src/tools.ts` — see comment in `session-manager.ts`). REST endpoints: sessions CRUD + stats + heartbeat, agents (list / spawn / stop), tool-calls, channel, docs, sandbox, procedures, test-results, project-memory, dm, secrets (AES-256-GCM), user-input (long-poll), agent-cancel, browser (navigate/click/type/wait/screenshot/…), exec-diff, test-tools (validate_claim, api_inventory).
2. **`packages/mcp`** — MCP stdio server spawned by the SDK per session with `AGENTDECK_{SESSION,AGENT,PROJECT}_ID` + `AGENTDECK_PROXY_URL` in env. Each tool is an HTTP shim onto the proxy. In CLI-bridge mode, a 30 s heartbeat ping keeps the session alive in the hub; when the CLI dies, the proxy watchdog auto-finalizes the bridge session within ~90 s.
3. **`packages/shared`** — 21-table Drizzle schema (sessions, agents, events, tool_calls, channel_messages, docs, procedures, test_results, project_memory, direct_messages, secrets, exec_runs, user_inputs, browser_screenshots, agent_cancel_requests, campaigns, campaign_metrics, campaign_retrospectives, agent_tasks, agent_incidents, internal_findings) + 27-type zod discriminated union of events. Zod 4 native `z.toJSONSchema()` for MCP tool input schemas.
4. **`apps/web`** — Next.js 15 + React 19 + Tailwind 3.4 + shadcn/ui + `dockview-react`. **Two-page model (v0.0.9+):**
   - **`/`** — the hub. Style B "expressif" chrome (multi-radial ambient gradient bg, glass surfaces with `.glass` + `.ring-soft` utility classes, violet→pink `.grad-accent` for primary CTAs and active tabs). Global KPI bar (4 glass cards with colored orbs: active projects / active sessions / tool calls running / live right now). Pill-shaped filter toolbar (search + Active/Past/All segmented control + Refresh). Project cards: 1 card per connected CLI / project, status badge with pulse-dot, micro-stats (agents/tools/tests/sess), last channel preview, status glow on live cards (emerald/amber/rose), and an **inline `Show N teams ▾` expander** that lazy-fetches the project's sessions and renders them via the inline `<TeamList>` (replaces the deleted `/projects/[id]` deep-view; click a row → side-sheet with agents + their full skill/prompt). Auto-expanded when there's only one project (single-CLI case). Click anywhere on the card top zone → `/sessions/<latestSessionId>` directly. Header carries a **Findings** badge linking to `/internal/findings`, highlighted orange with a count when there are open `error|critical` self-bugs. Refreshes every 8 s (REST poll, no Socket.IO on the hub yet).
   - **`/sessions/[id]`** — single-session dashboard. Same Style B chrome (max-w-[1400px] glass shell). Sticky header glass pill with title/status/live dot/tokens/stream indicator + overflow menu. ReplayScrubber under the header (violet accent + grad-accent "back to live" button). KPI strip with **5 glass cards** (sub-agents / tool calls / **planning** w/ breakdown / channel / tests). Main pair: **AgentTree** (tree with info icon → side-sheet "Agent detail" with full skill/prompt + DMs ; client-side `useAgentStuckStatus` hook adds a stuck badge on agents silent ≥ 3 min) + **ActivityFeed** (unified timeline of channel + tool calls + docs + tests + agent lifecycle + watchdog warnings/interventions, with pill-tab filters + auto-scroll + "N new" jump-to-latest grad-accent button, virtualized above 500 events). Row 3 tabs (pill-style): Agents & context (skill tiles) / Planning (Gantt + Calendar + Progress) / DMs / Docs / Tests / Channel history. Sticky footer glass pill with `UserInputBar` (gradient Send button) for human injections via `await_user_input`. When `GET /sessions/:id` returns 404, the dashboard route switches to a `SessionNotFound` screen and **stops polling** so truncated/stale URLs don't flood devtools with 404s.
   - **`/sessions/[id]/dockview`** — classic tiling-panels view, preserved as a power-user alternative; not restyled.
   - **`/internal/findings`** — admin page for the FB-10 self-bug-tracker. Same Style B chrome, 4-card glass summary strip + pill filters + glass table + side-sheet for finding detail + glass action footer. Listed in the header `Findings` badge so it's reachable without typing the URL.
   - **`/projects/:path*`** — **deleted in v0.0.9.** Any `/projects/...` URL hits a permanent (HTTP 308) redirect to `/` declared in `apps/web/next.config.ts`. The dynamic route file was removed. Bookmarks resolve cleanly without flashing a project page.
   - **Style B design tokens** live in `apps/web/src/app/globals.css` (`@layer components` + `@layer utilities`). Custom utility classes used across the surface: `.glass`, `.ring-soft`, `.grad-accent`, `.grad-text`, `.glow-{cyan,amber,emerald,rose}`, `.pulse-dot` (1.6s ease-in-out). `tailwind.config.ts` extends `fontFamily.sans` + `fontFamily.mono` from `next/font/google` Inter + JetBrains Mono variables; adds `boxShadow.soft-pop` (violet drop) + `animation.pulse-dot`. **Tailwind 3.4** — `@theme` CSS-first not used; CSS variables in `:root.dark` drive the shadcn token bridge.

## Critical invariants

- **SDK event translator** (`packages/proxy/src/sdk-translator.ts`) uses three maps:
  - `taskIdToAgentId`: SDK `task_id` → our agent UUID (for `task_updated`).
  - `toolUseOwner`: `tool_use.id` → the agent that emitted it (routes tool_results back correctly).
  - `taskToolUseToChild`: `tool_use.id` of a `Task` call → the subagent UUID (routes subagent messages via `parent_tool_use_id`).
  Two maps are required because a `Task` `tool_use_id` points both to the orchestrator (who emitted the tool call) AND to the spawned subagent (whose messages carry it as `parent_tool_use_id`). Writing to a single map overwrites the semantics.
- The SDK does not stream subagent text tokens as `stream_event`. Subagent output arrives as `tool_result` on the Task tool_use; the translator extracts text blocks and emits them as `agent.message.delta` on the subagent panel + `agent.stopped` synchronously.
- `permissionMode: 'bypassPermissions'` **plus** explicit `allowedTools: ['mcp__agentdeck__*']`. Without both, Claude blocks on permission prompts that never get answered in headless SDK mode.
- Every domain fact (channel post, doc publish, test result, etc.) is written to its own table AND appended to `events` in the same transaction — session replay works from `events` alone.
- Path resolution for `DATABASE_URL` / `WORKSPACE_ROOT` happens against the repo root via `packages/proxy/src/config.ts` walking ancestors to find `pnpm-workspace.yaml`. Never use `process.cwd()` for data paths — `pnpm --filter` changes the cwd of spawned processes.
- **Bridge session lifecycle** (`packages/proxy/src/services/bridge-watchdog.ts`). SDK sessions are finalized by their own `runSession()` loop. Bridge sessions (Claude CLI + any external orchestrator that posts `{bridge:true}`) have nothing behind them — the proxy never knows when the owning process dies. Three mechanisms close that gap: (1) an in-memory heartbeat map bumped by `POST /sessions/:id/heartbeat` from the MCP stdio process every 30 s; (2) a watchdog sweep every 30 s that finalizes any bridge whose last heartbeat is older than 90 s (the `BOOT_GRACE_MS` of 60 s defers the first sweep so a freshly-rebooted proxy doesn't reap still-living CLIs); (3) a boot reaper at startup finalizes every bridge still marked `running` in the DB (necessarily ghosts of a prior proxy instance). A revival path in `bumpBridgeHeartbeat` flips a reaped row back to `running` on the first incoming heartbeat so CLIs that survived a proxy restart aren't lost.
- **`runSessions()`** ordering in the dashboard: the REST `GET /sessions/:id` aggregates (agent counts, running tool-call counts, channel/doc/test counts, lastActivityAt, lastChannelMessage) are computed with correlated sub-queries in `persistence.ts:getSession()` and `listSessions()`. The Socket.IO stream fires deltas but not pre-computed counts, so the UI polls REST every 8 s on top of the live event stream. `lastActivityAt` and `lastMessageAt` are normalized to ISO 8601 UTC by `persistence.ts:toIso()` because the SQLite `current_timestamp` default produces `"YYYY-MM-DD HH:MM:SS"` (no T, no Z) which Chrome interprets as local time and breaks `relativeTime()` for non-UTC users.
- **Sub-agent attribution via `X-Agent-Tool-Use-Id`** (v0.0.8+, `services/sdk-attribution.ts` + `services/multi-agent-registry.ts`). The MCP shim extracts `_meta.toolUseId` (or snake_case `_meta.tool_use_id`) from each `CallToolRequest` and forwards it as the `X-Agent-Tool-Use-Id` HTTP header on every shim call. A Fastify `preHandler` middleware on the proxy reads the header, queries the per-session `MultiAgentContext` registry (populated by `runSession()`), and rewrites the agent-attribution body field on 7 routes (channel, dm, docs, sandbox/exec, test-results, agents, agent-cancel) to the real sub-agent UUID. **No-op fallbacks (zero-regression)**: header absent (host doesn't pass it), session not in registry (bridge mode — proxy never sees the SDK), or `toolUseId` not yet in `toolUseOwner` (translator race) all leave the body untouched and preserve current behavior. Set `AGENTDECK_LOG_META=1` in the MCP env to log every `_meta` received in stderr — permanent empirical probe to confirm what the host actually populates. Bridge mode stays open: see `audit/13-sdk-1-design-memo.md` §Gaps for the future `attribute_tool_use` MCP tool that would close it.
- **Tool count single source of truth** (v0.0.8+). The MCP server's `SERVER_INSTRUCTIONS` tool count and `version` are derived dynamically at boot from `TOOL_DEFINITIONS.length` (in `tools.ts`) and the sibling `package.json`. The two manual mirrors that must match (`session-manager.ts allowedTools` for the SDK pre-approval and `install-claude.mjs TOOL_NAMES` for the CLI bridge pre-approval) are validated by `scripts/check-tool-count.mjs`, which runs on every commit (husky pre-commit) and every push/PR (`.github/workflows/ci.yml`). Drift across the three sources broke the bridge five times across v0.0.1→v0.0.7 — this lock-in is non-negotiable.
- **Stuck-agent watchdog** (v0.0.9+, `services/agent-watchdog.ts`). Sweeps every 60 s. For each agent in `running|pending|waiting_tool`, computes `lastEventAt = MAX(events.created_at WHERE agent_id = ? AND type NOT IN ('agent.stuck.warning','agent.stuck.intervention'))` so the watchdog never resets its own clock. Excludes agents in `await_user_input` (legitimate blocked state). Two tiers, each fired AT MOST ONCE per stuck episode (state per-agent: `{warned, intervened, lastSeenAt}`, reset when the agent emits a fresh non-self event so a re-deadlock can be flagged again). 3 min → emit `agent.stuck.warning` only (no DB write — silencieux). 5 min → single transaction: insert `docs` row + auto-publish markdown incident report + post `channel_messages` (`🚨 agent X silent N min — auto-cancel triggered`) + idempotent `agent_cancel_requests` insert + `agent_incidents` row + emit `agent.stuck.intervention`. Sentinel actor `agentId='system:watchdog'`. The UI carries a redundant client-side vigie (`useAgentStuckStatus` in `agent-tree.tsx`) that computes the same thresholds from the SessionProvider event stream so a dead backend still surfaces stuck badges. Errors thrown by the intervention transaction are routed to the FB-10 self-bug-tracker.
- **Self-bug-tracker** (v0.0.9+, `services/internal-bug-tracker.ts`). Single entry point `reportInternalFinding({severity, source, category, message, stack?, context?})` — sync, idempotent. Fingerprint = SHA-1 of `${source}::${category}::${normalized message}` (UUIDs and digits collapsed) so repeat occurrences bump `occurrences` + `lastSeenAt` instead of inserting. Sanitization at capture: strip ANSI, drop `file://` + Windows paths, redact `api_key|password|secret|token|bearer|Authorization|x-api-key` patterns, truncate every string to 500 chars. Captures auto-installed in `server.ts`: process-level (`uncaughtException`, `unhandledRejection`) + Fastify `onResponse` hook on every ≥ 500 response + the FB-01 watchdog reports its own transaction failures. The `internal_findings` table is queryable via REST `/internal/findings` and surfaced on the admin page `/internal/findings`. Last-resort: if the DB itself is down at write time, the tracker logs to stderr — it never throws.

## Common commands

```bash
pnpm install              # first-time setup (compiles better-sqlite3, runs `prepare`
                          # hooks: husky install + @agentdeck/mcp build)
pnpm --filter @agentdeck/proxy exec playwright install chromium   # Chromium for browser tools
pnpm db:generate          # after any schema.ts change
pnpm db:migrate           # apply migrations
pnpm dev                  # turbo runs proxy + web + mcp in parallel
pnpm typecheck            # all workspaces
pnpm check:tool-count     # validate tools.ts / session-manager / install-claude alignment
node scripts/launch.mjs   # production launcher (proxy + web + open browser)
# or on Windows: double-click start.cmd
```

## Conventions

- **ESM everywhere**, `"type": "module"`, `.js` extensions in relative imports.
- **Zod-first for boundaries** — every HTTP body, Socket.IO payload, MCP tool input, env var.
- **IDs are UUIDv4**. Event sourcing PK is the only autoincrement.
- **Per-session sandbox** under `data/workspaces/<sessionId>/sandbox/`. `sandbox_*` tools refuse any path that resolves outside it.
- **Secrets** encrypted AES-256-GCM, master key at `~/.agentdeck/master.key` (or `AGENTDECK_SECRETS_KEY` env).
- **Playwright** tries `channel: 'chrome' → 'msedge' → bundled chromium`. Default: one `Browser` + one session-level `BrowserContext` + `Page` per session. Sub-agents opt into **per-agent isolated contexts** via `browser_new_context` — required whenever two or more agents run personas in parallel, otherwise cookies/localStorage/SW leak across personas and produce false-positive bug reports (see the IndusForge post-mortem under `procedures/METHODOLOGY-REVIEW.md`).
- **Do not add Postgres** unless multi-user server mode lands.
- **Don't touch `apps/desktop`** — Tauri is deferred; the launcher (`scripts/launch.mjs`) and the `pkg`-based exe (`scripts/build-exe.mjs`) are the shipping paths. See `apps/desktop/README.md` for the three triggers that would re-open the question.
- **Husky pre-commit + GitHub Actions** (`.husky/pre-commit`, `.github/workflows/ci.yml`) lock in `pnpm check:tool-count` on every local commit and every push/PR. Don't bypass with `--no-verify` unless explicitly authorized.
- **Release notes live in `CHANGELOG.md`** at the repo root (since v0.0.8). The `audit/` folder ships with the repo — campaign artefacts are versioned for the next campaign's diff baseline (see `audit/README.md`).

## Windows gotchas

- Spawning `pnpm.cmd` / `tsx.cmd` without `shell: true` gives `EINVAL` on recent Node; with `shell: true`, `cmd.exe` is an intermediate parent that can drop stdout from deep children. The launcher calls `process.execPath` + the direct JS entry of `tsx` (under `node_modules/.pnpm/tsx@*/.../cli.mjs`) and `next` (under `apps/web/node_modules/next/dist/bin/next`).
- Readiness checks use `net.createConnection`, not `fetch` — more reliable on Windows localhost.

## Testing a target SaaS

Agentdeck's whole point is to be pointed at a separate SaaS and have
sub-agents exercise it. Three high-leverage primitives were added after
the first real campaign (IndusForge, eyeot ERP, 2026-04):

- **`browser_new_context`** — each sub-agent gets its own isolated
  BrowserContext so parallel personas don't contaminate each other.
  First call of any UI sub-agent should be
  `browser_new_context({reset: true})`.
- **`validate_claim`** — re-executes a claimed HTTP call from the proxy
  (server-side fetch, no browser) to verify "I saw X" reports before
  escalating to the human. Antidote to false positives from contaminated
  browser state. **Automatically retries on HTTP 429** (honours
  `Retry-After`, falls back to exponential back-off capped at
  `maxBackoffMs`, default 3 retries). Reports `retries` and `backoffMs`
  in the result so large probe matrices against IP-rate-limited backends
  don't need hand-coded sleeps.
- **`api_inventory`** — grep-scans the target's source tree for route
  decorators (Flask / FastAPI / Express / Fastify) and returns
  `{method, path, file, line, handler, permissionRequired, blueprint?}`
  for every route. Resolves Flask blueprint prefixes via two-pattern DFS
  from `app`. Feeds exhaustive-coverage test procedures.
  Optional `selfCheck: {baseUrl, sampleSize?, threshold?}` probes N GET
  routes against the live backend and flags `suspectedParsingIssue:true`
  when the ratio of suspicious responses (3xx / 404 / 5xx) exceeds the
  threshold — catches silent parsing bugs **before** an agent builds a
  test matrix on a broken inventory.

Four runbooks compose these into complete campaigns:
- `procedures/exhaustive-crud-test.md` — full CRUD matrix, zero-omission.
- `procedures/isolated-ui-smoke.md` — parallel persona UI without contamination. **Default Phase 4 runbook** — auto-attached to `read_methodology({section:'phase-4' | 'principles'})` since v0.0.7.
- `procedures/rbac-probe.md` — privilege matrix audit (allow-should-deny + deny-should-allow).
- `procedures/claim-validator.md` — background triage of sub-agent bug reports.

Before pointing agentdeck at a new SaaS, work through
`procedures/SAAS-PREREQS.md` — skipping any item on that checklist is
the #1 reason a campaign burns its first hour on environmental friction.

### Principe 10 gate — UI-only en Phase 4 (v0.0.7+)

Phase 4 personas must drive the target SaaS through `browser_*` tools
only — `validate_claim`, `fetch()` from console, `curl` are forbidden as
the primary interaction path (allowed only for Phase 1 cartographie and
Phase 5 claim-validator). `end_campaign` enforces this at clôture:

- For each non-orchestrator sub-agent (parentAgentId not null, role not in
  `{orchestrator, root, bridge, claim-validator, skill}`), it computes
  `uiCoverageRatio = browser_* / (browser_* + validate_claim + sandbox_exec(curl))`.
- Below `0.5` ratio (with ≥ 5 relevant tool calls) → HTTP 422
  `ui_coverage_violation` unless `retrospective.toolingFeedback` carries an
  explicit `UI-EXEMPT: <agent name>: <reason>` line per offender.
- Between `0.5` and `0.7` → soft warning surfaced in the end_campaign
  response (`uiCoverage.warnings`).
- Above `0.7` → silent pass.

Backend-only audits (rest-auditor, schema-auditor, perf-auditor on
agentdeck itself) ship with a blanket waiver in their orchestrator
templates so the gate doesn't false-positive.

## Claude CLI bridge

`scripts/install-claude.mjs` (entrypoint: `install-claude.cmd`) writes `mcpServers.agentdeck` into `%USERPROFILE%\.claude\settings.json` and pre-approves the 47 `mcp__agentdeck__*` tools. Uninstall via `scripts/uninstall-claude.mjs`.

In CLI mode, the MCP's `AGENTDECK_SESSION_ID` env var is absent. `ProxyClient.ensureReady()` lazily creates a **bridged session** (`POST /sessions { bridge: true }`) on the first tool call — the session exists only as a container for the Claude CLI's tool invocations; the proxy does **not** spawn a Claude Agent SDK `query()` for it (that's the key difference with sessions started from the web UI). On bootstrap, the MCP starts a 30 s heartbeat loop (`POST /sessions/:id/heartbeat`) that keeps the bridge session "running" in the hub; when the CLI dies, the timer stops with the process and the proxy watchdog finalizes the session within ~90 s (see **Bridge session lifecycle** in Critical invariants). The first tool result is prefixed with `[agentdeck] bridged session: http://127.0.0.1:3000/sessions/<id>` so the user can open the dashboard.

**Bridge agent name** — defaults to `claude-cli` (was `unnamed-cli` historically, opaque). Two override paths: (a) set `AGENTDECK_SKILL_NAME=<my-skill>` in the MCP `env:` block of `~/.claude/settings.json` so the hub shows the skill name from boot with no extra call required; (b) call `mcp__agentdeck__set_agent_identity({name})` mid-session to rename a running bridge.

**Sub-agent registration** — when a skill or orchestrator fans out work via Task() / multi-persona patterns, call `mcp__agentdeck__spawn_agent({name, role?, prompt?, parentAgentId?})` to register each sub-agent so it appears in the AgentTree with its own activity feed and tool-call counters. Pair with `mcp__agentdeck__stop_agent({agentId, status})` at end-of-run. Without this, the proxy sees only one noisy agent (the bridge root) doing everything.

**Sub-agent attribution in bridge mode** is **partially open** — `X-Agent-Tool-Use-Id` (v0.0.8) closes the gap for proxy-hosted SDK sessions but bridge sessions don't have a `toolUseOwner` map on the proxy side (the SDK runs in the host process, the proxy never sees the events). Channel posts / DMs / docs / test-results / sandbox-exec / etc. emitted by a Claude Code sub-agent through the bridge **continue to be attributed to the bridge root** until a future `attribute_tool_use({toolUseId, agentId})` MCP tool is shipped. Cf. `audit/13-sdk-1-design-memo.md` §Gaps.

Pre-built `packages/mcp/dist/index.js` is required for CLI bridge because `claude` spawns the command without access to `tsx`. The `prepare` hook in `packages/mcp/package.json` rebuilds it on every `pnpm install`; manual rebuild via `pnpm --filter @agentdeck/mcp build` if you change `src/` mid-session.

## Full-fidelity bridge — `agentdeck-run` skill + `/agentdeck-self-test` (v0.0.9+)

agentdeck is a **passive receiver**. Every dashboard surface (AgentTree, Channel, DMs, Docs, Tests, Planning, AgentDetail) only fills if the running skill explicitly calls the matching `mcp__agentdeck__*` tool. Without that discipline, a CLI session shows up as a single `claude-cli` row with an empty activity feed even when the agent did real work.

- **`process/skills/agentdeck-run/SKILL.md`** — auto-triggerable Claude Code skill (frontmatter `name`+`description`) that documents the protocol and instructs Claude to follow it: identity → planning → spawn sub-agents (with full prompt as context) → channel/DMs → tests → docs → progress updates → stop. Triggers when the user mentions agentdeck explicitly or runs a multi-step task that would benefit from observability.
- **`process/commands/agentdeck-self-test.md`** — slash command `/agentdeck-self-test` that exercises the 13 key tools in sequence as a synthetic smoke test of the bridge plumbing.
- **`scripts/install-skills.mjs`** — copies `process/skills/*` → `~/.claude/skills/*` and `process/commands/*` → `~/.claude/commands/*`. Idempotent. Sources of truth live in the repo so the skill is versioned with the rest of agentdeck.
- **`scripts/test-cli-bridge.mjs`** — end-to-end runner. Drives `claude -p "/agentdeck-self-test"` with `--permission-mode bypassPermissions --allowed-tools "mcp__agentdeck__*"` (both required: in `-p` mode the model only calls explicitly allowed tools even with bypass mode). On Windows the prompt is piped via stdin (argv multiline mangles through cmd.exe). Then verifies via REST that the resulting bridge session has root identity != `claude-cli`, root prompt non-empty, ≥ 1 sub-agent, ≥ 3 channel messages, ≥ 1 DM, ≥ 2 tasks (≥ 1 completed), ≥ 1 test result, ≥ 1 doc. **9/9 green = the skill template is full-fidelity.** Run after every modification of `agentdeck-run/SKILL.md` to catch regressions.
- **`scripts/seed-demo.mjs`** — POSTs 5 realistic demo sessions (indusforge, eyeot-erp, agentdeck-self-audit, ecom-bench, client-acme) with channel, DMs, docs, planning tasks and test results so the redesigned UI has material to render. `--keep-alive` flag enters an infinite heartbeat loop after seeding so bridge sessions stay `running` (the watchdog otherwise finalizes them after 90 s of silence). Wipe + reseed: `rm data/agentdeck.db data/agentdeck.db-* && pnpm db:migrate && node scripts/seed-demo.mjs --keep-alive`.

## External orchestrator integration

Any process that runs outside the Claude Agent SDK — a CLI with a multi-persona skill, a Python script, another SDK instance — can make its sub-agents visible in the hub. From inside a Claude Code skill the simplest path is the MCP shims (`mcp__agentdeck__spawn_agent` + `mcp__agentdeck__stop_agent`); for a non-Claude orchestrator that has no MCP host, hit the REST endpoints directly:

1. `POST /sessions { projectId, prompt, title, bridge:true, rootAgentName, rootAgentRole }` → create the session, get `{sessionId, rootAgentId}`. (MCP equivalent: automatic on first tool call.)
2. For each sub-agent: `POST /sessions/:id/agents { name, role, prompt, parentAgentId: rootAgentId }` → the `prompt` field is what the dashboard renders as the agent's **context/skill** in the Agent Detail side-sheet and the "Agents & context" tab. (MCP: `spawn_agent({name, role?, prompt?, parentAgentId?})`.)
3. Coordinate via `POST /sessions/:id/channel` (broadcast) and `POST /sessions/:id/dm` (private pairs). Both trigger live events consumed by the dashboard.
4. At the end: `POST /sessions/:id/agents/:agentId/stop { status }` per sub-agent (MCP: `stop_agent({agentId, status})`), then `POST /sessions/:id/cancel` to finalize the session.
5. Heartbeat every 20–30 s via `POST /sessions/:id/heartbeat` for the duration of the run so the session stays "active" in the hub.

The hub UI is **agnostic to the target product**: nothing is hardcoded about CRMs, ERPs, or any specific domain. Everything displayed (titles, roles, skill contents, DM pairs) comes from the data posted by the orchestrator. A reference example lives at `G:/eyeot/ERP/_team/agentdeck-test/run-multi-agent-demo.ts`.

## Replay scrubber

`SessionProvider` exposes `{ events, totalEvents, scrubIndex, setScrubIndex, isLive }`. When `scrubIndex` is not `null`, it slices the event array at `[0, scrubIndex+1)` and passes the truncated list downstream — all panels re-fold from that truncated stream naturally because they're pure reducers over `events`. The `ReplayScrubber` component sits between the header and the dockview and drives `scrubIndex`.

## Activity feed virtualization (v0.0.8+)

`/sessions/[id]` auto-switches between two `<ActivityFeed/>` implementations:

- **Default** (`activity-feed.tsx`) — radix `<ScrollArea/>` + plain `.map()`. Smoothest under ~500 events.
- **Virtualized** (`activity-feed-virtualized.tsx`) — react-window v2 `<List/>` + `useDynamicRowHeight` (auto ResizeObserver). Activated when `events.length >= VIRTUALIZE_THRESHOLD` (constant exported = 500), or forced via URL param `?virtualize=1` / `?virtualize=0` (override).

Both share `foldEvents` / `FeedRow` / `Filter` / `TONE_CLASSES` exports — the rendered output is identical, only the rendering strategy differs. Adjust the threshold based on perf-auditor measurements; 500 is conservative.

## Known open items

- **Tauri 2 packaging** — deferred, requires Rust toolchain + MSI signing. Launcher (`scripts/launch.mjs`) + `pkg`-based exe (`scripts/build-exe.mjs`) are the current shipping paths. Three explicit re-evaluation triggers documented in `apps/desktop/README.md`.
- **BUG-SDK-1 in bridge mode** — the v0.0.8 forward-compat patch fixes proxy-hosted SDK sessions; bridge sessions still attribute sub-agent writes to the bridge root because the proxy doesn't see the SDK event stream. Future fix in `audit/13-sdk-1-design-memo.md` §Gaps.
- **Empirical confirmation that `_meta.toolUseId` is populated by Anthropic SDK in CallToolRequests** — the v0.0.8 patch is forward-compatible but unverified end-to-end. `AGENTDECK_LOG_META=1` makes the MCP a permanent probe; first SDK session run with this env answers it.
