import type { MultiAgentContext } from '../sdk-translator.js';

// BUG-SDK-1 forward-compat: registry of in-flight SDK sessions' MultiAgentContext.
// Lets the attribution middleware (services/sdk-attribution.ts) resolve a
// tool_use_id received via the X-Agent-Tool-Use-Id header back to the real
// sub-agent UUID emitted by the translator's toolUseOwner map.
//
// Scope: ONLY sessions that the proxy itself runs via runSession() (i.e. the
// SDK orchestrator path triggered by POST /sessions without bridge:true).
// Bridge sessions (Claude CLI + external orchestrators) do not register here
// because the SDK runs out-of-process and the proxy never observes the
// tool_use stream — the toolUseOwner map for those is unknowable. The
// attribution middleware degrades gracefully (no-op) when a session is not
// in this registry.
//
// Cf. audit/13-sdk-1-design-memo.md §gaps for the longer write-up of why the
// bridge case stays open and what a future patch would need to wire.

const registry = new Map<string, MultiAgentContext>();

export function registerMultiAgentContext(sessionId: string, ctx: MultiAgentContext): void {
  registry.set(sessionId, ctx);
}

export function unregisterMultiAgentContext(sessionId: string): void {
  registry.delete(sessionId);
}

export function getToolUseOwner(sessionId: string, toolUseId: string): string | null {
  const ctx = registry.get(sessionId);
  if (!ctx) return null;
  // Prefer subagent (taskToolUseToChild) when the tool_use_id designates a
  // Task call — the body it produces should be attributed to the spawned
  // subagent, not the orchestrator that emitted the call.
  return (
    ctx.taskToolUseToChild.get(toolUseId) ??
    ctx.toolUseOwner.get(toolUseId) ??
    null
  );
}

// Test helper. Exported so regression tests can introspect the registry size
// without reaching into the module's private state.
export function _registrySize(): number {
  return registry.size;
}
