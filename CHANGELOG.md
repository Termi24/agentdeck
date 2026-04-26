# Changelog

Conventions: kept human-readable; cross-referenced to `audit/` campaign reports
and to the user vault under `01-Projects/agentdeck/03-Sprints/Recent-Releases.md`
where applicable. Version line items aligned across the 4 workspaces (root,
proxy, mcp, shared, web) — single bump per release.

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
