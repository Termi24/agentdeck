import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { McpStdioServerConfig } from '@anthropic-ai/claude-agent-sdk';
import { config } from './config.js';

export interface McpBootstrapArgs {
  sessionId: string;
  agentId: string;
  agentName: string;
  projectId: string;
  proxyUrl: string;
}

const TSX_REL_CANDIDATES = [
  'packages/mcp/node_modules/.bin/tsx',
  'packages/proxy/node_modules/.bin/tsx',
  'node_modules/.bin/tsx',
];

export function resolveMcpServerCommand(args: McpBootstrapArgs): McpStdioServerConfig {
  const mcpPkg = resolve(config.REPO_ROOT, 'packages/mcp');
  const distEntry = resolve(mcpPkg, 'dist/index.js');
  const srcEntry = resolve(mcpPkg, 'src/index.ts');
  const suffix = process.platform === 'win32' ? '.cmd' : '';

  const env = {
    AGENTDECK_PROXY_URL: args.proxyUrl,
    AGENTDECK_SESSION_ID: args.sessionId,
    AGENTDECK_AGENT_ID: args.agentId,
    AGENTDECK_AGENT_NAME: args.agentName,
    AGENTDECK_PROJECT_ID: args.projectId,
    PATH: process.env.PATH ?? '',
  };

  if (existsSync(distEntry)) {
    return { type: 'stdio', command: process.execPath, args: [distEntry], env };
  }

  for (const rel of TSX_REL_CANDIDATES) {
    const candidate = resolve(config.REPO_ROOT, rel + suffix);
    if (existsSync(candidate)) {
      return { type: 'stdio', command: candidate, args: [srcEntry], env };
    }
  }
  throw new Error(
    `cannot locate MCP runtime: neither ${distEntry} nor any tsx bin among ${TSX_REL_CANDIDATES.join(', ')}`,
  );
}
