#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

const SETTINGS_PATH = resolve(homedir(), '.claude', 'settings.json');

function log(msg) { process.stdout.write(`[uninstall-claude] ${msg}\n`); }

function main() {
  if (!existsSync(SETTINGS_PATH)) {
    log(`nothing to remove — ${SETTINGS_PATH} does not exist`);
    return;
  }
  const settings = JSON.parse(readFileSync(SETTINGS_PATH, 'utf8'));
  let changed = false;
  if (settings.mcpServers?.agentdeck) {
    delete settings.mcpServers.agentdeck;
    if (Object.keys(settings.mcpServers).length === 0) delete settings.mcpServers;
    changed = true;
  }
  if (Array.isArray(settings.permissions?.allow)) {
    const before = settings.permissions.allow.length;
    settings.permissions.allow = settings.permissions.allow.filter((p) => !String(p).startsWith('mcp__agentdeck__'));
    if (settings.permissions.allow.length !== before) changed = true;
    if (settings.permissions.allow.length === 0) delete settings.permissions.allow;
    if (Object.keys(settings.permissions).length === 0) delete settings.permissions;
  }
  if (!changed) {
    log('agentdeck entries not found — nothing to do');
    return;
  }
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n', 'utf8');
  log(`cleaned ${SETTINGS_PATH}`);
}

main();
