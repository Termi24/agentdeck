# agentdeck

Live observability and test harness for Claude Agent SDK orchestrators and subagents. Watch agents think, talk, test, and drive a real browser — in real time, in your browser.

## What it does

Start a session from the browser, and agentdeck:

- runs it via the Claude Agent SDK, reusing your local `claude` CLI credentials (no API key needed),
- streams every token of **thinking** and **output** into a dedicated panel per agent,
- detects every `Task` subagent Claude spawns and opens a new tab for it automatically,
- exposes **47 MCP tools** to the agents so they can collaborate and test end-to-end (full list in `packages/mcp/src/tools.ts`):
  - channel & docs: `post_to_channel`, `read_channel`, `wait_for_channel`, `publish_doc`
  - sandbox: `sandbox_{write,read,exec}`, `diff_exec`
  - procedures: `list_procedures`, `run_test_procedure`
  - headless browser (Playwright): `browser_{navigate,snapshot,click,type,fill_form,wait_for,press_key,screenshot,new_context,dispose_context}`
  - test reporting: `report_test_result`, `validate_claim`, `validate_claims_bulk`
  - cartography: `api_inventory`, `schema_inventory`, `events_inventory`, `mcp_tools_inventory`, `react_hooks_inventory`
  - methodology + campaigns: `read_methodology`, `start_qa_campaign`, `record_campaign_metric`, `submit_campaign_retrospective`, `end_campaign`
  - persistence: `project_memory_{read,write}`, `secrets_get`
  - coordination: `send_direct`, `read_direct`, `await_user_input`, `request_agent_cancel`, `check_cancellation`
  - identity + sub-agent registration: `set_agent_identity`, `spawn_agent`, `stop_agent`
  - task planning: `task_plan`, `task_update_progress`, `task_complete`,
- renders everything in a **two-page web UI** (v0.0.9+):
  - `/` (hub) — one card per connected CLI / project, with KPIs, last-channel preview, status badge and an inline `Show N teams ▾` expander to browse historical sessions per project. Style B chrome (Raycast/Arc-like): glass surfaces, violet→pink gradient accent, status glows.
  - `/sessions/[id]` — single-session dashboard (KPI strip + AgentTree + ActivityFeed + tabs Planning / Tests / DMs / Docs / Channel + sticky UserInputBar).
  - The classic `dockview-react` tiling workspace is still available at `/sessions/[id]/dockview` for power users.

## Quick start (Windows)

