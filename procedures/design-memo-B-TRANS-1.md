# Design memo — B-TRANS-1: subagent → root attribution on MCP HTTP-shim calls

**Status:** open. Requires design decision before any patch lands.
**Severity:** MAJOR (functional + observability).
**Discovered:** agentdeck-review week campaign, Day 2 (sdk-translator-auditor)
+ corroborated by 3 independent angles (UI Channel view, UI per-agent
tab as negative control, integration-auditor's fresh non-bridge probe).

## Summary

When an SDK orchestrator spawns Task subagents, every `mcp__agentdeck__*`
tool call that subagents make (`post_to_channel`, `publish_doc`,
`sandbox_write`, `report_test_result`, `send_direct`, `project_memory_write`,
the agent-cancel pair, the screenshot recorder) lands in the proxy with
`fromAgentId = root-agent-id`, not the actual subagent's id. The
SDK-internal event translator handles SDK events correctly — but the
HTTP shim never sees the SDK plumbing, so the per-call subagent identity
is lost between the model emitting the tool_use and the proxy persisting
the side-effect.

## Why it matters

- **UI**: every channel message + every doc + every test result is
  attributed to the orchestrator. The per-agent tab cannot be filtered
  meaningfully. The activity feed says "orchestrator posted 200 things"
  when it was actually 9 sub-agents talking concurrently.
- **Observability**: tool-call attribution + retroactive reasoning about
  who said what is broken. This destroys agentdeck's core selling point.
- **Security adjacent**: in CLI-bridge mode, all subagent DMs collapse
  to root identity (sister-bug B-MCP-2 — same root cause, same patch).

## Root cause (locked)

`packages/mcp/src/proxy-client.ts:112-114`:

```ts
private requireAgent(): string {
  if (!this.agentId) throw new Error('agent not bootstrapped');
  return this.agentId;
}
```

The MCP stdio process is spawned **once** by the SDK per session, with
`AGENTDECK_AGENT_ID` set to the root agent's UUID. `this.agentId` is
the constructor-frozen value; nothing per-call updates it. Subsequent
Task subagents share the same MCP subprocess (Claude Agent SDK design
choice), so every HTTP body sent by `proxy-client` carries the root id.

The SDK translator (`packages/proxy/src/sdk-translator.ts`) is
**innocent**: its 3 maps correctly route SDK-internal events
(`task_updated`, `tool_use`, `tool_result`) to the right agent's panel.
But it never sees the HTTP path the MCP shim takes — that pipe is out
of band.

## Options (3)

### Option A — SDK passes per-tool-call agent context to MCP

Have the orchestrator process attach the active subagent's id to every
tool call before it leaves the SDK. The MCP server reads it from a
per-call context (e.g. an MCP `_meta` field, or a per-request
environment override).

**Pros:**
- Architecturally cleanest. MCP becomes truly stateless: identity is
  inherent to the call, not the connection.
- Works for nested Task subagents (3+ levels deep) without changes.

**Cons:**
- Requires SDK cooperation. `@anthropic-ai/claude-agent-sdk` does not
  currently expose a hook to inject per-call MCP metadata. Filing this
  upstream and waiting is one path; monkey-patching the SDK is the
  other.
- Until the SDK supports it, this option does nothing.

### Option B — Proxy translator rewrites attribution server-side

The proxy's SDK translator already sees every `tool_use` block from the
Claude SDK output stream, including the active subagent that emitted
each one. After persisting the SDK event, the translator could **also**
record `lastEmitterAgentId` in a per-session map, and the MCP HTTP
routes (`POST /channel`, `POST /docs`, etc.) could ignore the body's
`fromAgentId` and read from that map instead.

**Pros:**
- No SDK changes required. Lives entirely in agentdeck.
- The map already exists in spirit (`toolUseOwner` tracks tool_use ids
  → agent ids); we'd just expose its current state to route handlers.
- Backward compatible: clients that send `fromAgentId` see it
  overridden silently; honest clients see no change.

**Cons:**
- Race condition: the SDK emits `tool_use` and the MCP HTTP call lands
  asynchronously. Two subagents calling `post_to_channel` in parallel
  could swap attribution if the translator's "last emitter" pointer
  oscillates between the two. Requires correlating by `tool_use.id`,
  not by "last seen".
- The MCP request body has no SDK `tool_use.id` (the SDK doesn't pass
  it to the tool implementation). Workaround: thread the id through a
  per-tool-call header from the MCP wrapper using `process.env`-style
  injection. Doesn't actually exist today; would need a new MCP-side
  hook anyway.

### Option C — MCP shim accepts an optional `fromAgentId` header from a request-scoped context

Add a `RequestContext.run()` style API in the MCP server (e.g. via
Node `AsyncLocalStorage`) that captures the active subagent id at the
moment the SDK invokes the tool, then have `proxy-client` read it
on every fetch and put it in the body.

**Pros:**
- Self-contained in agentdeck (proxy + MCP), no SDK changes.
- AsyncLocalStorage is purpose-built for this; correctly threads
  identity across nested awaits.
- Clean: each call is independent; no race conditions.

**Cons:**
- Requires the MCP server's request handler to know which subagent the
  SDK is currently impersonating. Today, the handler only sees `name`
  + `arguments`. The SDK does not pass the active subagent id in any
  documented surface.
- Falls back to **the same SDK-side blocker as Option A**: without a
  hook from the SDK telling us "this tool call comes from subagent
  X", we cannot populate the AsyncLocalStorage.

## Recommendation

**Option B is the only one viable today**, with this exact mechanism:

1. The SDK translator already correlates `tool_use.id` → emitting agent
   via `toolUseOwner`. When it sees a `tool_use` whose `name` starts
   with `mcp__agentdeck__`, it inserts an entry in a NEW map
   `mcpToolUseToAgent: tool_use.id → agentId` BEFORE the tool
   actually runs (the SDK emits `tool_use` blocks before invoking the
   server).
2. The MCP server (`packages/mcp/src/index.ts`) extracts the
   `tool_use.id` from the MCP request frame (`request.params._meta?.requestId`
   or whatever the SDK exposes — needs verification; if absent, fall
   back to a content-correlated heuristic) and forwards it as a
   `X-Agentdeck-Tool-Use-Id` header on every proxy-client fetch.
3. The proxy route handlers (channel, docs, test-results, dm,
   project-memory, agent-cancel, screenshot) check for the header. If
   present, they look up the agent id from the translator's map and
   override the body's `fromAgentId`. If absent, they fall back to the
   body's value (preserves the current behaviour for any non-SDK
   caller, including the CLI bridge).

