---
description: Run an agentdeck CLI-bridge self-test — exercises every MCP tool, reports a single line summary at the end. Used by scripts/test-cli-bridge.mjs to validate that the agentdeck-run skill is wired up correctly.
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
---

You are running the agentdeck CLI-bridge **self-test**. Your only job
is to exercise every agentdeck MCP surface so that an operator can
verify the bridge plumbing is healthy. The work below is synthetic —
do not interpret it as a real task.

Execute the protocol below verbatim. Pass returned ids forward where
required. Do not ask for confirmation between steps.

1. `mcp__agentdeck__set_agent_identity({ name: "self-test-runner", role: "self-test" })` — keep the returned agent id as `<root>`.

2. `mcp__agentdeck__task_plan({ agentId: <root>, title: "Phase A — sanity-check plumbing", description: "Spawn worker, post to channel, write a test result.", plannedStart: <ISO now>, plannedEnd: <ISO now+5min> })` — keep the returned task id as `<phaseA>`.

3. `mcp__agentdeck__task_plan({ agentId: <root>, title: "Phase B — cross-check artefacts", description: "Publish a doc, complete sub-agent.", plannedStart: <ISO now+5min>, plannedEnd: <ISO now+10min> })` — keep the returned task id as `<phaseB>`.

4. `mcp__agentdeck__spawn_agent({ name: "smoke-worker", role: "tester", prompt: "I am a synthetic worker spawned by the agentdeck self-test runner. I make a few tool calls to prove the bridge wires up correctly: post one channel message, send one DM back to the orchestrator, report one test result. I do not do real work.", parentAgentId: <root> })` — keep the returned agent id as `<worker>`.

5. `mcp__agentdeck__post_to_channel({ fromAgentId: <root>, fromAgentName: "self-test-runner", content: "Self-test starting. Spawned smoke-worker to exercise the bridge." })`

6. `mcp__agentdeck__post_to_channel({ fromAgentId: <worker>, fromAgentName: "smoke-worker", content: "Worker online. Running sanity checks." })`

7. `mcp__agentdeck__send_direct({ fromAgentId: <worker>, fromAgentName: "smoke-worker", toAgentId: <root>, content: "Phase A done. Asking for permission to publish doc." })`

8. `mcp__agentdeck__task_update_progress({ taskId: <phaseA>, progressPct: 100, status: "completed" })`

9. `mcp__agentdeck__task_complete({ taskId: <phaseA>, status: "completed" })`

10. `mcp__agentdeck__report_test_result({ agentId: <worker>, suite: "self-test", caseName: "channel-roundtrip", status: "passed", message: "post_to_channel + read_channel returned the same content" })`

11. `mcp__agentdeck__publish_doc({ path: "self-test/run.md", content: "# Self-test run\\n\\nThe bridge plumbing is healthy. All surfaces populated.", byAgentId: <root> })`

12. `mcp__agentdeck__post_to_channel({ fromAgentId: <root>, fromAgentName: "self-test-runner", content: "Self-test complete — all surfaces populated." })`

13. `mcp__agentdeck__stop_agent({ agentId: <worker>, status: "completed" })`

After step 13, write **one line** of summary, e.g.

> Self-test complete: 13 tool calls executed, smoke-worker stopped.

Do nothing else. Do not file a finding even if a tool throws — just
report the count of successful calls in your summary.