1. Install [Node.js 22+](https://nodejs.org/) and [pnpm 9+](https://pnpm.io/installation).
2. Make sure you are logged in to Claude Code: `claude` (once).
3. First time only: double-click `start.cmd` — installs deps, compiles `better-sqlite3` natively (Visual Studio Build Tools required), downloads headless Chromium for Playwright (~100 MB). Close the window once you see `agentdeck running`.
4. Build the single-file launcher: `pnpm build:exe` → produces **`agentdeck.exe`** (~55 MB, self-contained).
5. Double-click **`agentdeck.exe`** — proxy + web start, your browser opens at `http://127.0.0.1:3000`. Close the window or press Ctrl+C to stop.

Right-click → *Send to → Desktop (create shortcut)* on `agentdeck.exe` to pin it to your desktop. Change its icon via shortcut properties.

Alternative: `start.cmd` (the bash-style launcher) still works if you prefer watching the terminal.

## Bridge into your local `claude` CLI

Make every `claude` CLI session use the 47 agentdeck tools:

1. Double-click `install-claude.cmd` (runs `scripts/install-claude.mjs`). It builds `packages/mcp/dist/index.js`, registers `mcpServers.agentdeck` in `%USERPROFILE%\.claude\settings.json`, and pre-approves all `mcp__agentdeck__*` tools so they never prompt for permission.
2. Keep `start.cmd` running (agentdeck proxy must be up on port 4317).
3. Open a new `claude` CLI shell. The first tool call auto-creates a **bridged session** in agentdeck and the result prefixes `[agentdeck] bridged session: http://127.0.0.1:3000/sessions/<id>` — click it to watch your terminal agent in the dockview UI.

Uninstall: `node scripts/uninstall-claude.mjs`.

## Replay scrubber

Every session page has a slider below the header. Drag it to rewind the UI to any earlier event (thinking/text/tool calls / channel / docs / sandbox / browser screenshots / test results are all recomputed from the truncated event stream). Click **back to live** to return to the tail.

## Typical test workflow

1. Open agentdeck in the browser.
2. In the **Secrets** tab, add credentials/URLs for the SaaS under test (`STAGING_URL`, `API_KEY`, etc.) — encrypted with AES-256-GCM using a master key at `~/.agentdeck/master.key`.
3. In `procedures/`, drop a YAML or Markdown runbook describing the test flow (see `browser-smoke.md`).
4. Start a session with a prompt like *« Run the browser-smoke procedure. »*.
5. Watch the agents navigate the real SaaS via Playwright, capture screenshots (visible in the **Browser** tab), and report PASS/FAIL in the **Results** tab.
6. Inject human guidance on the fly via the input bar at the bottom of the session page.
7. Agents persist learnings in the **Memory** tab so future sessions don't rediscover them.

## Stack

- Node 22, TypeScript 5.7, pnpm 9, Turborepo 2.
- **Proxy** (`packages/proxy`): Fastify 5 + Socket.IO 4 + `@anthropic-ai/claude-agent-sdk` + Drizzle ORM + better-sqlite3 + Playwright 1.59.
- **MCP** (`packages/mcp`): `@modelcontextprotocol/sdk` stdio — spawned per session, 47 tools (count derived from `TOOL_DEFINITIONS.length`).
- **Shared** (`packages/shared`): Drizzle schema (21 tables) + zod event contracts (27 event types, zod 4 native JSON Schema).
- **Web** (`apps/web`): Next.js 15 App Router + React 19 + Tailwind 4 + shadcn/ui + `dockview-react` + react-window v2 (virtualized activity feed above 500 events).

## Layout

```
apps/
  web/                      Next.js UI
  desktop/                  Tauri 2 shell (deferred — see apps/desktop/README.md)
packages/
  shared/                   Drizzle schema (21 tables) + zod events (27 types)
  proxy/                    REST + Socket.IO + Playwright + SDK wrapper
                            + multi-agent registry + sdk-attribution middleware
  mcp/                      MCP stdio server (47 tools, dist/ rebuilt by prepare hook)
procedures/                 User-authored runbooks (YAML or Markdown, indexed in README)
audit/                      Versioned campaign artefacts (see audit/README.md)
_qa/regression-suite.jsonl  HTTP regression probes for daily runs
scripts/
  launch.mjs                Cross-platform launcher
  build-exe.mjs             pkg-based single-binary build
  install-claude.mjs        Bridge Claude CLI to agentdeck (47-tool allowlist)
  check-tool-count.mjs      Single-source-of-truth validator (pre-commit + CI)
.husky/pre-commit           Local invariant: runs check-tool-count
.github/workflows/ci.yml    CI: check-tool-count + typecheck on push/PR
start.cmd                   Windows double-click entry
data/
  agentdeck.db              SQLite (WAL)
  workspaces/<sessionId>/   Per-session isolated sandbox + screenshots/
```

## Data

Everything persists to `data/agentdeck.db` (SQLite, WAL mode). Per-session workspaces under `data/workspaces/<sessionId>/` with `sandbox/` and `screenshots/`. Event sourcing append-only in `events`. Sessions are replayable in the UI at any time.

## Auth

The SDK reads `~/.claude/` credentials; no `ANTHROPIC_API_KEY` needed. The secrets store uses a master key at `~/.agentdeck/master.key` (auto-generated on first use) or the `AGENTDECK_SECRETS_KEY` env var if you want to override.

## Tooling & invariants (v0.0.8+)

- **`pnpm check:tool-count`** — validates that the 47 MCP tools listed in `packages/mcp/src/tools.ts` (`TOOL_DEFINITIONS`), `packages/proxy/src/session-manager.ts` (SDK `allowedTools`), and `scripts/install-claude.mjs` (CLI `TOOL_NAMES`) are perfectly aligned. Drift across these three locked the bridge five times across v0.0.1 → v0.0.7.
- **Husky pre-commit** (`.husky/pre-commit`) runs `check:tool-count` on every local commit; **GitHub Actions** (`.github/workflows/ci.yml`) mirrors it on push/PR + runs `pnpm typecheck` across all 4 workspaces.
- **`prepare` hook** in `packages/mcp/package.json` rebuilds `dist/index.js` automatically on `pnpm install` so the CLI bridge never ships stale tool schemas.
- **`AGENTDECK_LOG_META=1`** env var in the MCP server logs every `_meta` object received on each `CallToolRequest` to stderr — empirical probe for the v0.0.8 BUG-SDK-1 forward-compat patch (sub-agent attribution via `X-Agent-Tool-Use-Id`).
- **`?virtualize=1` / `?virtualize=0`** URL params on `/sessions/[id]` force-toggle the react-window virtualized activity feed (auto-on above 500 events).

## Releases

Versioned in `CHANGELOG.md`. Latest: **v0.0.9** — Style B "expressif" web redesign (glassmorphism + violet→pink accent), 2-page model (`/` + `/sessions/[id]`, `/projects/*` killed at the Next.js config level with a permanent 308 redirect), inline `Show N teams ▾` expander on every project card replacing the old `/projects/[id]` deep-view, agentdeck-run skill + `/agentdeck-self-test` slash command + `scripts/test-cli-bridge.mjs` end-to-end runner that asserts 9 surface checks on every CLI bridge run, `scripts/seed-demo.mjs` (5 realistic demo sessions, `--keep-alive` mode), `stop_agent` MCP shim 204-body bug fix. Previous v0.0.8: sub-agent attribution forward-compat, virtualized activity feed, husky/CI invariant lock-in, audit/ artefacts committed.
