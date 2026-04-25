# exhaustive-campaign

Top-level **deliverables contract** every exhaustive test campaign must
satisfy, regardless of the project under test (SaaS backend, CLI tool,
library, mobile app, agent system, …). The orchestrator's own skill
decides *how* to cover the target; this procedure decides *what* a
complete run looks like, and *when* it can be called done.

Purpose: force every campaign — across wildly different projects — to
produce the same shape of evidence, so an auditor (human or future
session) can read a run from a different team and immediately know
where to look.

## How the orchestrator uses this

1. First call of any campaign session:
   `run_test_procedure({ name: 'exhaustive-campaign' })`.
2. Keep the 8 deliverables open in working memory. Every phase below
   appends to one or more of them.
3. Compose with any project-specific procedure your skill already
   knows (`exhaustive-crud-test`, `isolated-ui-smoke`, `rbac-probe`,
   `claim-validator`, or ones built outside agentdeck). They are the
   *how*. This file is the *what*.
4. At end of run, self-audit the 8 deliverables via the Go/no-go gate
   below; emit one final `report_test_result` with
   `suite='campaign', caseName='exhaustiveness'`.

## Definitions

- **Unit** — a single testable surface element of the target.
  Project-agnostic: an HTTP route, a CLI command + subcommand, a UI
  screen + primary action, a library function, an MCP tool, an event
  handler, a scheduled job. If the target ships it, it counts.
- **Variant** — a dimension that multiplies a unit. Typical variants:
  persona/role, tenant, locale, device form factor, auth state, input
  class. If no variant applies, the matrix has one column.
- **Claim** — any observational assertion made by a sub-agent
  («the screen shows X», «the stdout contained Y», «this button is
  disabled»). Every claim that matters to a pass/fail decision MUST be
  cross-validated in phase 5 before it can be escalated to REAL.
- **Trace** — the agentdeck artefact that records a state change:
  channel post, `publish_doc`, `report_test_result`, `browser_screenshot`,
  or a sandbox file. **No work is silent.** If there is no trace, the
  work did not happen.

## The 8 mandatory deliverables

All are under the session doc space (`publish_doc`) or the session
sandbox, with the exact filenames below. The orchestrator writes them
— sub-agents contribute via channel + sandbox and the orchestrator
consolidates.

| # | File | Source | Phase |
|---|---|---|---|
| 0 | `00-scope.md` | orchestrator | Frame |
| 1 | `01-inventory.json` | orchestrator (+ sub-agents) | Enumerate |
| 2 | `02-coverage-positive.md` | sub-agents → orchestrator | Positive |
| 3 | `03-coverage-negative.md` | sub-agents → orchestrator | Negative |
| 4 | `04-non-functional.md` | sub-agents → orchestrator | Non-functional |
| 5 | `05-cross-validation.md` | orchestrator | Cross-validate |
| 6 | `06-triage.md` | orchestrator | Triage |
| 7 | `07-final-report.md` | orchestrator | Report |

Every file MUST exist before the session ends, even if reduced to a
justified `N/A` section.

## Phase 0 — Frame

Establish what is in scope, what is not, and what is blocked.

- Resolve credentials, URLs, repo paths, personas via `secrets_get`.
- Confirm pre-reqs (for SaaS-style targets this is `SAAS-PREREQS.md`;
  for other targets, a short equivalent inline in `00-scope.md`).
- State in-scope units classes (e.g. `routes, jobs, CLI`), out-of-scope
  ones (e.g. `admin panel, billing`), and blockers (e.g. `staging DB
  not seeded — seed before rerun`).
- Write `00-scope.md` with: campaign title, session id, wall-clock
  start, target identity (URL / repo / version / commit sha if
  available), persona list, in/out/blocked tables, planned sub-agent
  fan-out.

Exit criterion: `00-scope.md` published + one channel post
`📋 campaign framed: <N> units class(es) in scope, <M> out`.

## Phase 1 — Enumerate

Produce a machine-lisible inventory of every unit, exhaustive.

- For code-reachable targets: `api_inventory` (fastify / flask /
  express / fastapi) on the source tree. For CLI tools:
  `sandbox_exec <cli> --help` recursion. For UI-only targets:
  sitemap crawl + route table from the router config.
- **Mandatory self-check.** Whatever method produced the inventory
  must be validated against a live probe before the coverage matrix
  is built. For `api_inventory`, pass
  `selfCheck: { baseUrl }` and stop on `suspectedParsingIssue: true`.
  For other methods, probe 5–10 random units and confirm the
  discovered shape matches observed behaviour.
