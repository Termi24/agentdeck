---
description: Run a complete agentdeck QA campaign on a chosen test target (api, ui, regression, full, …). Picks the right specialists, runbooks and BLOCKING gates from the target template. Refuses to close the campaign until every blocking gate is satisfied.
allowed-tools:
  - mcp__agentdeck__set_agent_identity
  - mcp__agentdeck__spawn_agent
  - mcp__agentdeck__stop_agent
  - mcp__agentdeck__post_to_channel
  - mcp__agentdeck__send_direct
  - mcp__agentdeck__task_plan
  - mcp__agentdeck__task_update_progress
  - mcp__agentdeck__task_complete
  - mcp__agentdeck__report_test_result
  - mcp__agentdeck__publish_doc
  - mcp__agentdeck__read_methodology
  - mcp__agentdeck__start_qa_campaign
  - mcp__agentdeck__record_campaign_metric
  - mcp__agentdeck__submit_campaign_retrospective
  - mcp__agentdeck__end_campaign
  - mcp__agentdeck__api_inventory
  - mcp__agentdeck__schema_inventory
  - mcp__agentdeck__events_inventory
  - mcp__agentdeck__react_hooks_inventory
  - mcp__agentdeck__validate_claim
  - mcp__agentdeck__validate_claims_bulk
  - mcp__agentdeck__list_procedures
  - mcp__agentdeck__run_test_procedure
  - mcp__agentdeck__sandbox_write
  - mcp__agentdeck__sandbox_read
  - mcp__agentdeck__sandbox_exec
  - mcp__agentdeck__browser_navigate
  - mcp__agentdeck__browser_snapshot
  - mcp__agentdeck__browser_click
  - mcp__agentdeck__browser_type
  - mcp__agentdeck__browser_fill_form
  - mcp__agentdeck__browser_wait_for
  - mcp__agentdeck__browser_press_key
  - mcp__agentdeck__browser_screenshot
  - mcp__agentdeck__browser_new_context
  - mcp__agentdeck__browser_dispose_context
---

# /agentdeck-test — universal test-target dispatcher

Argument format: `<target> [campaignId] [projectName]`

- `target` — required. One of `api | ui | regression | full` (today; more shipping in v0.0.10+). Determines (a) which 9-phase weights to apply, (b) which spécialistes to fan out to, (c) which BLOCKING gates `end_campaign` will verify.
- `campaignId` — optional. When the CLI binary `agentdeck-test` invokes this command, it pre-creates the campaign and passes its id; you reuse it instead of calling `start_qa_campaign`.
- `projectName` — optional. Overrides the bridge session's project name. Default: the bridge's existing project name.

You are now the **test-target orchestrator**. Follow the protocol below verbatim. Failures at any step → escalate via `post_to_channel` and FAIL the campaign at clôture (do not silently complete).

## Step 0 — establish identity (always)

```
mcp__agentdeck__set_agent_identity({
  name: "agentdeck-test:<target>",
  role: "orchestrator"
})
```

Keep the returned `agentId` as `<root>`.

## Step 1 — load the target brief

```
mcp__agentdeck__read_methodology({ section: "target-<target>" })
```

Read it carefully. The brief lists:
- the phase weights (full/light/skip per phase),
- the spécialistes you must fan out to,
- the BLOCKING gates (with the exact metric names you must `record_campaign_metric` for so the gate engine can evaluate them at end_campaign),
- the runbooks attached.

If the section returns 404 (`unknown_target`), STOP and report `target-<x>` is not registered.

## Step 2 — register the campaign

If `campaignId` was passed in args, use it directly. Otherwise:

```
mcp__agentdeck__start_qa_campaign({
  projectName: "<projectName-from-args-or-bridge>",
  cliSource: "claude-code",
  target: "<target>"
})
```

Keep `campaignId`. Post to channel: "Campaign <campaignId> started — target=<target>".

## Step 3 — declare the plan (Gantt seed)

For each phase weighted `full` or `light` in the target brief, call `task_plan` with realistic ISO 8601 windows:

```
mcp__agentdeck__task_plan({
  agentId: "<root>",
  title: "<phase-name> — <one-sentence what it does>",
  plannedStart: "<ISO>", plannedEnd: "<ISO>"
})
```

