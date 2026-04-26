# Phase 7 — Patch authoring summary (campaign qa-822fa460)

## Pre-flight

- HEAD: `28e84215bb5dc88ea701094adf18d21c7ceb6c3c`
- Working tree: 8 modified files (per git status). All my drafted patches generated against the dirty working tree (via `diff -u` of pristine copies in `.patchwork/`) so they layer on top of the in-flight changes.

## Recap table

| # | Bug ID | Patch file | Drafted | git apply --check | Applied | Notes |
|---|---|---|---|---|---|---|
| 1 | BUG-UI-01a | — | NO-OP | n/a | n/a | Bug not present in current source (line 80 already uses `/sessions/`) |
| 2 | BUG-UI-01b | `bug-2-UI-01b.diff` | yes | OK | pending GO | Differentiates 404/410 vs network errors |
| 3 | BUG-SCH-03 | `bug-3-SCH-03.diff` | yes | OK | pending GO | `seq: 0` → `seq: nextSeq(sessionId)` |
| 4 | BUG-REST-002 | `bug-4-REST-002.diff` | yes | OK | pending GO | Enum-first union for expectStatus |
| 5 | BUG-SCH-04 | — | DOC-RECOMMENDATION | n/a | n/a | Recommended option B (CLAUDE.md amendment); skipped per "no migrations" rule |
| 6 | BUG-SDK-1 | — | PATCH-BLOCKED | n/a | n/a | Triage already classified as P2 NON-TRIVIAL; needs design memo |
| 7 | BUG-SCH-01 | `bug-7a-SCH-01-events.diff` + `bug-7b-SCH-01-route.diff` | yes (2 files) | OK | pending GO | sessionId added; appendEvent gated on its presence |
| 8 | BUG-MCP-B2 | — | PROCESS-FIX | n/a | n/a | `pnpm --filter @agentdeck/mcp build` (rebuild, not a patch) |
| 9 | BUG-SCH-02 | `bug-9-SCH-02-events.diff` + `bug-9-SCH-02-route.diff` | yes (2 files) | OK | pending GO | New SandboxExecCompleted event + correct create/modify op |
| 10 | BUG-REST-003 | `bug-10-REST-003.diff` | yes | OK | pending GO | 410 Gone on reaped bridge heartbeat |
| 11 | MCP-B1 | `bug-11-MCP-B1.diff` | yes | OK | pending GO | CLAUDE.md (3 refs) + mcp/src/index.ts (1 ref) → 42 tools |
| 12 | MISS-INT-1 | `bug-12-MISS-INT-1.diff` | yes | OK | pending GO | New `GET /sessions/:id/events?limit&offset&afterId` |

**Drafted: 10 diff files (covers 8 bugs).** **Skipped: 4 (UI-01a no-op, SCH-04 doc recommendation, SDK-1 blocked, MCP-B2 process).**

## Files touched per patch

| Patch | File(s) | Hunks | LOC delta |
|---|---|---|---|
| bug-2 | `apps/web/src/app/sessions/[id]/page.tsx` | 1 | +12 −2 |
| bug-3 | `packages/proxy/src/persistence.ts` | 1 | +1 −1 |
| bug-4 | `packages/proxy/src/routes/test-tools.ts` | 1 | +5 −2 |
| bug-7a | `packages/shared/src/types/events.ts` | 1 | +5 −0 |
| bug-7b | `packages/proxy/src/routes/project-memory.ts` | 3 | +25 −2 |
| bug-9-events | `packages/shared/src/types/events.ts` | 2 | +18 −0 |
| bug-9-route | `packages/proxy/src/routes/sandbox.ts` | 3 | +35 −1 |
| bug-10 | `packages/proxy/src/routes/sessions.ts` | 1 | +12 −1 |
| bug-11 | `CLAUDE.md` + `packages/mcp/src/index.ts` | 4 | +4 −4 |
| bug-12 | `packages/proxy/src/routes/sessions.ts` | 2 | +30 −2 |

## Ordering for `APPLY all`

Patches 10 + 12 both touch `sessions.ts` — `git apply` of both together still passes `--check`, but if applied serially the second may need a re-fuzz. Suggested order:

1. bug-3-SCH-03 (1 LOC, persistence)
2. bug-4-REST-002 (1 hunk, test-tools)
3. bug-7a-SCH-01-events
4. bug-7b-SCH-01-route
5. bug-9-SCH-02-events
6. bug-9-SCH-02-route
7. bug-2-UI-01b
8. bug-10-REST-003
9. bug-12-MISS-INT-1 (after bug-10 to avoid re-fuzz)
10. bug-11-MCP-B1

## Decision needed

10 patches drafted. Reply `APPLY all`, `APPLY <n>` (e.g. `APPLY 3 4 11`), `SKIP <n>`, or `HALT`.
