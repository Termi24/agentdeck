# Changelog

Conventions: kept human-readable; cross-referenced to `audit/` campaign reports
and to the user vault under `01-Projects/agentdeck/03-Sprints/Recent-Releases.md`
where applicable. Version line items aligned across the 4 workspaces (root,
proxy, mcp, shared, web) — single bump per release.

## [0.0.9] — 2026-04-28

> Style B web redesign + 2-page model + agentdeck-run skill + bridge tooling.
> A multi-day batch starting from a fresh clone, going through three iterations
> on /projects routes (deep-view → unconditional redirect → server-level kill),
> finishing with a real `claude -p` headless smoke test that catches its own
> bugs. Typecheck + tool-count invariant green; no schema migration needed.

### Added — Style B "expressif" web redesign

- **`apps/web/src/app/globals.css`** — multi-radial ambient body background
  (violet/pink/cyan on `#07060c`), new design tokens in `@layer components`:
  `.glass` (180° linear-gradient + backdrop-blur 14px), `.ring-soft` (inset
  white/6 + outer black/40), `.grad-accent` (violet→pink 135°), `.grad-text`
  (3-stop violet→fuchsia→rose), `.glow-{cyan,amber,emerald,rose}` (1px ring
  + 30px coloured drop), `.pulse-dot` (1.6s ease-in-out keyframes in
  `@layer utilities`).
- **`apps/web/tailwind.config.ts`** — extends `fontFamily.sans` and `.mono`
  from `next/font/google` Inter Variable + JetBrains Mono. Adds
  `boxShadow.soft-pop` (violet drop) and `animation.pulse-dot`.
- **`apps/web/src/app/layout.tsx`** — Inter Variable + JetBrains Mono via
  `next/font/google` (variables `--font-sans` + `--font-mono`).
- **Refondue page-by-page** to glass + rounded-2xl + pill toolbars + KPI orbs
  + status glow on live cards: `/` (hub), `/sessions/[id]` and its components
  (SessionHeader, KpiStrip, AgentTree, ActivityFeed + virtualized,
  SessionTabs incl. AgentTile/Tests table/DM/Channel, ReplayScrubber,
  UserInputBar, AwaitingInputBanner, AgentDetailSheet, PlanningView via
  Tailwind class sweep), `/internal/findings`, hub/SessionViews. The legacy
  `border-border/60 bg-card/40` pattern was systematically replaced with
  `glass ring-soft border-white/10 bg-transparent rounded-2xl`.

### Added — 2-page model (deletion of `/projects/[id]`)

- **`apps/web/next.config.ts`** — permanent (HTTP 308) redirect from
  `/projects/:path*` → `/`. Resolves before any client code runs; bookmarks
  to /projects/default, /projects/foo/bar, etc. all land on the hub
  cleanly.
- **`apps/web/src/app/projects/[projectId]/page.tsx`** — **deleted.** The
  whole `app/projects/` directory is gone.
- **`apps/web/src/app/page.tsx` `ProjectCard`** refactor — split the single
  Link wrapper into three zones: top (header + stats + last channel) →
  navigates directly to `/sessions/<latestSessionId>` (was `/projects/[id]`
  for multi-session projects); middle Teams expander → action-local, hors
  Link; footer → tokens + first-seen meta only ("open project →" link
  removed). Auto-expanded when there's only one project so single-CLI
  users see the team rows immediately.
- **`apps/web/src/components/projects/team-list.tsx`** — `variant: 'card'
  | 'inline'` prop removed, the inline rendering (just rows + side-sheet)
  is the only mode now. The `card` wrap only existed for `/projects/[id]`.

### Added — agentdeck-run skill + /agentdeck-self-test slash command

- **`process/skills/agentdeck-run/SKILL.md`** — auto-triggerable Claude Code
  skill with frontmatter `name`+`description`. Documents and enforces the
  protocol that populates every dashboard surface from a CLI bridge:
  `set_agent_identity` first, `task_plan` upfront, `spawn_agent` per
  persona (with **full skill text as `prompt`**, not a 5-word summary),
  `post_to_channel` + `send_direct` at every meaningful step,
  `report_test_result` per assertion, `publish_doc` per artefact,
  `task_update_progress` + `task_complete` as work proceeds, `stop_agent`
  for every sub then root.
- **`process/commands/agentdeck-self-test.md`** — slash command
  `/agentdeck-self-test` that exercises the 13 key tools as a synthetic
  smoke test of the bridge plumbing. Frontmatter `allowed-tools` lists
  the explicit `mcp__agentdeck__*` whitelist required by `claude -p`.
