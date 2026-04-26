# BUG-SDK-1 / REAL-2 — channel.message attribution to root agent

## Status: PATCH-BLOCKED — needs design memo (per triage CV-T1 verdict).

## Why blocked

The MCP subprocess (`packages/mcp/src/proxy-client.ts`) receives `AGENTDECK_AGENT_ID` once at startup (= root). All HTTP shim calls (`postChannel`, `sendDirect`, `publishDoc`, `sandboxWrite`, `reportTestResult`, `memoryWrite`) reuse `this.agentId` for the lifetime of the subprocess, so subagents that share the MCP process all post under the root id.

The translator's `toolUseOwner` map IS correct — it knows which agent emitted each `mcp__agentdeck__post_to_channel` tool_use. But that knowledge lives in the proxy's translator, not in the MCP shim that writes the channel row. Bridging requires one of:

(a) plumb per-tool-call subagent identity into MCP via a request-scoped header set by the SDK. Requires changes in `@anthropic-ai/claude-agent-sdk` boundary (out of scope for a 1-file patch).

(b) translator post-processes `mcp__agentdeck__post_to_channel` tool_use blocks: rewrite the just-written `channel_messages` row's `from_agent_id` once the matching tool_result lands. Requires a side table mapping `tool_use_id → message_id`, plus an UPDATE inside the translator. ~80 LOC across translator + channel route + new persistence helper.

(c) MCP route handlers accept `fromAgentId` from the body (already true) and the SDK sets it via Task tool injection. SDK doesn't expose that hook today.

## Recommendation

Defer to a v0.0.5 design memo. None of the above fits the "one-patch, one-file, minimal blast radius" Phase-7 contract. The triage already classified this as P2 NON-TRIVIAL.

## No diff authored.
