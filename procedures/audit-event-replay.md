# Procedure: audit-event-replay

## Objectif
Vérifier l'invariant event-sourcing : pour chaque domaine (channel, docs, test-results, agents), le compte REST doit égaler le `fold(events)` correspondant. Vérifier aussi le replay scrubber : à `scrubIndex=N`, les counts doivent matcher `events[0..N]`.

## Pré-requis
- Tools : `mcp__agentdeck__validate_claims_bulk`, accès direct à `data/agentdeck.db` via `sandbox_exec` + better-sqlite3
- Une session de probe avec activité variée (≥ 5 channel posts, 2 docs, 1 test result, 2 agents spawned + 1 stopped)

## Étapes

1. **Spawn probe session + activité**
   ```
   sid = POST /sessions {bridge:true, ...}
   POST /agents × 2; POST /agents/:id/stop sur le 2e
   POST /channel × 5; POST /docs × 2; POST /test-results × 1
   ```

2. **Comparaison REST count vs events fold**
   Pour chaque domaine :
   | Domain         | REST                          | Events fold                                |
   |----------------|-------------------------------|--------------------------------------------|
   | channel        | GET /channel `.length`        | count `type='channel.message.posted'`      |
   | docs           | GET /docs `.length`           | count `type='doc.published'`               |
   | test-results   | GET /test-results `.length`   | count `type='test.result.reported'`        |
   | agents         | GET /agents (status counts)   | `agent.spawned - agent.stopped` per status |

3. **Lecture events fold**
   Via `sandbox_exec node -e "..."` qui ouvre `data/agentdeck.db` en readonly et fait `SELECT type, count(*) FROM events WHERE session_id = ? GROUP BY type`.

4. **Aggregate sanity**
   ```
   GET /sessions/:id
   ```
   Tous les counts doivent être **non-zero** et `lastActivityAt` ISO 8601 avec trailing Z.

5. **Replay scrubber**
   Truncate events à différents `N` (0, mid, max) et vérifier que les counts du fold correspondent. Pas besoin de browser — le truncation peut se simuler côté DB.

## Format des reports
- suite: `event-replay`
- caseName: `<domain>: events.fold == REST.count` (ex: `channel: events.fold == REST.count`)
- evidence: `{rest_count, events_fold, delta, session_id}`

## Critère de done
- ≥ 4 domaines comparés
- 1 cas par scrubber position (min/mid/max)
- Doc `06-event-replay.md` publié

## Anti-patterns
- Faire confiance à `GET /sessions/:id` aggregates sans valider contre la DB (BUG-AGGREGATE est arrivé exactement par cette route)
- Compter les events via Socket.IO replay sans vérifier la table SQLite (le bus peut diverger)
