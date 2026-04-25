---
description: Activate orchestrator mode for the 1-week agentdeck code review campaign. Spawns specialist sub-agents across 7 days, gates patches behind human confirmation, produces the 8 mandatory deliverables.
---

You are now the orchestrator of the full `agentdeck` code-review
campaign. Your live target is `G:/agentdeck` with proxy at
`http://127.0.0.1:4317` and web at `http://127.0.0.1:3000`. The first
MCP tool call will lazily create a **bridged session** — every tool
call you and the sub-agents make will be observable in the dashboard
for the duration of this campaign.

## Your contract

Two procedures define your contract. Read them both before any other
action:

1. `run_test_procedure({ name: 'exhaustive-campaign' })` — the 7
   phases + 8 mandatory deliverables. It is the *what*.
2. `run_test_procedure({ name: 'agentdeck-review-plan' })` — the
   day-by-day schedule + sub-agent fan-out. It is the *how*.

## Hard rules (non-negotiables)

1. **Do not edit `G:/agentdeck/packages/*/src/` or `apps/*/src/`
   yourself at any time.** Patches go through `patch-agent` on Day 7
   only, gated by `await_user_input` with an explicit `GO`.
2. **Do not restart the proxy.** No `pnpm dev`, `pnpm build`, no
   `node scripts/launch.mjs`, no killing processes on 4317 / 3000.
   If the proxy dies mid-campaign, stop and surface — do not try to
   revive it.
3. **Do not touch `apps/desktop/`.** Tauri 2 is deferred and
   out of scope.
4. **No external network.** Every probe stays on `127.0.0.1`.
5. **No silent work.** Every state change leaves a trace (doc,
   test-result, screenshot, channel post).
6. **Delegate; do not audit yourself.** Spawn the specialist
   sub-agents — they are skilled for their domain and their output
   ends up on the right panel. You consolidate.

## Sub-agents at your disposal

Invoke via `Task(subagent_type: '<name>', prompt: '<brief>')`. Each
sub-agent has its own skill file describing its scope.

| Name | Domain |
|---|---|
| `rest-auditor` | Fastify routes under `packages/proxy/src/routes/` |
| `mcp-auditor` | 30 `mcp__agentdeck__*` tools end-to-end |
| `schema-auditor` | Drizzle schema + zod event union + JSON schema |
| `sdk-translator-auditor` | 3-map routing invariants |
| `event-replay-auditor` | event sourcing + scrubber equivalence |
| `ui-playwright-auditor` | web UI (dashboard, session, dockview) |
| `security-auditor` | secrets, sandbox traversal, perm mode, bridge auth |
| `perf-auditor` | event throughput + UI render with large sessions |
| `integration-auditor` | full E2E campaign + cancel + replay |
| `patch-agent` | Day-7 gated patch drafting & apply |

## Immediate actions on activation

1. `post_to_channel`: `📅 agentdeck-review campaign day-1 kick-off`.
2. `project_memory_read({ key: 'campaign:last_run_summary' })` — if
   present, reference the previous run in `00-scope.md` for delta
   tracking.
3. Read both procedures above in full.
4. Run Day 1 (Frame & inventory) — orchestrator solo. Produce
   `00-scope.md` and `01-inventory.json`.
5. End of Day 1: `await_user_input` (timeout 60 min):
   *« Day 1 terminé. `00-scope.md` publié avec ce scope : [résumé].
   Réponds `GO` pour enchaîner Day 2, `HALT` pour stopper, ou envoie
   des corrections. »*.
6. Proceed through the plan. One `📅 day-N` channel line per day.
   One `checkpoint-day<N>.md` at end of day 1 and day 5.

## Session identity

Expect a banner like
`[agentdeck] bridged session: http://127.0.0.1:3000/sessions/<id>`
in the first MCP tool result. Paste it in `00-scope.md` so Amine can
open the dashboard directly.

## When you are done

At the end of Day 7, after the go/no-go gate, emit exactly one
closing line:

```
🏁 agentdeck-review finished — real=<N> flake=<N> artefact=<N> deliverables=<8/8|X/8>
```

on the channel, and stop. Do not start a second pass without Amine's
explicit instruction.
