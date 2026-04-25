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

const MCP_DIST = resolve(repoRoot, 'packages/mcp/dist/index.js');
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
  'validate_claim', 'api_inventory',
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

async function main() {
  if (!existsSync(resolve(repoRoot, 'node_modules'))) {
    log('installing workspace dependencies…');
    await runPnpm(['install']);
  }

  if (!existsSync(MCP_DIST)) {
    log('building @agentdeck/mcp…');
    await runPnpm(['--filter', '@agentdeck/mcp', 'build']);
  }

  const settings = readSettings();
  settings.mcpServers = settings.mcpServers ?? {};
  settings.mcpServers.agentdeck = {
    command: process.execPath,
    args: [MCP_DIST],
    env: {
      AGENTDECK_PROXY_URL: 'http://127.0.0.1:4317',
      // No AGENTDECK_AGENT_NAME hardcoded — the agent will ask the user for
      // a display name and call set_agent_identity at session start. The MCP
      // server boots with a placeholder ("unnamed-cli") that gets replaced.
      AGENTDECK_PROJECT_ID: 'default',
    },
  };

  settings.permissions = settings.permissions ?? {};
  const allow = new Set(Array.isArray(settings.permissions.allow) ? settings.permissions.allow : []);
  for (const t of TOOL_NAMES) allow.add(`mcp__agentdeck__${t}`);
  settings.permissions.allow = Array.from(allow).sort();

  writeSettings(settings);

  log(`wrote ${SETTINGS_PATH}`);
  log(`mcpServers.agentdeck registered with ${TOOL_NAMES.length} pre-approved tools.`);
  log('');
  log('Next steps:');
  log('  1. Start agentdeck locally: double-click start.cmd (proxy must be running on port 4317).');
  log('  2. In any new `claude` CLI session, ask the agent to "use agentdeck" — it will request a display name and start.');
  log('  3. The first tool call auto-creates a bridged session — the MCP prints its URL in the tool result.');
  log('');
  log('To uninstall: node scripts/uninstall-claude.mjs');
}

main().catch((err) => {
  log(`fatal: ${err?.message ?? err}`);
  process.exit(1);
});
