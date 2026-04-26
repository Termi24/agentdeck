# 06 - Event-Replay Audit (campaign qa-da2e6f28)

**Probe session**: `07582244-bfef-4123-988a-9675354f4490`
**Project**: `qa-da2e6f28-replay-probe`
**Date**: 2026-04-25
**Auditor**: event-replay-auditor

## Method

1. Created a fresh bridged probe session via `POST /sessions {bridge:true}`.
2. Posted a known fixture: 5 channel messages, 2 docs, 3 test-results,
   1 sandbox write, 2 sub-agents spawned, 1 sub-agent stopped.
3. Read the raw events stream straight from
   `data/agentdeck.db -> events` table (server-side, since there is no
   `GET /sessions/:id/events` HTTP endpoint — replay flows through a
   Socket.IO `session:join` subscription that re-emits `events.payload`
   in `id ASC` order; querying SQLite directly is byte-equivalent and
   avoids the WS handshake).
4. Compared per-domain REST endpoint counts (`channel`, `docs`,
   `test-results`, `agents`) to the fold of the corresponding event
   types from the events table.

## Fixture event stream (16 rows)

```
session.started:           1
agent.spawned:             3   (root + 2 sub-agents)
agent.stopped:             1   (sub-agent-A)
channel.message.posted:    5
doc.published:             2
test.result.reported:      3
sandbox.file.changed:      1
```

## Diff table — REST vs events fold

| Domain         | REST endpoint                          | REST count | Event type                  | Events count | Verdict |
|----------------|----------------------------------------|------------|-----------------------------|--------------|---------|
| channel        | `GET /sessions/:id/channel`            | 5          | `channel.message.posted`    | 5            | PASS |
| docs           | `GET /sessions/:id/docs`               | 2          | `doc.published`             | 2            | PASS |
| test-results   | `GET /sessions/:id/test-results`       | 3          | `test.result.reported`      | 3            | PASS |
| agents         | `GET /sessions/:id/agents` (lifecycle) | 3 rows / 3 status='running' | `agent.spawned`=3, `agent.stopped`=1 | spawned MATCH, **stopped MISMATCH** | FAIL |
| sandbox        | (no REST list)                         | n/a        | `sandbox.file.changed`      | 1            | PASS (one-way) |

## Scrubber determinism (Part B)

Folded `events[0..=scrubIndex]` for scrubIndex in {0, 10%, 50%, 90%, last=15}:

| scrubIndex | channel | docs | tests | spawned | stopped |
|-----------:|--------:|-----:|------:|--------:|--------:|
| 0          | 0       | 0    | 0     | 0       | 0       |
| 1 (10%)    | 0       | 0    | 0     | 1       | 0       |
| 8 (50%)    | 5       | 2    | 0     | 1       | 0       |
| 14 (90%)   | 5       | 2    | 3     | 3       | 0       |
| 15 (last)  | 5       | 2    | 3     | 3       | 1       |

- Each count is monotonically non-decreasing in scrubIndex (no negatives, no resets). PASS
- At `scrubIndex=last`, the fold equals the REST counts for channel,
  docs, test-results (5 / 2 / 3). Agents table is out of sync with
  the agent.stopped event (see Findings).

## Findings

### F1 — TRANSACTIONAL INVARIANT VIOLATED — `POST /agents/:agentId/stop`

**Severity**: HIGH (breaks the event-sourcing invariant guaranteed in CLAUDE.md)

The endpoint **appends `agent.stopped` to `events` but never updates the
`agents` row**. After calling stop on `87af03fc-…`:

- events: contains `{type:'agent.stopped', agentId:'87af03fc…', status:'completed'}` -> count=1
- agents row: still `{status:'running', ended_at:null}` -> 3 running rows

CLAUDE.md states "Every domain fact (channel post, doc publish, test
result, etc.) is written to its own table AND appended to `events` in
the same transaction — session replay works from `events` alone."
Agent.stopped violates the first half of this contract.

Source: `packages/proxy/src/routes/sessions.ts:137-160` — the handler
calls `appendEvent(ev)` but no `update(agents).set({status, endedAt})`
clause.

**Impact**:
- Folding events shows the agent stopped; REST `/agents` endpoint says
  it is still running — UIs that mix the two (the dashboard polls
  `/agents` for status badges AND consumes the live event stream) will
  show inconsistent state.
- The `runningAgentCount` correlated sub-query in `getSession()` /
  `listSessions()` will continue counting stopped sub-agents.
- The "pure reducer over events" property of the dashboard is true,
  but only because the dedicated REST aggregates are independently wrong
  (see F2).

### F2 — `GET /sessions/:id` aggregates report 0 / null for everything

**Severity**: HIGH (visible in the hub UI)

`GET /sessions/07582244-…` returns:
```
agentCount: 0, runningAgentCount: 0,
channelMessageCount: 0, docCount: 0, testResultCount: 0,
toolCallCount: 0, runningToolCallCount: 0,
lastActivityAt: null, lastChannelMessage: null
```
…while direct SQLite queries on the same `data/agentdeck.db` show
3/5/2/3/16 (events) and a non-null `max(created_at)`. Same regression
in `GET /sessions?limit=10` — every session in the list reports
all-zero aggregates.

The correlated sub-queries in `persistence.ts:getSession()` /
`listSessions()` look correct in source; the running proxy must be
producing the SQL on a different DB binding, or returning cached rows.
This is OUT OF SCOPE for the event-replay invariant per se, but it
breaks the hub UI and makes any dashboard claim about "X messages, Y
docs" untrustworthy.

### F3 — `socket.io-client` HTTP fallback used

The runbook expected `GET /sessions/:id/events` to be available; it
isn't. Replay only flows through a Socket.IO `session:join`
subscription. Rather than installing `socket.io-client`, this audit
read the underlying `events` table directly from SQLite via
`better-sqlite3` (already a workspace dep). The byte-payload of the
events table is what the Socket.IO handler emits verbatim
(`event-bus.ts:30 -> socket.emit('event', row.payload)`), so this
short-circuit is byte-equivalent to a Socket.IO replay.

## Verdict

**3/5 checks PASS, 1/5 FAIL, 1/5 PASS-with-caveat.**

The event-sourcing invariant **holds for channel posts, doc publishes,
test results, and sandbox writes** — exactly one event per row, at the
same `at` timestamp, in the same SQLite transaction.

The invariant **fails for agent stops**: the `agent.stopped` event is
appended without updating the `agents` table row. Fix in
`packages/proxy/src/routes/sessions.ts:137-160`.

