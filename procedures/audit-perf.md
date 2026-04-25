# Procedure: audit-perf

## Objectif
Mesurer la perf d'agentdeck sur les hot paths : REST p50/p95, throughput insert, Socket.IO replay, UI render initial. Détecter régression vs baseline historique.

## Pré-requis
- Proxy en up sur baseUrl
- Tools : `mcp__agentdeck__validate_claims_bulk`, `mcp__agentdeck__sandbox_exec`, `mcp__agentdeck__record_campaign_metric`
- Si baseline existe : `GET /metrics/series?name=<metric>&projectName=<...>` (A8 sprint suivant)

## Étapes

1. **Bench REST endpoints**
   Pour chacun de : `GET /sessions`, `GET /sessions/:id`, `GET /sessions/:id/agents`, `POST /sessions/:id/channel`, `POST /sessions/:id/heartbeat`
   - Appeler 100× via `validate_claims_bulk(parallelism:1)` (sériel pour mesurer la latence)
   - Calculer p50, p95 sur les `durationMs`
   - `record_campaign_metric(name='perf.<endpoint>.p95', value=<ms>, tags={endpoint})`

2. **Bench bulk insert**
   Utiliser `POST /sessions/:id/channel/bulk` avec `messages: [×5000]`. Mesurer ms total.
   - Asserts : ≥ 4000 msg/s (post-WIN-3)
   - record_campaign_metric `perf.bulk_insert.throughput_per_sec`

3. **Bench Socket.IO replay**
   Sur la session de 5000 events : open browser, mesurer time-to-firstEventBatch via `browser_evaluate("performance.mark('start')...")` ou via socket.on dans un script standalone.
   - Asserts : ≤ 30 ms post-batch-emit (WIN-4)

4. **Bench UI SSR**
   GET / + GET /sessions/:id via `validate_claim`. Vérifier `Server-Timing` header si présent, sinon `durationMs`.
   - Asserts : Hub HTML p95 < 200 ms ; Session HTML p95 < 300 ms

5. **Bench replay scrubber**
   Sur la session de 5000 events, browser_navigate /sessions/:id, programmatically set scrubIndex à 0 / 2500 / 4999, mesurer le délai entre `setScrubIndex(N)` et le re-render finalisé.
   - Asserts : < 200 ms par position

6. **Cleanup**
   Cancel les sessions de probe (`POST /sessions/:id/cancel`).

## Format des reports
- suite: `perf-budgets`
- caseName: `<metric>: <p50|p95> within budget`
- evidence: `{p50, p95, budget_ms, sample_count}`

## Critère de done
- 5 catégories de bench couvertes
- Au moins 8 metrics enregistrées via `record_campaign_metric`
- Doc `09-perf-audit.md` publié avec tableau récap

## Anti-patterns
- Mesurer pendant un `pnpm install` ou un build concurrent — injecte du bruit
- Oublier le cleanup des sessions de probe — pollue le hub
- Ne pas comparer à la baseline historique si A8 est dispo
