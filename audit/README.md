# audit/

Versioned artefacts of the **self-audit campaigns** that `procedures/agentdeck-review-plan.md` produces. Kept in the repo (not gitignored) because:

1. The retrospectives feed cross-campaign learning — `submit_campaign_retrospective` reads them.
2. The bug-by-bug `patches/bug-*.md` documents are the **canonical record** of why each patch was authored / skipped — they outlive `git log` because they capture the path-not-taken (DOC-RECOMMENDATION, PATCH-BLOCKED, PROCESS-FIX) that no commit captures.
3. The perf measurements (`perf/`, `replay/`) are baselines for the next perf-auditor to diff against.

## What's here

| Path | Origin | Purpose |
|---|---|---|
| `11-patches.md` | qa-822fa460 Phase 7 | Recap table of 12 drafted patches (10 applied, 2 PATCH-BLOCKED) |
| `12-final-summary.md` | qa-822fa460 Phase 9 | Score, perf, security, recommendations for the next campaign |
| `13-sdk-1-design-memo.md` | this backlog session 2026-04-26 | Forward-compat plan for BUG-SDK-1; status updated post-v0.0.8 |
| `patches/bug-*.md` | qa-822fa460 Phase 7 | One memo per bug (rationale, options, decision, test plan) |
| `patches/halted.md` | qa-822fa460 Phase 7 | Why patch-agent stopped before applying (proxy unreachable mid-flight) |
| `perf/` | perf-auditor | endpoints.md (p50/p95 by route) + measure.mjs + raw outputs + summary.md |
| `replay/` | event-replay-auditor | events.json, round2-events.json, probe.mjs, raw measurements |
| `schema/mcp-jsonschema.json` | schema-auditor | z.toJSONSchema() round-trip output for the 47 MCP tool inputs |
| `screenshots/` | ui-playwright-auditor + ad-hoc | UI captures referenced by the audit reports |

## What's NOT here

- The patch `*.diff` files themselves — those go into `sandbox/` (gitignored, regenerated per session). Once applied, the change is in `git log`; the rationale lives in the matching `patches/bug-*.md`.
- Session recordings, full event dumps > 1 MB — those stay in `data/workspaces/<sid>/` (gitignored) and are pulled on demand.

## Adding a new campaign

The next campaign should follow the same convention: number the cross-cutting documents `NN-<slug>.md` continuing from the last (`14-…` next), drop per-bug memos under `patches/`, and add a `screenshots/` subfolder if the UI is involved. Cf. `procedures/exhaustive-campaign.md` Phase 8 for the closure routine that produces these.
