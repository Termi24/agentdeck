# BUG-SCH-03 — appendEvent always writes seq=0

## Rationale

`packages/proxy/src/persistence.ts:401` hardcoded `seq: 0` on every `events` insert. The schema has `index('events_session_seq_idx').on(sessionId, seq)` — seq is meant to be a per-session monotonic ordinal, computed by the existing `nextSeq(sessionId)` helper at line 441. Calling `nextSeq()` here makes the table column track the payload field instead of pinning every row to 0.

## Diff

See `sandbox/audit/patches/bug-3-SCH-03.diff`.

## Test Plan

- After apply + proxy restart, run any session: `SELECT seq FROM events WHERE session_id=? ORDER BY id` should return `0,1,2,…` not all zeros.
- Re-run the event-replay-auditor procedure: `count(events.seq DISTINCT) > 1` per active session.