- **`scripts/install-skills.mjs`** — copies `process/skills/*` →
  `~/.claude/skills/*` and `process/commands/*` → `~/.claude/commands/*`.
  Idempotent. The repo is the source of truth, the user copy is generated.
- **`process/agentdeck-skill-template.md`** — long-form documentation of
  the same protocol, ready to paste into any skill that needs to enforce
  full-fidelity observability.

### Added — bridge end-to-end testing

- **`scripts/test-cli-bridge.mjs`** — runs `claude -p "/agentdeck-self-test"`
  with `--permission-mode bypassPermissions --allowed-tools "mcp__agentdeck__*"`
  (both required: in `-p` mode the model only calls explicitly allowed
  tools even with bypass mode). On Windows the prompt is piped via stdin
  (multiline argv mangles through cmd.exe). After the run, fetches the new
  bridge session via REST and asserts: root identity != `claude-cli`, root
  prompt non-empty, ≥ 1 sub-agent, ≥ 3 channel messages, ≥ 1 DM, ≥ 2 tasks
  (≥ 1 completed), ≥ 1 test result, ≥ 1 doc published. **9/9 green = the
  skill template is full-fidelity.** Run after every modification of
  `agentdeck-run/SKILL.md` to catch regressions.
- **`scripts/seed-demo.mjs`** — POSTs 5 realistic demo sessions
  (indusforge / eyeot-erp / agentdeck-self-audit / ecom-bench / client-acme)
  with channel, DMs, docs, planning tasks (Gantt material) and test results
  so the redesigned UI has rich content to render. `--keep-alive` flag
  enters an infinite heartbeat loop for the freshly-created bridge sessions
  so they stay `running` (the bridge-watchdog otherwise finalizes them
  after 90 s of silence). Wipe + reseed: `rm data/agentdeck.db
  data/agentdeck.db-* && pnpm db:migrate && node scripts/seed-demo.mjs
  --keep-alive`.

### Fixed

- **`packages/mcp/src/index.ts` `stop_agent` shim** — the shim was reading
  `r.agentId` on the proxy response, but the proxy returns 204 No Content
  (body null) → `Cannot read properties of undefined (reading 'agentId')`.
  Compose the confirmation string from the input arguments instead.
  Discovered organically by Claude during the first real
  `test-cli-bridge.mjs` run — the system caught its own bug, confirming
  the FB-10 self-bug-tracker pattern works end-to-end.

### Removed

- **`apps/web/src/app/projects/[projectId]/page.tsx`** and the entire
  `apps/web/src/app/projects/` directory — the deep-view route is gone.
- **`TeamList.variant: 'card'`** — only `inline` remains.
- **"open project →"** footer link in `ProjectCard` — no project page to
  link to.

### Verification

- `pnpm typecheck` clean across all 4 workspaces.
- `pnpm check:tool-count` clean (47/47 aligned).
- `node scripts/test-cli-bridge.mjs` returns 9/9 green:
  `Self-test complete: 13 tool calls executed, smoke-worker stopped.`
- `curl -I /projects/default` → `HTTP 308 → /`.
- `curl -I /projects/anything-else/with/path` → `HTTP 308 → /`.

---

## [Unreleased] — work landed 2026-04-27 on `main`

> Amine UX/process batch — 10 items collected during a live session, all
> patched in-place. Typecheck + tool-count invariant green; new migration
> `0006_high_firebrand.sql` applied without restarting the running proxy.

### Added — FB-01 stuck-agent watchdog

- **`packages/proxy/src/services/agent-watchdog.ts`** — sweeps every 60 s. For every `running|pending|waiting_tool` agent, computes `lastEventAt` via correlated subquery (excluding self-emitted `agent.stuck.*`), excludes agents in `await_user_input`. **3 min** silent → emit `agent.stuck.warning` only (no DB write). **5 min** → single transaction: doc auto-published with full incident markdown + channel message `🚨 agent X silent N min — auto-cancel triggered` + idempotent `agent_cancel_requests` insert + `agent_incidents` row + `agent.stuck.intervention` event. State per-agent `{warned, intervened, lastSeenAt}` resets on fresh activity so re-deadlocks can be re-flagged. Sentinel actor `agentId='system:watchdog'`. Errors raised by the intervention transaction are reported to the FB-10 tracker.
- **`apps/web/src/components/session/agent-tree.tsx`** — client-side vigie hook `useAgentStuckStatus` reading the SessionProvider event stream. Same 3 min / 5 min thresholds, computed independently — survives a dead backend (true "double watchdog" per the user spec). Adds a stuck badge `Nm` (orange / red) on each affected `AgentRow` with tooltip and tinted row background. Header shows `{stuckCount} stuck` aggregate.
- **`apps/web/src/components/session/activity-feed.tsx`** — folds `agent.stuck.warning` (`CircleDashed` icon, amber tone) and `agent.stuck.intervention` (`XCircle`, red tone) into the unified feed.