**Risks of this path:**

- The SDK currently does not propagate `tool_use.id` into the MCP
  call frame (verified: `request.params` only has `name` + `arguments`).
  Without it, the correlation is impossible. **First action: prove
  whether `_meta.tool_use_id` is reachable in the MCP request handler**
  — if not, the patch is blocked at the SDK seam and we file an
  upstream issue while shipping a partial mitigation (see "Mitigation"
  below).
- The translator's map needs a TTL or capped size. A pathological
  subagent could fire 10 K tool_use ids and never have them resolved,
  leaking memory. Bound it.
- CLI-bridge mode (B-MCP-2) is **not** fixed by this — the SDK
  translator never runs for bridge sessions. For CLI-bridge, Option C
  with explicit AsyncLocalStorage threaded by the MCP server's own
  `Server.setRequestHandler` is the right move, AND the MCP server
  needs to know which subagent the CLI is currently acting as. Today,
  the CLI bridge has only one logical agent per session, so this is
  blocked at the spec level: either the CLI signals subagent
  switching to the MCP server, or B-MCP-2 stays open.

## Mitigation (if Option B's correlation is blocked at the SDK seam)

Until per-call attribution works, add a one-line warning banner to the
session UI when **>50 % of channel messages in the last 5 minutes are
attributed to the orchestrator AND the session has more than 1 active
subagent**. This makes B-TRANS-1 visible to operators without
pretending it's fixed.

## Action items (in order)

1. **Spike (≤ 30 min)**: write a one-shot probe MCP tool that logs
   `request.params._meta` and any other surface available from
   `@modelcontextprotocol/sdk`. Spawn a Task SDK session and observe
   whether the SDK populates the meta with the calling subagent id.
2. **If the spike succeeds**: implement Option B per the
   recommendation above. Patch surface ≈ 80 LOC across translator +
   MCP server + 6 route handlers.
3. **If the spike fails**: ship the mitigation banner, file an
   upstream issue against `@anthropic-ai/claude-agent-sdk` requesting
   per-tool-call subagent context propagation in MCP frames, and
   leave B-TRANS-1 + B-MCP-2 open with a tracking link.

## What is NOT being done in this memo

- No code changes. Patch surface estimated, not written.
- No upstream issue filed. The spike must come first to know what to
  ask for.
- No claim that Option B is correct without the spike result. It is
  the **only** option that does not depend on SDK changes — but its
  feasibility hinges on a fact about the SDK that is currently
  unverified.

---

**Decision needed from Amine before any code change:** approve the
spike (≤ 30 min) and the subsequent path (Option B if the spike
succeeds, mitigation banner + upstream issue if it fails)?
