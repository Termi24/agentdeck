# BUG-SCH-04 — campaign_metrics.id is integer autoincrement, not UUID

## Status: DOC-RECOMMENDATION (no code patch)

## Two options

**Option A — migrate `campaign_metrics.id` to UUID text PK.**
- Pros: matches the rest of the schema's "IDs are UUIDv4" convention from CLAUDE.md.
- Cons: requires a migration (forbidden by Phase-7 hard rule 4 "no migrations"); breaks any external consumer reading by `id`; campaign_metrics is event-sourced append-only, so the integer autoincrement is operationally fine.

**Option B (recommended) — amend CLAUDE.md to acknowledge the carve-out.**
- One-line edit to the `Conventions` section: "**IDs are UUIDv4**. Event-sourced PKs (`events.id`, `campaign_metrics.id`) are the only autoincrement integers."
- Zero-risk, captures actual intent (these tables are append-only logs where seq matters more than UUID portability).

## Recommendation

Pick option B. Migration cost outweighs portability benefit for an internal log table that is never referenced cross-process by id.

## Diff

No diff drafted — awaiting decision. If A is chosen, I will draft a `0004_*.sql` migration + schema.ts edit + emit `report_test_result(suite='patch', caseName='SCH-04', status='skipped', message='dep on migration policy')`.

## Test Plan (if Option B picked)

- Edit CLAUDE.md `Conventions` line about IDs (1 line).
- Re-run schema-auditor; the SCH-04 finding should drop from MAJOR to DOC.
