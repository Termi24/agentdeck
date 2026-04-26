# MISS-INT-1 — no GET /sessions/:id/events endpoint

## Rationale

External orchestrators / replay tools currently have to subscribe to Socket.IO to fold the event stream — there's no offline / cursor-based REST path. Added a sibling endpoint to `GET /tool-calls`:

```
GET /sessions/:id/events?limit=N&offset=O&afterId=ID
```

Returns events ordered by insertion id (`asc`). `afterId` enables long-poll cursors (pass last seen id, get only newer). Limits capped at 5000/page; offset capped at the usual int range; afterId is non-negative.

## Diff

See `sandbox/audit/patches/bug-12-MISS-INT-1.diff`.

## Test Plan

- After apply, `curl http://127.0.0.1:4317/sessions/<id>/events?limit=10` returns the first 10 event rows.
- `curl http://127.0.0.1:4317/sessions/<id>/events?afterId=<last>` returns only newer rows.
- Pairs with the replay tools that audited this gap.
