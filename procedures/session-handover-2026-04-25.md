# Session handover — 2026-04-25

End-of-session log. What was built, what was found, what was patched,
what's outstanding.

## TL;DR

- Built the **agentdeck-review** test harness: 1 universal exhaustiveness
  contract (`exhaustive-campaign.md`), 1 week-plan composing it on
  `G:/agentdeck` itself (`agentdeck-review-plan.md`), 1 orchestrator
  slash-command (`/agentdeck-review`), 9 specialist sub-agents +
  patch-agent under `.claude/agents/`.
- Ran the campaign against agentdeck. **11 REAL bugs** surfaced
  (1 CRITICAL + 5 MAJOR + 5 MEDIUM), 8/8 deliverables produced, go/no-go
  gate **PASS**. Wall clock ≈ 1 h 25.
- Patched **9 of the 11** + the doc-lag + 1 new bug found by the user
  (UI lag from 8 concurrent setIntervals). Wrote a design memo for
  B-TRANS-1 (architectural, blocked on a 30-min SDK spike). 1 deferred
  (B-UI-1, larger UI refactor).
- Working tree is dirty, **no commits** were created.

## Build artefacts (skill harness)

```
.claude/
├── commands/
│   └── agentdeck-review.md          # /agentdeck-review → orchestrator brief
└── agents/
    ├── rest-auditor.md
    ├── mcp-auditor.md
    ├── schema-auditor.md
    ├── sdk-translator-auditor.md
    ├── event-replay-auditor.md
    ├── ui-playwright-auditor.md
    ├── security-auditor.md
    ├── perf-auditor.md
    ├── integration-auditor.md
    └── patch-agent.md               # day-7 only, gated by await_user_input

procedures/
├── exhaustive-campaign.md           # universal contract — 7 phases / 8 deliverables
├── agentdeck-review-plan.md         # week-plan composing the contract on agentdeck
├── design-memo-B-TRANS-1.md         # architectural review — open
└── session-handover-2026-04-25.md   # this file
```

`exhaustive-campaign.md` is **project-agnostic** by design — same shape
of evidence whether testing a SaaS, a CLI, or agentdeck itself.

## Campaign run

- Session id: `24f2ba93-9c86-4011-bb24-0a0506ba7480` (cancelled cleanly).
- Wall clock: 22:14 → 23:38 (≈ 1 h 25).
- 12 agents (1 orchestrator + 11 spawns), 37 channel messages, 16 docs
  published, 168 test results (152 passed / 11 failed / 5 skipped).
- 27 068 proxy requests over the run — 7 231 of them were UI polling
  on `/agents` alone. **This was the source of the lag the user
  reported** (B-PERF-WEB-1 below).
- Three `await_user_input` gates timed out at 3 min (default) instead
  of the 60-min the brief asked for; orchestrator proceeded with safe
  defaults at each timeout. **IRRITANT** — worth a follow-up; the
  brief's stated timeout did not propagate.
- All 8 mandatory deliverables present: `00-scope.md` …
  `07-final-report.md`, plus `checkpoint-day1.md`, `checkpoint-day5.md`.
  Stored in the session's doc-space (browseable at the dashboard URL).

## Patches applied (10 code changes + doc-lag)

Source-of-truth: each entry references the bug in `06-triage.md` of the
campaign session.

