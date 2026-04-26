# BUG-REST-003 — heartbeat returns 204 even on reaped bridges

## Rationale

`POST /sessions/:id/heartbeat` unconditionally calls `bumpBridgeHeartbeat(id)` and returns 204. If the row was just reaped by the watchdog, `bumpBridgeHeartbeat` silently revives it (revival path) — the CLI never learns its bridge is dead and continues operating against a session that disappeared from the hub between sweeps.

The fix returns 410 Gone with `{error:"session reaped", sessionId, status}` when the session is a bridge whose status is no longer running/pending/waiting_tool. The CLI can then choose to log the gap or recreate a fresh session. SDK sessions are unaffected (the watchdog never finalizes them via this path).

## Diff

See `sandbox/audit/patches/bug-10-REST-003.diff`.

## Test Plan

- `POST /sessions/<reaped-bridge-id>/heartbeat` should return 410 with the documented body.
- `POST /sessions/<live-bridge-id>/heartbeat` should still return 204.
- `POST /sessions/<unknown-id>/heartbeat` should return 404.
