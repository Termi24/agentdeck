# BUG-SCH-02 — sandbox emits no exec.completed event; sandbox_write op miscoded

## Rationale

Two related schema fixes for the sandbox surface:

1. **`sandbox.exec.completed` event missing.** Every sandbox_exec writes a row in `exec_runs` but emits NO event, so the activity feed shows the agent's tool_use/tool_result but no "command finished, exit=N, took 2.3s" line. Added a new `SandboxExecCompleted` event variant in `events.ts`, plumbed in routes/sandbox.ts after the DB write.

2. **`sandbox_write` op was always 'modify'.** Even on first creation. Fixed by checking `existsSync(resolveSandboxPath(...))` BEFORE the write so the event op accurately reflects create vs modify. Activity feed reasoning ("did the agent overwrite or create?") is now truthful.

## Diffs

- `sandbox/audit/patches/bug-9-SCH-02-events.diff` (events.ts — add SandboxExecCompleted variant)
- `sandbox/audit/patches/bug-9-SCH-02-route.diff` (routes/sandbox.ts — emit + correct op)

## Test Plan

- Apply, restart proxy, run any session that calls `sandbox_exec` — the activity feed should show a new "exec · cmd · exit 0 · 1.2s" row.
- Run `sandbox_write path=new-file content=hi` then `sandbox_write path=new-file content=hi2` — first event op should be `create`, second `modify`.
- Re-run schema-auditor — `IRRITANT-S3: sandbox.file.changed has no dedicated table` reframes (event still has no table; consider follow-up).