### Added — FB-10 self-bug-tracker (méta-agent)

- **`packages/proxy/src/services/internal-bug-tracker.ts`** — `reportInternalFinding({severity, source, category, message, stack?, context?})`. Synchronous, idempotent. SHA-1 fingerprint of `${source}::${category}::${normalized message}` (UUIDs + digits collapsed) so repeat occurrences bump `occurrences` + `lastSeenAt`. Sanitization at capture time: strip ANSI, drop `file://` + Windows paths, redact `api_key|password|secret|token|bearer|Authorization|x-api-key` patterns, truncate to 500 chars. Last-resort behaviour: if the DB write itself fails, log to stderr — never throws out of the tracker.
- **Auto-installed captures** in `server.ts` at boot: `process.on('uncaughtException')` + `unhandledRejection` + Fastify `onResponse` hook for every ≥ 500 response. The FB-01 watchdog also reports its own transaction failures. 4xx is the caller's fault and intentionally ignored.
- **`packages/proxy/src/routes/internal-findings.ts`** — REST surface: `GET /internal/findings?status=&severity=&source=&limit=`, `GET /internal/findings/summary`, `PATCH /internal/findings/:id` (status / fixedInVersion), `DELETE /internal/findings/:id`.
- **`apps/web/src/app/internal/findings/page.tsx`** — admin UI: 4-card summary strip (open / openHighSeverity / fixed / total) + filters status × severity, sortable table, click row → side-sheet (message + stack + context + fingerprint), action footer {triage, mark fixed, wontfix, purge}. Polls every 8 s.
- **Findings badge** in the home header (`apps/web/src/app/page.tsx`) linking to `/internal/findings`, highlighted orange with a count when there are open `error|critical` findings.

### Added — schema delta

- **`agent_incidents`** table — id, sessionId (FK), agentId, severity (`warning|intervention`), stuckMinutes, snapshot JSON, actionTaken, incidentDocPath, createdAt. Indexed on sessionId + agentId. Storage of record for FB-01 5-min interventions; warnings are event-only.
- **`internal_findings`** table — id, fingerprint (indexed), severity (`info|warn|error|critical`), source (`proxy|mcp|browser|watchdog|ui|other`), category, message (≤ 500 chars sanitized), stack, context JSON, occurrences, status (`open|triaged|fixed|wontfix`, indexed), fixedInVersion, firstSeenAt, lastSeenAt (indexed).
- **2 new event types**: `agent.stuck.warning`, `agent.stuck.intervention`. The FB-10 self-bug-tracker is intentionally NOT a session-scoped event — findings can occur outside any session (boot exception, watchdog tick).
- Migration `packages/shared/src/db/migrations/0006_high_firebrand.sql`.

### Added — FB-03 Teams view per project

- **`apps/web/src/components/projects/team-list.tsx`** — section "Teams in {projectId}" on the project page. One row per session = one team (read-only per user choice). Click → side-sheet (`TeamSheet`) listing the orchestrator + sub-agents with name/role/status/model + collapsible full prompt + per-agent stats {tools, channel, dms}. Reuses `LiveDot`/`statusClasses`/`relativeTime` from `session/shared`.

### Added — FB-07 headless / windowed prompt for UI campaigns

- **`mcp__agentdeck__browser_new_context`** now accepts an optional `headless: boolean` field. The first call to any `browser_*` tool in a session locks the Browser launch mode (Playwright constraint). The response reports the resolved `headless` and `browserAlreadyLaunched: boolean` so the caller can confirm whether their flag took effect.
- **`packages/proxy/src/services/browser-manager.ts`** — `tryLaunch(headless)`, `openFor` accepts `{ headless? }`, new `headlessMap` for synchronous reads, exports `isBrowserLaunched` + `getBrowserHeadlessMode`. `getPage` and `resetAgentContext` propagate the option.
- **`SERVER_INSTRUCTIONS`** step **3a. UI MODE** — orchestrators must call `await_user_input` before the first `browser_*` to ask "headless or windowed", then forward to `browser_new_context({ headless })`.

### Added — FB-05 team-chat awareness

- **`SERVER_INSTRUCTIONS`** new section **TEAM COMMUNICATION** explicitly lists `post_to_channel` / `read_channel` / `send_direct` / `read_direct` with usage cues so spawned agents know they have a shared chat for findings, blockers, status updates. Before this, agents siloed themselves because the methodology principles only mentioned the channel as one bullet.