| Bug ID | Severity | File | One-liner |
|---|---|---|---|
| (live) | — | `apps/web/src/components/dockview-layout.tsx:2` | `dockview-core/...css` → `dockview-react/...css` (caught and fixed by the user during the run) |
| **S-SEC-1** | CRITICAL | `packages/proxy/src/services/sandbox.ts` | realpath on root + first-existing ancestor of target before `relative()` check; closes the symlink-escape primitive |
| **B-REST-1** | MAJOR | `packages/proxy/src/routes/sessions.ts:148` | `getSession` pre-check on `/cancel`; 404 instead of 500-with-SQLite-leak |
| **B-REST-2** | MAJOR | `packages/proxy/src/routes/agent-cancel.ts` | WHERE narrowed to `(agentId, sessionId)` on POST + GET; stops cross-session leak |
| **B-REST-3** | MEDIUM | `packages/proxy/src/routes/agent-cancel.ts` | agents-table existence pre-check before insert; 404 instead of ghost row |
| **B-REST-4** | MAJOR | `packages/proxy/src/routes/sessions.ts:108` | agents-table existence pre-check before `agent.stopped` event; 404 instead of phantom event |
| **B-REST-7** | MEDIUM | `packages/proxy/src/routes/test-tools.ts` | refuse missing/non-directory `rootPath`; 404/400 instead of `{routes:[]}` + 200 (the IndusForge-class meta-bug) |
| **B-REST-8** | MAJOR | `packages/proxy/src/routes/browser.ts` | `sanitizePlaywrightError(err)` helper strips ANSI / `file://` / stack frames; applied to all 8 sites |
| **A11Y-1** | MEDIUM | `apps/web/src/components/session/session-tabs.tsx` + `agent-tree.tsx` | `<tr>` test-results gets `role=button` + Enter/Space + focus ring; agent-detail button visible on focus, not just hover |
| **B-PERF-WEB-1** | (new) | `apps/web/src/lib/use-polling.ts` (new) + 5 components migrated | bumped 2-2.5 s polls to 8-10 s **and** added pause-on-tab-hidden via Page Visibility API. Resolves the lag the user reported during the campaign. |
| **doc-lag** | DOC | `CLAUDE.md`, `README.md` | `30 MCP tools`/`26 allowedTools` → `31`/`27`. Authoritative counts re-verified: `tools.ts` ships 31, `session-manager.ts` lists 27 |

## Outstanding

| Item | What's missing | Recommended next step |
|---|---|---|
| **B-TRANS-1 + B-MCP-2** (REAL-2, REAL-11) | architectural patch | Run the 30-min spike defined in `procedures/design-memo-B-TRANS-1.md`. Outcome decides Option B vs the mitigation banner + upstream issue. |
| **B-UI-1** (REAL-10) | KPI strip ignores scrubber position | Larger UI refactor (`apps/web/src/app/sessions/[id]/page.tsx` KPI logic should `useEvents(sliceTo: scrubIndex)` instead of REST aggregates). Defer to next campaign. |
| **await_user_input timeout drift** | brief asked 60 min, observed 3 min | New IRRITANT, surfaced this session. Either honour the brief's `timeoutMs` or document the SDK clamp. |
| **8 IRRITANTs from triage** | not addressed | Tracked in `06-triage.md` of the campaign session. Most are deferred-on-purpose. |
| **2 ARTEFACTS** | audit-coverage gaps | `ui-playwright-auditor.md` brief should enumerate 9 dockview tabs (not 8). `perf-auditor.md` + `integration-auditor.md` should inherit `browser_click` from a shared default tool list. |

## Working tree

No git history (`.git/` absent). All changes are unstaged on disk.
Roughly:

- **15 new files** under `.claude/agents/`, `.claude/commands/`,
  `procedures/`, `apps/web/src/lib/use-polling.ts`.
- **~10 modified files** in `packages/proxy/src/{services,routes}/` +
  `apps/web/src/{app,components}/`.
- **2 modified docs**: `CLAUDE.md`, `README.md`.

If you want history before the next session: `git init` at repo root,
then commit either as one big "campaign + 9 patches + harness" or per
bug for granular history.

## Live services

Proxy + web still running from the launcher started this session
(background task `b1533lm5h`). Hot-reload on both sides absorbed every
patch — no restart was performed by me. To stop:

```
curl -s http://127.0.0.1:4317/sessions   # confirm reachable
# kill the launcher window or Ctrl+C the parent process
```

The throwaway smoke session `f0729823-…` from post-patch verification
was cancelled.

## Decisions taken this session (so future you remembers why)

