import { z } from 'zod';

const Schema = z.object({
  // Optional explicit proxy URL. If set AND reachable, MCP uses it as-is.
  // Otherwise the MCP auto-spawns the launcher and picks free ports — see
  // proxy-spawner.ts. Most users should leave this UNSET.
  AGENTDECK_PROXY_URL: z.string().url().optional(),
  AGENTDECK_SESSION_ID: z.string().optional(),
  AGENTDECK_AGENT_ID: z.string().optional(),
  // Optional bootstrap name. The agent is expected to call set_agent_identity
  // early in the conversation with a user-chosen name, so this default is just
  // a placeholder used until then.
  AGENTDECK_AGENT_NAME: z.string().default('unnamed-cli'),
  AGENTDECK_PROJECT_ID: z.string().default('default'),
});

export const config = Schema.parse(process.env);
export type Config = typeof config;