- Every entry: `{ kind, id, display, source?, variants: [...], owner? }`.
- Write `01-inventory.json` as JSON and a human-readable companion
  table at the top of `02-coverage-positive.md` (same rows, empty
  cells for now).

Exit criterion: `01-inventory.json` exists, non-empty, and the
self-check passes. **On a failed self-check, STOP the whole campaign
and surface it — building the matrix on a broken inventory is the
#1 false-positive factory (IndusForge week: 22 false BUG reports
caused by 2 silent parsing bugs).**

## Phase 2 — Positive coverage

For every unit × every variant that the variant-matrix says *should
succeed*, exercise the happy path once. Record result in
`02-coverage-positive.md` as a table:

| unit | variant | method | status | evidence |
|---|---|---|---|---|
| `...` | `...` | API / UI / CLI / direct | `pass` / `fail` / `skip` | link to doc / sandbox / screenshot |

Rules:
- Every 2xx / expected-success must be observed, not assumed.
- CREATE-UPDATE-ACTION chains: preserve IDs in a rolling
  `fixtures.json` under the sandbox so downstream steps can reference
  them.
- DELETE branches run LAST within a variant column. Deleting
  mid-run cascades and poisons the next probe.
- Rate-limit / backoff: `validate_claim` handles 429 natively; let it
  retry rather than hand-throttling unless the bucket is extreme.
- Skipped cells need a reason column (`fixture-missing`,
  `out-of-scope`, `blocked-on-env`, etc.).

Exit criterion: every unit appears at least once with a result
(including `skip` + reason).

## Phase 3 — Negative coverage

For every unit × every variant that the variant-matrix says *should
fail*, exercise the intended failure path. Record in
`03-coverage-negative.md`. Classes to cover, at minimum:

- **Auth denied** — unauthenticated / wrong role → 401 / 403 / UI
  redirect to sign-in. A 2xx here is a REAL bug.
- **Invalid input** — schema violation, missing required field, type
  mismatch → 4xx / surfaced validation error.
- **Not found** — bogus id / path → 404.
- **Conflict / idempotency** — duplicate create, stale version,
  concurrent modification.
- **Rate-limit** — exceed the per-bucket limit → expected 429 with
  Retry-After.
- **Transport edge** — oversize payload, malformed JSON, slow client
  → expected 413 / 400 / timeout.

Negative probes that succeed are REAL bugs, not skips.

Exit criterion: every failure class has at least one entry per unit
class (not necessarily per unit, but enumeration is preferred).

## Phase 4 — Non-functional

In scope. A non-functional miss is often more expensive to fix later
than a functional one.

Cover the three that apply to any project, adapt the tooling:

- **Performance.** For each unit class, capture p50 / p95 on the
  happy path using whatever `validate_claim` / `sandbox_exec`
  measurement works. Flag any unit over the target budget
  (budgets live in `00-scope.md`).
