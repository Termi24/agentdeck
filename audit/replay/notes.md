# Event-replay-auditor notes

- HTTP path: no `GET /sessions/:id/events` mounted. Only Socket.IO via `events:batch` after `session:join`.
- Used existing `socket.io-client@4.8.3` from `apps/web/node_modules`. Sandbox npm install crashed with native DLL error on Windows; fell back to running `node` directly from `apps/web/`.
- Memory event (`memory.updated`) is project-scoped, not session-scoped; the `replayFor()` query filters `events.sessionId = ?` so global events are never in the per-session batch. Confirmed memory.updated arrived as a live `event` delta (deltas=1 in second probe), so the storage IS atomic — it just isn't returned by replayFor for that session, by design.
- Probe session: `d93a5465-3e69-4075-8abe-d51e7a865a19` — 12 events, all five domain counts match REST.
- Part B session: `30a38b07-3c17-4920-8d04-3f146025cab2` (29 events, completed sdk-translator-probe). Scrubber slice is monotone across {0, 10%, 50%, 90%, last, OOB}; OOB clamps to total; final equals REST.
- No mismatches detected on either session.