### Added — FB-02 Planning surfaced in the KPI strip

- **`apps/web/src/components/session/kpi-strip.tsx`** — 5th KPI **Planning** with breakdown `▸ in_progress · ! blocked · ✓ completed · ○ planned`, computed live from `agent.task.*` events folded in `apps/web/src/app/sessions/[id]/page.tsx`. Grid switches from `md:grid-cols-4` → `md:grid-cols-5`. The Planning tab in row 3 already existed; the KPI elevates it so the surface isn't missed.

### Changed

- **`apps/web/src/app/page.tsx`** — header subtitle "all projects · cross-project hub" (was "project hub"); Findings badge link in the nav.
- **`apps/web/src/app/projects/[projectId]/page.tsx`** — auto-redirects `/projects/default` → `/` when `default` is the only project (FB-09: collapses the implicit-bucket duplicate). Header breadcrumb is now a text "← All projects" link (was an icon-only chevron). Subtitle dynamic: `{N} sessions · scoped to this project`.
- **`apps/web/src/app/sessions/[id]/page.tsx`** — removed the `RunningTools` 3rd-column panel (FB-04: redundant with the KPI strip + tool_call entries in the feed). `ActivityFeed` now spans `md:col-span-9`.
- **`apps/web/src/components/session/session-tabs.tsx`** — Tabs in controlled mode with `requestAnimationFrame` scroll-Y restore + `min-h-[480px]` on `CardContent` (FB-08: clicking a tab no longer makes the page jump to the top). Tests / Channel / DMs scrollers use `h-[460px]` instead of `max-h-[400px]` so the radix viewport gets a resolved height (FB-06).

### Fixed

