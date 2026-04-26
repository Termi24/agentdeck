import { z } from 'zod';

const Schema = z.object({
  // Optional explicit proxy URL. If set AND reachable, MCP uses it as-is.
  // Otherwise the MCP auto-spawns the launcher and picks free ports — see
  // proxy-spawner.ts. Most users should leave this UNSET.
  AGENTDECK_PROXY_URL: z.string().url().optional(),
  AGENTDECK_SESSION_ID: z.string().optional(),
  AGENTDECK_AGENT_ID: z.string().optional(),
  // Bootstrap name fallback. Was "unnamed-cli" historically, which gave zero
  // signal in the hub. "claude-cli" matches the common case (Claude Code
  // bridge) and is still overrideable via set_agent_identity OR by setting
  // AGENTDECK_SKILL_NAME below.
  AGENTDECK_AGENT_NAME: z.string().default('claude-cli'),
  AGENTDECK_PROJECT_ID: z.string().default('default'),
  // When set, takes precedence over AGENTDECK_AGENT_NAME for the bridge agent
  // name AND the session title. Skills installed via Claude Code (or any
  // host that registers MCP servers) can inject this in their `env:` block
  // so the hub shows the skill name instead of a generic placeholder, with
  // no extra set_agent_identity call required.
  AGENTDECK_SKILL_NAME: z.string().min(1).max(100).optional(),
});

export const config = Schema.parse(process.env);
export type Config = typeof config;
