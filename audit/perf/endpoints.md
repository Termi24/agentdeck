# Endpoint percentile detail (n=100 sequential, warm)

| Endpoint | min | mean | p50 | p95 | p99 | max |
|---|---:|---:|---:|---:|---:|---:|
| GET /sessions | 5.13 | 5.87 | 5.48 | 6.21 | 6.68 | 35.13 |
| GET /sessions/:id | 4.11 | 4.79 | 4.74 | 5.24 | 7.04 | 8.86 |
| GET /sessions/:id/agents | 4.82 | 5.76 | 5.48 | 6.11 | 14.11 | 23.65 |
| POST /sessions/:id/channel | 4.63 | 5.68 | 5.50 | 6.76 | 8.81 | 17.10 |
| POST /sessions/:id/heartbeat | 4.01 | 4.46 | 4.38 | 5.01 | 5.19 | 7.76 |
| GET /sessions/:id/channel?limit=200 | 5.54 | 6.27 | 6.22 | 7.15 | 7.55 | 9.70 |

All times in ms, measured from a localhost client (sandbox Node 24.12) against
the Fastify proxy on 127.0.0.1:4317. The 5700-event session was the target
for the parameterized routes; warm cache (each endpoint primed by an
earlier hit during throughput / bulk runs).

Outliers (max column) all happen on the first 1–3 calls of each batch
and never on subsequent calls — typical V8 / fetch JIT warm-up — they
do not affect p95.

Raw per-sample arrays: audit/perf/raw/endpoints.json
