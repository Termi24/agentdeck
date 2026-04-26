#!/usr/bin/env node
// Verifies the three sources of MCP tool truth never drift:
//   1. packages/mcp/src/tools.ts          → TOOL_DEFINITIONS (the actual server surface)
//   2. packages/proxy/src/session-manager.ts → allowedTools (SDK pre-approval)
//   3. scripts/install-claude.mjs         → TOOL_NAMES (CLI bridge pre-approval)
//
// Run via:  pnpm check:tool-count   (or directly  node scripts/check-tool-count.mjs )
// Exit code != 0 if any pair drifts. Add to CI / pre-commit to lock in v0.0.7's fix.
//
// Why this exists: the count drifted four times (30→31→36→42→44→47) across
// v0.0.1→v0.0.7 because three places hard-coded it. Cf. audit/12-final-summary.md
// recommendation #4.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const toolsTs = readFileSync(resolve(repoRoot, 'packages/mcp/src/tools.ts'), 'utf8');
const sessionMgr = readFileSync(resolve(repoRoot, 'packages/proxy/src/session-manager.ts'), 'utf8');
const installClaude = readFileSync(resolve(repoRoot, 'scripts/install-claude.mjs'), 'utf8');

// 1. Names defined in tools.ts inside the TOOL_DEFINITIONS array.
//    Match `name: 'foo',` lines that are tool entries (not the Server name etc.).
const toolsTsBlock = (() => {
  const start = toolsTs.indexOf('TOOL_DEFINITIONS');
  const end = toolsTs.indexOf('] as const;', start);
  if (start < 0 || end < 0) throw new Error('TOOL_DEFINITIONS array not found in tools.ts');
  return toolsTs.slice(start, end);
})();
const toolsTsNames = [...toolsTsBlock.matchAll(/name:\s*'([a-z_]+)'/g)].map((m) => m[1]);

// 2. allowedTools array in session-manager.ts.
const sessionMgrBlock = (() => {
  const start = sessionMgr.indexOf('allowedTools: [');
  const end = sessionMgr.indexOf(']', start);
  if (start < 0 || end < 0) throw new Error('allowedTools array not found in session-manager.ts');
  return sessionMgr.slice(start, end);
})();
const sessionMgrNames = [...sessionMgrBlock.matchAll(/'mcp__agentdeck__([a-z_]+)'/g)].map((m) => m[1]);

// 3. TOOL_NAMES array in install-claude.mjs.
const installClaudeBlock = (() => {
  const start = installClaude.indexOf('const TOOL_NAMES = [');
  const end = installClaude.indexOf('];', start);
  if (start < 0 || end < 0) throw new Error('TOOL_NAMES array not found in install-claude.mjs');
  return installClaude.slice(start, end);
})();
const installClaudeNames = [...installClaudeBlock.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

const sets = {
  'packages/mcp/src/tools.ts (TOOL_DEFINITIONS)': new Set(toolsTsNames),
  'packages/proxy/src/session-manager.ts (allowedTools)': new Set(sessionMgrNames),
  'scripts/install-claude.mjs (TOOL_NAMES)': new Set(installClaudeNames),
};

const summary = Object.entries(sets).map(([k, v]) => `  ${k}: ${v.size}`).join('\n');
console.log(`[check-tool-count] sizes:\n${summary}`);

const sizes = new Set(Object.values(sets).map((s) => s.size));
let drift = false;
if (sizes.size !== 1) {
  drift = true;
  console.error('[check-tool-count] FAIL — sizes differ across the three sources.');
}

// Cross-diff to surface which name is missing where.
const all = new Set([...toolsTsNames, ...sessionMgrNames, ...installClaudeNames]);
for (const name of all) {
  const missing = Object.entries(sets)
    .filter(([, set]) => !set.has(name))
    .map(([k]) => k);
  if (missing.length > 0) {
    drift = true;
    console.error(`[check-tool-count] '${name}' missing from: ${missing.join(' | ')}`);
  }
}

if (drift) {
  process.exit(1);
}
console.log(`[check-tool-count] OK — all three sources agree on ${[...sizes][0]} tools.`);
