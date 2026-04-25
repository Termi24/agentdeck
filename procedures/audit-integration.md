# Procedure: audit-integration

## Objectif
End-to-end : spawn une session SDK réelle qui spawn N sub-agents Task en parallèle, vérifier que chaque event traverse Socket.IO + DB, cancel mid-flight, vérifier que le replay scrubber recrée l'état pré-cancel.

## Pré-requis
- Proxy en up avec `ANTHROPIC_API_KEY`
- Tools : `mcp__agentdeck__validate_claims_bulk`, `mcp__agentdeck__browser_*`
- Patience : 3-5 min wall-clock par run (la SDK prend du temps)

## Étapes

1. **Spawn SDK session avec fanout**
   ```
   POST /sessions {
     projectId, bridge:false,
     prompt: "Use the Task tool to spawn 2 sub-agents in parallel:
              one lists 3 fruits, the other lists 3 vegetables.
              Then summarise both outputs."
   }
   ```

2. **Pendant l'exécution — verify event stream**
   - `validate_claim GET /sessions/:id/agents` : count grandit jusqu'à ≥ 3 (root + 2 children)
   - `validate_claim GET /sessions/:id/tool-calls` : count grandit
   - Optionnel browser_navigate pour voir le hub en live

3. **Cancel mid-flight**
   Une fois le 1er sub-agent en cours (≥ 1 message.delta event) :
   ```
   POST /sessions/:id/cancel
   ```
   Doit retourner 204 immédiat.

4. **Vérifier post-cancel**
   - GET /sessions/:id : `status='cancelled'`, `endedAt` ISO Z
   - GET /sessions/:id/agents : tous les agents en status `completed|failed|cancelled` avec `endedAt` non-null
   - `agentCount`, `toolCallCount`, `lastActivityAt` non-null
   - Aggregates DB ↔ events fold doivent matcher (via sandbox_exec sqlite3)

5. **Replay scrubber consistency**
   - browser_navigate /sessions/:id
   - Driver le scrubber à `scrubIndex=max` : doit afficher les mêmes counts que GET /sessions/:id
   - À `scrubIndex=0` : counts à 0 (état initial)

6. **Capture evidence**
   - 2 screenshots (dashboard cancelled + dockview cancelled)

## Format des reports
- suite: `integration-e2e`
- caseName: par étape (`sdk-session-spawned`, `sub-agents-parallel-attribution`, `cancel-mid-flight`, `aggregates-match-events`, `replay-scrubber-consistency`)
- evidence: `{session_id, agent_count, tool_call_count, status, screenshot_id?}`

## Critère de done
- 5 cases reportées
- Au moins 1 cancel exécuté avec succès
- Doc `11-integration-e2e.md` publié

## Anti-patterns
- Ne pas mettre de timeout dur (5 min) → l'audit se bloque indéfiniment si la SDK est lente
- Cancel trop tôt (avant le 1er sub-agent message) → on ne teste pas le mid-flight, juste un kill
- Cancel trop tard (après completion) → cancel ne fait rien, audit invalide
