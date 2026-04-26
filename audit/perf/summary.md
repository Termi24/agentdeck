# Perf audit summary — campaign qa-da2e6f28

| Metric | p50 | p95 | Budget | Status |
|---|---:|---:|---:|---|
| GET /sessions | 5.48 ms | 6.21 ms | 100 ms | PASS |
| GET /sessions/:id (5700 ev) | 4.74 ms | 5.24 ms | 100 ms | PASS |
| GET /sessions/:id/agents | 5.48 ms | 6.11 ms | n/a | PASS |
| POST /sessions/:id/channel | 5.50 ms | 6.76 ms | 50 ms | PASS |
| POST /sessions/:id/heartbeat | 4.38 ms | 5.01 ms | n/a | PASS |
| GET /sessions/:id/channel?limit=200 | 6.22 ms | 7.15 ms | 500 ms | PASS |
| Socket.IO replay (5700 ev) | 78.32 ms | 88.87 ms | 500 ms | PASS |
| POST→Socket delivery latency | 5.02 ms | 5.96 ms | 200 ms | PASS |
| Dashboard / SSR HTML | — | 101.73 ms | 1500 ms | PASS |
| Session SSR HTML (5700 ev) | — | 162.59 ms | 2500 ms | PASS |
| Dockview SSR HTML | — | 66.25 ms | 2500 ms | PASS |
| Replay scrubber RTT | — | — | 200 ms | SKIP (no clickable browser primitive) |

Verdict: 6/7 budgets within target, 0 failures, 1 skip with documented rationale.

Bulk insert: 5000 channel messages in 20.45 s end-to-end (~245 msg/s, 0 errors).
Synthetic session 96b094f3-641c-4ff1-b025-fbeeb324604b held 5700 events at run end.

Both perf-probe sessions are finalized (status=completed). Browser context disposed.