Skip phases marked `skip`.

## Step 4 — fan out the spécialistes

For each spécialiste listed in the target brief:

1. `spawn_agent({ name: "<specialist>", role: "auditor", prompt: "<paste the FULL skill from .claude/agents/<specialist>.md>", parentAgentId: <root> })`
2. Either invoke `Task({ subagent_type: "<specialist>", prompt: "..." })` if the agent file matches a known sub-agent type, OR perform the spécialiste's runbook inline if the file describes free-form work.
3. After the spécialiste completes, IT must `record_campaign_metric` for every metric the brief listed. If the spécialiste forgot, **you record what you observed in its output** so the gate engine sees it.
4. `stop_agent({ agentId, status })`.

If a spécialiste reports a bug, send it to a `claim-validator` (built-in role — register it as a sub-agent and follow `procedures/claim-validator.md`). For each claim:
- `record_campaign_metric({ campaignId, name: "claims.reported", value: <cumulative> })`
- after re-validation, `record_campaign_metric({ campaignId, name: "claims.validated", value: <cumulative> })`

## Step 5 — verify all required metrics are recorded

Before submitting the retrospective, **re-read the gates table from the brief** and confirm `record_campaign_metric` has been called for every metric name referenced. Missing a metric == automatic gate failure (no silent pass). For metrics that legitimately don't apply (e.g. `regression.failed` when no regression suite ran in this campaign) you must:

1. Document the absence in the retrospective.toolingFeedback as `<GATE-NAME>-EXEMPT: <subject>: <reason>`.
2. Still record `0` for the missing numerator if the gate is a ratio — otherwise the gate fails on missing-or-zero-denominator.

## Step 6 — submit the retrospective

```
mcp__agentdeck__submit_campaign_retrospective({
  campaignId,
  whatWentWell: "<concrete>",
  whatWentBadly: "<concrete>",
  keyLearnings: "<concrete>",
  toolingFeedback: "<concrete; include any <GATE>-EXEMPT lines>",
  recommendations: "<concrete>"
})
```

## Step 7 — close the campaign (gate engine fires here)

```
mcp__agentdeck__end_campaign({ campaignId, status: "completed" })
```

If the proxy returns 422 with `error: "gate_violation"` or `error: "ui_coverage_violation"`:
- DO NOT mark the campaign completed.
- Read the response carefully — `blockers` lists the gates that failed and `value` / `threshold` show by how much.
- For each blocker:
  - If it's a real defect: re-run the spécialiste(s) responsible for that metric, record the new value, and retry `end_campaign`.
  - If it's a measurement gap (e.g. metric never recorded): record the metric correctly and retry.
  - If you decide to waive: edit `retrospective.toolingFeedback` (PUT /campaigns/:id/retrospective) to add `<GATE-NAME>-EXEMPT: <subject>: <reason>` with a justification, then retry.
- NEVER call `end_campaign({ status: "completed" })` while a blocking gate is failing.

## Step 8 — clean shutdown

```
mcp__agentdeck__stop_agent({ agentId: <every spawned sub-agent>, status: "completed" })
mcp__agentdeck__stop_agent({ agentId: "<root>", status: "completed" })
```

## What NOT to do

- ❌ Do not skip Step 1 — the gate engine reads the metrics you record; without the brief you don't know which metric names to use.
- ❌ Do not silently complete a campaign with a failing gate. The whole point of this dispatcher is the gate.
- ❌ Do not record fake metrics to satisfy a gate. If the spécialiste didn't run, mark the gate with an explicit waiver line in the retro.
- ❌ Do not change `target` mid-campaign.

## Verification (operator checklist)

After the run, an operator should be able to:
- `GET /campaigns/<campaignId>` → see `gates: [...]` with every gate from the template, all with `passed: true` (or with explicit `waived: true`).
- See `gateResultsJson` populated on the campaign row.
- Find the run on the dashboard at `http://127.0.0.1:3000/sessions/<bridge-session-id>` with the AgentTree showing every spécialiste, the Channel populated, and Tests panel with the spécialiste reports.
