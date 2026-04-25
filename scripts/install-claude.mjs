#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';
const pnpmBin = isWindows ? 'pnpm.cmd' : 'pnpm';
const claudeBin = isWindows ? 'claude.cmd' : 'claude';

const MCP_DIST = resolve(repoRoot, 'packages/mcp/dist/index.js');
// Permissions still live in `~/.claude/settings.json`; the MCP server
// registration itself is delegated to `claude mcp add` so it lands in
// `~/.claude.json` (the canonical CLI registry, surfaced by
// `claude mcp list`). Writing both halves to settings.json was the old
// path — it caused duplicate-registration drift once `claude mcp add`
// became the user's primary install vector. See security-auditor 2026-04-25
// WARN #4.
const SETTINGS_PATH = resolve(homedir(), '.claude', 'settings.json');

const TOOL_NAMES = [
  'list_procedures', 'run_test_procedure',
  'post_to_channel', 'read_channel', 'wait_for_channel', 'await_user_input',
  'publish_doc',
  'sandbox_write', 'sandbox_read', 'sandbox_exec', 'diff_exec',
  'report_test_result',
  'project_memory_read', 'project_memory_write',
  'secrets_get',
  'send_direct', 'read_direct',
  'request_agent_cancel', 'check_cancellation',
  'browser_navigate', 'browser_snapshot', 'browser_click', 'browser_type',
  'browser_fill_form', 'browser_wait_for', 'browser_press_key', 'browser_screenshot',
  'browser_new_context', 'browser_dispose_context',
  'validate_claim', 'validate_claims_bulk', 'api_inventory',
  // Cousin scanners introduced in v0.0.4 — same UX as api_inventory but for
  // Drizzle tables, zod events, MCP tool registry, React hooks. Pre-approved
  // here so audit sub-agents can build cartography across all surfaces
  // without prompting the operator.
  'schema_inventory', 'events_inventory', 'mcp_tools_inventory', 'react_hooks_inventory',
  'read_methodology', 'start_qa_campaign', 'record_campaign_metric',
  'submit_campaign_retrospective', 'end_campaign', 'set_agent_identity',
];

function log(msg) {
  process.stdout.write(`[install-claude] ${msg}\n`);
}

async function runPnpm(args) {
  const child = spawn(pnpmBin, args, { cwd: repoRoot, shell: isWindows, stdio: 'inherit' });
  const [code] = await once(child, 'exit');
  if (code !== 0) throw new Error(`pnpm ${args.join(' ')} failed with exit ${code}`);
}

function readSettings() {
  if (!existsSync(SETTINGS_PATH)) return {};
  try {
    return JSON.parse(readFileSync(SETTINGS_PATH, 'utf8'));
  } catch (err) {
    throw new Error(`cannot parse ${SETTINGS_PATH}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function writeSettings(settings) {
  mkdirSync(dirname(SETTINGS_PATH), { recursive: true });
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n', 'utf8');
}

async function runClaudeMcpAdd() {
  // `claude mcp add --scope user` writes into ~/.claude.json; re-running
  // overwrites the existing entry rather than duplicating, so the script
  // remains idempotent. We pass node + MCP_DIST as the stdio command.
  const args = [
    'mcp',
    'add',
    'agentdeck',
    '--scope', 'user',
    '-e', 'AGENTDECK_PROXY_URL=http://127.0.0.1:4317',
    '-e', 'AGENTDECK_PROJECT_ID=default',
    '--', process.execPath, MCP_DIST,
  ];
  const child = spawn(claudeBin, args, { shell: isWindows, stdio: 'inherit' });
  const [code] = await once(child, 'exit');
  if (code !== 0) {
    throw new Error(
      `claude mcp add failed with exit ${code}. Is the Claude CLI installed and on PATH?\n` +
        `Falling back: you can register manually via:\n  ${claudeBin} ${args.join(' ')}`,
    );
  }
}

async function main() {
  if (!existsSync(resolve(repoRoot, 'node_modules'))) {
    log('installing workspace dependencies…');
    await runPnpm(['install']);
  }

  if (!existsSync(MCP_DIST)) {
    log('building @agentdeck/mcp…');
    await runPnpm(['--filter', '@agentdeck/mcp', 'build']);
  }

  // Step 1: register the MCP server in the Claude CLI registry (~/.claude.json).
  log('registering agentdeck MCP server via `claude mcp add --scope user`…');
  await runClaudeMcpAdd();

  // Step 2: pre-approve the 42 tools in user-level permissions so the
  // CLI never prompts the user to approve them one-by-one. Stays in
  // settings.json — that's the file the CLI consults for permissions
  // (the registry only carries the server connection metadata).
  // Defensive cleanup: remove any leftover `mcpServers.agentdeck` entry
  // that an older install-claude.mjs may have written. The registry is
  // now the single source of truth for the connection.
  const settings = readSettings();
  if (settings.mcpServers && settings.mcpServers.agentdeck) {
    delete settings.mcpServers.agentdeck;
    if (Object.keys(settings.mcpServers).length === 0) delete settings.mcpServers;
    log('removed legacy mcpServers.agentdeck entry from settings.json (now lives in the registry).');
  }
  settings.permissions = settings.permissions ?? {};
  const allow = new Set(Array.isArray(settings.permissions.allow) ? settings.permissions.allow : []);
  for (const t of TOOL_NAMES) allow.add(`mcp__agentdeck__${t}`);
  settings.permissions.allow = Array.from(allow).sort();
  writeSettings(settings);

  log(`updated ${SETTINGS_PATH} with ${TOOL_NAMES.length} pre-approved tools.`);
  log('');
  log('Next steps:');
  log('  1. Start agentdeck locally: double-click start.cmd (proxy on 4317, dashboard on 3000).');
  log('  2. In any new `claude` CLI session, ask the agent to "use agentdeck" — it will request a display name and start.');
  log('  3. The first tool call auto-creates a bridged session — the MCP prints its URL in the tool result.');
  log('');
  log('To uninstall: node scripts/uninstall-claude.mjs');
}

main().catch((err) => {
  log(`fatal: ${err?.message ?? err}`);
  process.exit(1);
});
