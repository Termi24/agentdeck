# BUG-UI-01b — silent catch in dashboard polling masks 404/410

## Rationale

`SessionDashboard.usePollingInterval` swallowed every Promise.all rejection in a bare `catch {}`, including the 404/410 cases that should swap the view to `SessionNotFound`. Without this fix, deleting a session out from under an open dashboard tab leaves the user staring at a stale snapshot indefinitely.

The patch keeps the "proxy offline = stay on last snapshot" behaviour for generic network errors, and only flips to `loadState='missing'` when the error message carries a `404` or `410` token.

## Diff

See `sandbox/audit/patches/bug-2-UI-01b.diff`.

## Test Plan

- Open a session dashboard, then delete the row directly via SQLite. Within 8 s the dashboard should switch to SessionNotFound.
- Stop the proxy; the dashboard should keep showing the last snapshot.
- Combined with patch BUG-REST-003, verify a heartbeat returning 410 also triggers the missing view.