- **FB-06** Tests tab not scrollable on overflow (radix viewport height didn't propagate from a `max-h`-only ancestor).
- **FB-08** Page jumps to the top on tab change (caused by tab content height mismatch shrinking the page below the user's scroll position).
- **FB-09** `/projects/default` and `/` showing the same data when `default` was the implicit bucket.

### Vault

- **`01-Projects/agentdeck/06-Tests-QA/FEEDBACK-2026-04-27-amine-ux-batch.md`** — full backlog + per-item architecture notes, status table, files-touched index, validation checklist.

## [0.0.8] — 2026-04-26

### Added

- **`scripts/check-tool-count.mjs`** + `pnpm check:tool-count` — single-source-of-truth validator for the 47 MCP tools across `packages/mcp/src/tools.ts`, `packages/proxy/src/session-manager.ts allowedTools`, and `scripts/install-claude.mjs TOOL_NAMES`. Exit non-zero on drift.
- **Husky pre-commit** invoking `pnpm check:tool-count` so drift is caught locally before push.
- **GitHub Actions CI** (`.github/workflows/ci.yml`) — pnpm 9 + Node 22, runs `check:tool-count` then `pnpm typecheck` on push/PR to `main`.
- **`packages/proxy/src/services/multi-agent-registry.ts`** — registry of `MultiAgentContext` per proxy-hosted SDK session, populated by `runSession()` and consumed by the new attribution middleware.
- **`packages/proxy/src/services/sdk-attribution.ts`** — Fastify `preHandler` that rewrites the agent-attribution body field on 7 routes (channel, dm, docs, sandbox/exec, test-results, agents, agent-cancel) when a `X-Agent-Tool-Use-Id` header is present and the translator's `toolUseOwner` map resolves it.
- **`apps/web/src/components/session/activity-feed-virtualized.tsx`** — `react-window` v2 variant of `<ActivityFeed/>` using `useDynamicRowHeight`. Branched in `/sessions/[id]/page.tsx` behind an auto-switch above `VIRTUALIZE_THRESHOLD = 500` events, overridable via `?virtualize=1` / `?virtualize=0`.
- **`AGENTDECK_LOG_META=1`** env var on the MCP server — logs every `_meta` object received on `CallToolRequest` to stderr, providing a permanent empirical probe to confirm what the host (Anthropic SDK) actually populates.
- **`audit/`** committed: `11-patches.md`, `12-final-summary.md`, `13-sdk-1-design-memo.md`, `patches/bug-*.md`, `perf/`, `replay/`, `schema/`, `screenshots/`. README in `audit/` documents the convention for next campaigns.
- **REG-008 → REG-017** added to `_qa/regression-suite.jsonl` (was 7 → now 17).
- **`procedures/SAAS-PREREQS.md` section 0** — `curl` checks for proxy + web UI + bridge MCP. Eliminates the ui-playwright-auditor losing its first cycle to `fetch failed`.
- **`procedures/README.md`** rewritten as proper index of the 14 runbooks (cross-cutting / campaign / self-audit / memos).

### Changed

- **MCP server identity is dynamic**: `packages/mcp/src/index.ts` now derives both `version` (from sibling `package.json`) and tool count (from `TOOL_DEFINITIONS.length`) at boot. `SERVER_INSTRUCTIONS` substitutes the count via template literal. Eliminates the endemic drift recorded across v0.0.1 → v0.0.7 (30 / 31 / 36 / 42 / 44 / 47).
- **MCP shim forwards `_meta.toolUseId`**: `proxy-client.ts` now exposes `setCurrentToolUseId` and adds the `X-Agent-Tool-Use-Id` header to every HTTP shim call. The MCP `CallToolRequestSchema` handler in `index.ts` extracts `_meta.toolUseId` (or `_meta.tool_use_id` snake_case fallback), sets it on the proxy client, and clears it in `finally`. Forward-compatible: no-op when the host doesn't populate `_meta`.
- **`packages/mcp/package.json`** : `prepare` hook now rebuilds `dist/index.js` on `pnpm install`. Closes BUG-MCP-B2 (CLI bridge stale dist drift).
- **`apps/desktop/README.md`** rewritten with explicit deferred-indefinitely status, three re-evaluation triggers, and a pointer to `build-exe.mjs` / `launch.mjs` as the current shipping path.
- **`README.md`** : 31/27 → 47 MCP tools, with the full categorized list. Aligned bridge claim to "47 agentdeck tools" in §Bridge.
- **`CLAUDE.md`** : 47-tool count annotated as `TOOL_DEFINITIONS.length` authoritative; allowedTools reference updated to 47.
- **`packages/proxy/src/session-manager.ts`** : `allowedTools` comment updated (47, v0.0.7+); registers/unregisters the `MultiAgentContext` in the multi-agent registry around `runSession()`.

### Fixed

- **Tool count drift** across README (31), bridge install messaging (27), MCP `SERVER_INSTRUCTIONS` (44), and `CLAUDE.md` (mixed 44/47). Now derived from a single source of truth.
- **BUG-MCP-B2** : `packages/mcp/dist/index.js` could go stale relative to `src/` when a tool was added but `pnpm --filter @agentdeck/mcp build` wasn't re-run. The `prepare` hook regenerates it on every install.
- **BUG-REST-001** confirmation : the Windows `STATUS_DLL_INIT_FAILED 0xC0000142` on `sandbox_exec` was already fixed in `packages/proxy/src/services/sandbox.ts` via `shell:true` + `cmd.exe /s /c` + `env: process.env`. REG-014 now covers the regression.
- **BUG-SDK-1** for proxy-hosted SDK sessions : sub-agents who call `mcp__agentdeck__post_to_channel` / `dm` / `docs` / `sandbox_exec` / `report_test_result` / `request_agent_cancel`, or who call `spawn_agent`, are now correctly attributed to themselves rather than the bridge root agent. Bridge-mode sessions stay open — see `audit/13-sdk-1-design-memo.md` §Gaps.

### Vault

- New entries under `01-Projects/agentdeck/` (created 2026-04-26): `_MOC`, `00-Brief/Brief`, `01-Specs/Data-Model`, `02-Architecture/Architecture-Overview`, `02-Architecture/Critical-Invariants` (now with invariant 11), `02-Architecture/ADRs/ADR-{001 dockview, 002 SQLite, 003 sub-agent attribution}`, `03-Sprints/Recent-Releases`, `06-Tests-QA/Procedures-Index`, `08-Domain-Knowledge/9-Principles`, `05-Sessions/2026-04-26`. New category `dev-tool` documented in `01-Projects/_README.md` and `06-Meta/Conventions.md`.

## [0.0.7] — pre-2026-04-26

Principe 10 (UI-only en Phase 4) + `end_campaign` gate. Cf. commit `b2c43dc`.

## [0.0.6]

Project hub + agent task planning + Windows launcher polish (`90106e9`).

## [0.0.5]

Sub-agent registration shims (`spawn_agent` / `stop_agent`) + 10 audit fixes (`21ac84c`).

## [0.0.4]

A1+A2+A3+A4 — `validate_claims_bulk`, 4 inventory scanners, 10 procedures, regression-tester (`9add411`).

## [0.0.3]

7 perf wins from self-audit perf analysis (`39798f5`).

## [0.0.2]

Self-audit patches — aggregates, agent stop, tool_calls. Principle 9 (team planning ≥ 1 week) added (`8a8965c`, `f44bde2`, `f2e6121`).

## [0.0.1]

Initial commit (`59d7250`).
