# BUG-SCH-01 — memory.updated lacks sessionId; route skips appendEvent

## Rationale

Two-part fix:

1. `packages/shared/src/types/events.ts` — `MemoryUpdated` zod schema is missing `sessionId`. Without it, the event cannot satisfy the `events.session_id NOT NULL` invariant. Added `sessionId: z.uuid()`.

2. `packages/proxy/src/routes/project-memory.ts` — body schema now accepts optional `sessionId`. When provided, the route writes a row to `events` AND emits to the bus, restoring the "every domain fact appended to events" CLAUDE.md invariant. When omitted (server-side bootstrap with no session context), the route still writes the project_memory row + emits the live event, but skips the appendEvent — preserving the schema invariant. Backward-compat: existing callers without sessionId continue to work; new callers gain audit trail.

## Diffs

- `sandbox/audit/patches/bug-7a-SCH-01-events.diff`
- `sandbox/audit/patches/bug-7b-SCH-01-route.diff`

## Test Plan

- Re-run schema-auditor — `IRRITANT-S1: memory.updated skips appendEvent` should resolve.
- POST /projects/:id/memory/:key with `sessionId`: row appears in `events` table.
- POST without `sessionId`: project_memory still updated, no events row, eventBus still fires.
