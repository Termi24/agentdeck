# BUG-MCP-B1 — CLAUDE.md / MCP server claim 37/36 tools; actual count is 42

## Rationale

`TOOL_DEFINITIONS` in `packages/mcp/src/tools.ts` exports 42 entries (verified via `awk '/^export const TOOL_DEFINITIONS/,/^\] as const/' | grep -E "name:\s*'" | wc -l`). The session-manager allowedTools list is correct (42 entries, comment "Last sync: 2026-04-26 (42 tools, v0.0.4)"). But:

- `CLAUDE.md` line 7: "37 MCP tools wire the agents…"
- `CLAUDE.md` line 15: "and 37 `allowedTools` pre-approving the MCP tool surface"
- `CLAUDE.md` line ~133: "pre-approves the 37 `mcp__agentdeck__*` tools"
- `packages/mcp/src/index.ts` SERVER_INSTRUCTIONS line 15: "agentdeck — local QA orchestrator + 36 MCP tools"

All four references are out of date. Fixed in one composite patch.

## Diff

See `sandbox/audit/patches/bug-11-MCP-B1.diff`.

## Test Plan

- `grep -rn '37 MCP\|37 \`allowedTools\`\|37 \`mcp__agentdeck' CLAUDE.md` returns nothing.
- `grep '36 MCP tools' packages/mcp/src/index.ts` returns nothing.
- New CLI bridge sessions show the correct count in their server instructions banner.