- **Security.** At minimum: authz matrix probe (cross-role, every
  unit × every persona-that-shouldn't-access → expected failure).
  For HTTP targets, add: missing/invalid token variants, CSRF
  where stateful, input-based injections on text fields,
  sensitive-data-exposure checks on list endpoints. Reference
  `rbac-probe` if the target is HTTP-shaped.
- **Accessibility (UI only).** WCAG 2.1 AA spot-checks on the main
  screens: keyboard-only traversal, screen-reader landmark presence,
  contrast against design tokens. Screenshot + finding per issue.

Record in `04-non-functional.md` as three subsections with their own
tables. If a subsection does not apply (e.g. no UI → no a11y), write
an explicit `N/A — <reason>` line. **Never omit the subsection.**

Exit criterion: the three subsections exist with either findings or
a justified N/A.

## Phase 5 — Cross-validate

This phase is load-bearing. Every claim raised by a sub-agent that
could become a REAL bug is re-verified here by a second independent
channel before escalation. Skip this phase and the triage produces
false positives at industrial scale — this is the direct lesson from
the IndusForge campaign (cf. `METHODOLOGY-REVIEW.md`).

- **Every UI claim** ⇒ `validate_claim` against the underlying API.
- **Every API claim** ⇒ inspect the source table / object directly
  via `sandbox_exec` (DB dump, filesystem, log tail) OR re-run the
  same call from a clean context (`browser_new_context({ reset: true })`
  + re-login + re-observe).
- **Every stdout/log claim from sandbox_exec** ⇒ `diff_exec` two
  consecutive runs, or re-run with fresh inputs, to confirm it is
  reproducible and not a flake.
- **Contamination audit.** For any UI-sourced claim, confirm the
  sub-agent started with `browser_new_context({ reset: true })` — if
  not, downgrade the claim to ARTEFACT immediately and do not raise
  as REAL.

Record in `05-cross-validation.md` as a table:

| claim | source (agent + artefact) | independent check | result | classification |
|---|---|---|---|---|
| `...` | `ui-auditor: case-07.png` | `validate_claim GET /api/x` | API agrees | REAL |
| `...` | `rest-auditor: raw/POST_auth.json` | DB check via sandbox_exec | DB agrees | REAL |
| `...` | `ui-auditor: case-11.png` | browser_new_context reset → retry | disagrees, artefact | ARTEFACT |

Exit criterion: every candidate bug surfaced by sub-agents has one
row here, with a classification.

## Phase 6 — Triage

Classify every failed or suspicious result into three buckets.

- **FLAKE** — transient (network timeout, rate-limit hit not honoured,
  race). Rule: **every FLAKE is re-run once**. If it passes on rerun,
  demote to a `note` in `07-final-report.md` (not a bug). If it fails
  again, promote to REAL.
- **ARTEFACT** — real observation but not a target defect: browser
  state contamination, stale seed, mis-configured persona,
  test-environment-only issue. Documented for methodology feedback;
  not raised as a bug.
- **REAL** — reproducible target defect backed by a passed
  cross-validation row in phase 5.

Write `06-triage.md` with three sections, each with a count at the
top. REAL section entries are ordered by severity
(`blocker > major > minor`) and link to their cross-validation row.

Exit criterion: every failure from phases 2, 3, 4 landed in exactly
one bucket. No orphan failures.

## Phase 7 — Report

Aggregate. `07-final-report.md` is the single document a human can
read to know what the campaign found.

Required sections, in order:

1. **Header** — campaign title, session id, target identity, wall
   clock (start / end / total), sub-agent fan-out, versions.
2. **Scoreboard** — positive pass-rate, negative pass-rate,
   non-functional findings count, FLAKE / ARTEFACT / REAL counts,
   deliverables checklist (all 8 green or the missing ones).
3. **REAL bugs** — list, each with: one-line summary, severity,
   link to the cross-validation row, link to the source evidence
   (doc / screenshot / raw sandbox file).
4. **Non-functional highlights** — the top 3–5 perf / security / a11y
   findings; explicit "none" if all green.
5. **Artefacts & methodology deltas** — what the ARTEFACT bucket
   revealed about the test set-up; concrete proposals for the next
   run.
6. **Run-to-run delta** — read `project_memory` key
   `campaign:last_run_summary` if present, compare totals, note new
   bugs vs regressions.
7. **Links** — to all 7 other deliverables, by relative path.

Also, from phase 7:
- `project_memory_write` key `campaign:last_run_end` value
  `<ISO timestamp>`.
- `project_memory_write` key `campaign:last_run_summary` value
  JSON `{ passRatePositive, passRateNegative, real, flake, artefact,
  wallClockMs, sessionId }`.
- `post_to_channel` one-line scoreboard so the dashboard feed shows
  it.

## Go / no-go gate

The run is **exhaustive** iff:

1. All 8 deliverables exist and are non-empty.
2. Every unit in `01-inventory.json` appears in both
   `02-coverage-positive.md` and `03-coverage-negative.md` (result
   or justified `skipped`).
3. Every REAL bug in `06-triage.md` is linked to one row in
   `05-cross-validation.md`.
4. `04-non-functional.md` has its three subsections (perf / security
   / a11y), each either with findings or a justified N/A.
5. `07-final-report.md` references all six prior deliverables by
   relative path and is the last document written.

Emit exactly one closing result:
- all five conditions met → `report_test_result suite='campaign'
  caseName='exhaustiveness' status='passed'`.
- any condition missed → `status='failed'` with `evidence` =
  `{ missing: [<filename|section>, …] }`. The human reviewer reads
  that `evidence` first.

## Anti-patterns (do not)

- Do not skip phase 5. A bug list without cross-validation is a
  rumour list.
- Do not merge phases 2 and 3. Positive and negative coverage have
  different exit criteria and diluting them hides gaps.
- Do not treat sub-agent contamination as a target bug. If
  `browser_new_context({ reset: true })` was missed, the claim is
  ARTEFACT.
- Do not end the run with missing deliverables and assume
  "we'll add them next time". The gate is binary.
- Do not rename the deliverables to match a project's taste. The
  fixed filenames are what makes cross-project comparison cheap —
  that is the entire point of this procedure.
