---
name: agentdeck-run
description: Make a Claude Code session fully observable in agentdeck. Triggers when the user asks to make their work observable, to start an agentdeck session, to run something while emitting agentdeck events, or any time the user mentions agentdeck explicitly. Forces the protocol that populates every dashboard surface (identity, planning, sub-agents, channel, DMs, tests, docs).
---

You are now operating inside an **agentdeck CLI bridge**. The user's
agentdeck dashboard at `http://127.0.0.1:3000` is a passive receiver:
every panel (AgentTree, Channel, DMs, Docs, Tests, Planning) shows
**only what you explicitly POST via `mcp__agentdeck__*` tools**. If you
do real work but don't call the tools, the dashboard stays empty —
which defeats the point of the user starting agentdeck.

Follow this protocol **without exception** for the rest of this session.

## Step 0 — establish identity (very first action)

Before doing anything else, call:

```
mcp__agentdeck__set_agent_identity({
  name: "<one-of-`agentdeck-run`-or-the-user-given-skill-name>",
  role: "<your role, e.g. `auditor`, `orchestrator`, `migrator`>"
})
```

The returned `agentId` is your **root agent id** — use it everywhere
below as `<root>`.

## Step 1 — declare the plan upfront (Gantt seed)

Survey the user's task. Decompose into 2-6 phases. For **each** phase
call:

```
mcp__agentdeck__task_plan({
  agentId: "<root>",
  title: "<short phase title>",
  description: "<one-sentence what this phase covers>",
  plannedStart: "<ISO 8601>",
  plannedEnd:   "<ISO 8601>"
})
```

Keep returned `taskId` per phase. The Planning tab now has content.

## Step 2 — register every sub-agent before it acts

Whenever you delegate (Task tool, multi-persona pattern, parallel
work), **before that worker calls any other MCP tool**, register it:

```
mcp__agentdeck__spawn_agent({
  name: "<persona name>",
  role: "<persona role>",
  prompt: "<the FULL skill / context the persona is asked to do — paste the verbatim instructions, not a 5-word summary>",
  parentAgentId: "<root>"
})
```

The `prompt` field surfaces in the AgentDetail side-sheet as the
persona's "context / skill". Operators rely on it to understand who
did what — write it for them, not for yourself.

## Step 3 — narrate progress on the channel

After each meaningful step (start of phase, finding, decision,
error) call:

```
mcp__agentdeck__post_to_channel({
  fromAgentId: "<self>",
  fromAgentName: "<self-name>",
  content: "<one-line status>"
})
```

For a hand-off between two agents (orchestrator ↔ sub-agent), prefer:

```
mcp__agentdeck__send_direct({
  fromAgentId, fromAgentName, toAgentId, content
})
```

Heuristic: **at minimum** one channel post per phase + one per
finding + one per decision. One DM per hand-off. Silence is bug.

## Step 4 — record every verification as a test result

For every assertion / validation you perform — even tiny ones:

```
mcp__agentdeck__report_test_result({
  agentId: "<self>",
  suite: "<short suite name, e.g. `rbac`, `crud`, `rest`>",
  caseName: "<specific case>",
  status: "passed" | "failed" | "skipped",
  message: "<short detail or null>"
})
```

Don't aggregate. One row per check.

## Step 5 — publish artefacts

Whenever you produce a document (incident report, audit, inventory,
methodology) that someone should be able to re-read later:

```
mcp__agentdeck__publish_doc({
  path: "<path>",
  content: "<full markdown>",
  byAgentId: "<self>"
})
```

Path conventions:
- `incidents/<slug>.md` — bug reports
- `audit/<n>-<topic>.md` — campaign audits
- `inventories/<topic>.md` — cartographies

## Step 6 — keep the planning honest

As phases progress, update them:

```
mcp__agentdeck__task_update_progress({
  taskId, progressPct: <0-100>, status: "in_progress"
})
```

When a phase finishes:

```
mcp__agentdeck__task_complete({ taskId, status: "completed" })
```

## Step 7 — clean shutdown

Before your last response:

```
mcp__agentdeck__stop_agent({ agentId: <each sub-agent>, status: "completed" })
mcp__agentdeck__stop_agent({ agentId: "<root>", status: "completed" })
```

## What NOT to do

- ❌ Do not skip Step 0 — without identity, the AgentTree shows
  `claude-cli` and the operator can't find your run.
- ❌ Do not summarize work in the channel **after** you've done it —
  channel-post **as** you do it; the dashboard is a live feed, not a
  retrospective.
- ❌ Do not shorten the `prompt` in `spawn_agent` to one sentence —
  paste the full skill text. Operators use it to debug behavior.
- ❌ Do not batch test results into one bulk post — one per check.
- ❌ Do not skip `stop_agent` calls — running agents that never end
  trigger the stuck-agent watchdog and produce false-positive
  incidents.

## When this skill triggers

This skill auto-triggers when:
- The user mentions agentdeck explicitly ("watch me work in
  agentdeck", "this should appear in the deck", etc.)
- The user runs a multi-step task that would benefit from
  observability (audit, migration, refactor, multi-persona test).
- The user asks for a test plan or QA campaign.

When it triggers, the entire run that follows must obey the protocol
above, even if the user gives you a different concrete task afterward.

## Verification

After your work is done, the user (or `scripts/test-cli-bridge.mjs`)
should be able to verify these facts via the agentdeck REST API on
the bridge session:

- `agents.length >= 1 + N_personas`
- `root.name != "claude-cli"`
- `root.prompt != ""`
- `channel_messages >= 3`
- `tasks.length >= 2` with `>= 1 completed`
- `tests.length >= 1`
- `docs.length >= 1` (when artefacts were produced)

Aim for all green. Each red box = a missing tool call somewhere in
your run.
