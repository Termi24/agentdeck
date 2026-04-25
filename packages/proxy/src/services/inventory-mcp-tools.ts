import { readFileSync, statSync } from 'node:fs';
import { relative } from 'node:path';

/**
 * MCP tool registry cartography. Parses a `tools.ts`-style file that
 * exports an array of `{name, description, inputSchema}` entries (the
 * convention used by `packages/mcp/src/tools.ts`). Returns each tool
 * with its declared name + the symbolic name of its inputSchema, so
 * downstream auditors can verify the tool has both a runtime handler
 * (in `index.ts`) and an SDK allowedTools entry (in `session-manager`).
 *
 * Accepts either a directory (will look for tools.ts inside) or a file
 * path directly.
 */

export interface McpTool {
  name: string;
  description: string;
  inputSchema: string; // symbolic name (e.g. "ValidateClaimInput")
}

export interface McpToolsInventoryResult {
  file: string;
  tools: McpTool[];
}

const NAME_RE = /name\s*:\s*['"]([^'"]+)['"]/g;
const SCHEMA_NEAR_RE = /inputSchema\s*:\s*(\w+)/;

export function inventoryMcpTools(rootPath: string): McpToolsInventoryResult {
  const file = resolveToolsFile(rootPath);
  let src = '';
  try {
    src = readFileSync(file, 'utf8');
  } catch {
    return { file, tools: [] };
  }
  const tools: McpTool[] = [];
  // Anchor on `name: '...'` because that's the only field that's always
  // present in a single line; then look ahead up to 1500 chars for the
  // matching `inputSchema:` (handles multi-line description blocks with
  // template literals or string concatenation that broke the previous
  // strictly-balanced regex).
  NAME_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = NAME_RE.exec(src)) !== null) {
    const name = m[1]!;
    const lookahead = src.slice(m.index, Math.min(m.index + 1500, src.length));
    const schemaMatch = SCHEMA_NEAR_RE.exec(lookahead);
    if (!schemaMatch) continue; // not a tool definition (could be unrelated `name:` field)
    tools.push({ name, description: '', inputSchema: schemaMatch[1]! });
  }
  return { file: relative(process.cwd(), file).replace(/\\/g, '/'), tools };
}

function resolveToolsFile(p: string): string {
  try {
    const st = statSync(p);
    if (st.isDirectory()) {
      // Look for tools.ts in common locations
      const candidates = [`${p}/tools.ts`, `${p}/src/tools.ts`];
      for (const c of candidates) {
        try {
          statSync(c);
          return c;
        } catch {
          /* try next */
        }
      }
      return `${p}/tools.ts`;
    }
  } catch {
    /* fall through */
  }
  return p;
}

function stripQuotes(s: string): string {
  const t = s.trim();
  if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) {
    return t.slice(1, -1);
  }
  // Multi-line string concatenation — best-effort: strip leading/trailing quotes/backticks per chunk
  return t.replace(/^['"`]|['"`]$/g, '').replace(/\s+\+\s+['"`]|['"`]\s*$/g, '');
}
