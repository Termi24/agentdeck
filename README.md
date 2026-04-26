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
- renders everything in a tiling workspace (`dockview-react`): agent tree + per-agent tabs + 9 fixed tabs (Channel, Docs, Sandbox, Procedures, Results, Browser, Memory, Secrets, plus per-subagent DM).

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
- **MCP** (`packages/mcp`): `@modelcontextprotocol/sdk` stdio — spawned per session, 31 tools.
- **Shared** (`packages/shared`): Drizzle schema (15 tables) + zod event contracts (17 event types, zod 4 native JSON Schema).
- **Web** (`apps/web`): Next.js 15 App Router + React 19 + Tailwind + shadcn/ui + `dockview-react`.

## Layout

```
apps/
  web/                      Next.js UI
  desktop/                  Tauri 2 shell (deferred — launcher is the shipping path)
packages/
  shared/                   Drizzle schema + zod events
  proxy/                    REST + Socket.IO + Playwright + SDK wrapper
  mcp/                      MCP stdio server (31 tools)
procedures/                 User-authored runbooks (YAML or Markdown)
scripts/launch.mjs          Cross-platform launcher
start.cmd                   Windows double-click entry
data/
  agentdeck.db              SQLite (WAL)
  workspaces/<sessionId>/   Per-session isolated sandbox + screenshots/
```

## Data

Everything persists to `data/agentdeck.db` (SQLite, WAL mode). Per-session workspaces under `data/workspaces/<sessionId>/` with `sandbox/` and `screenshots/`. Event sourcing append-only in `events`. Sessions are replayable in the UI at any time.

## Auth

The SDK reads `~/.claude/` credentials; no `ANTHROPIC_API_KEY` needed. The secrets store uses a master key at `~/.agentdeck/master.key` (auto-generated on first use) or the `AGENTDECK_SECRETS_KEY` env var if you want to override.