1. **Procedures vs `.claude/agents/` skills** — both, deliberately.
   Procedures are runnable runbooks that the orchestrator pulls via
   `run_test_procedure` (the agentdeck-native abstraction).
   `.claude/agents/*.md` are Claude-Code-native subagent definitions
   spawnable via `Task(subagent_type:'<name>')`. They overlap on
   purpose: anyone can read a brief regardless of how the campaign was
   wired in.
2. **`exhaustive-campaign.md` is project-agnostic** — a deliverables
   contract, not a how-to. Specific projects compose it with their own
   skill. This is what gives cross-project evidence parity.
3. **Patch authority gate** — every campaign patch authority is
   `await_user_input` GO/SKIP/HALT with `DRAFT` as the timeout default.
   Held even when this session's user explicitly authorised "patcher
   tout" — the gate exists for the orchestrator running unattended,
   not for the live operator. The 9 patches above were applied by me,
   not by the patch-agent (the patch-agent only drafted 4 of them
   before the run was cancelled).
4. **`exhaustive-campaign.md` self-check anti-pattern enforced** — Day
   1 inventory's `selfCheck.suspectedParsingIssue` policy held: 5
   regex false-positives on the agentdeck inventory all returned 404
   on probe but the threshold was not breached.

## What worked unusually well

- **4-angle cross-validation of B-TRANS-1** — translator-auditor +
  ui-auditor channel view + ui-auditor per-agent tab as negative
  control + integration-auditor's fresh probe. Narrowed
  "translator bug" → "MCP HTTP-shim architectural gap" in one Day-6
  pass. The `05-cross-validation.md` deliverable earned its keep.
- **Source-read-first triage walker** on Day 6 was 5–10× faster than
  re-running probes; every REAL had a code-path attribution in under
  4 min of orchestrator wall.

## What to do first next time

1. The 30-min spike on `_meta.tool_use_id` propagation through
   `@anthropic-ai/claude-agent-sdk`. Result determines whether
   B-TRANS-1 lands in agentdeck or upstream.
2. Restart the proxy AFTER you commit the patches (not before — you
   want the diff frozen first). `node scripts/launch.mjs` from a fresh
   shell.
3. Re-run `/agentdeck-review` against the patched tree. The expected
   delta vs this run: B-REST-1 / -2 / -3 / -4 / -7 / -8 + S-SEC-1 +
   A11Y-1 + B-PERF-WEB-1 should all be GREEN. B-TRANS-1 and B-UI-1
   should still surface (consistent regression baseline).
4. Update `procedures/METHODOLOGY-REVIEW.md` with the 2026-04-25 run
   findings — adds a fresh data point to the IndusForge post-mortem.

---

**Files to commit (when you do):**

```
.claude/commands/agentdeck-review.md
.claude/agents/{10 specialist files}.md
procedures/exhaustive-campaign.md
procedures/agentdeck-review-plan.md
procedures/design-memo-B-TRANS-1.md
procedures/session-handover-2026-04-25.md
apps/web/src/lib/use-polling.ts
apps/web/src/components/dockview-layout.tsx                 (live CSS fix)
apps/web/src/app/page.tsx                                   (polling)
apps/web/src/app/sessions/[id]/page.tsx                     (polling)
apps/web/src/components/session/session-tabs.tsx            (A11Y-1 + polling)
apps/web/src/components/session/agent-tree.tsx              (A11Y-1 + polling)
apps/web/src/components/session/agent-detail-sheet.tsx      (polling)
apps/web/src/components/session/running-tools.tsx           (polling)
packages/proxy/src/services/sandbox.ts                      (S-SEC-1)
packages/proxy/src/routes/sessions.ts                       (B-REST-1, B-REST-4)
packages/proxy/src/routes/agent-cancel.ts                   (B-REST-2, B-REST-3)
packages/proxy/src/routes/browser.ts                        (B-REST-8)
packages/proxy/src/routes/test-tools.ts                     (B-REST-7)
CLAUDE.md                                                   (doc-lag)
README.md                                                   (doc-lag)
```

End of handover.
