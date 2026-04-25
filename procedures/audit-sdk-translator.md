# Procedure: audit-sdk-translator

## Objectif
Vérifier les 3 maps de `packages/proxy/src/sdk-translator.ts` (`taskIdToAgentId`, `toolUseOwner`, `taskToolUseToChild`) sur une session SDK réelle qui spawn au moins 1 sub-agent Task.

## Pré-requis
- Proxy avec `ANTHROPIC_API_KEY` configuré (sinon SKIP propre)
- Tools : `mcp__agentdeck__validate_claims_bulk`, `mcp__agentdeck__sandbox_exec`
- Lecture : `packages/proxy/src/sdk-translator.ts`

## Étapes

1. **Spawn une session SDK probe**
   ```
   POST /sessions {projectId, prompt:"Use the Task tool to spawn 1 sub-agent that lists 3 fruits then exits", bridge:false}
   ```
   Wait completion (≤ 60 s).

2. **Vérifier les 4 invariants translator**
   - **I1** : Le `Task` tool_use call est attribué au root agent (`tool_calls[*].agentId == rootAgentId where toolName='Task'`).
   - **I2** : Le sub-agent a son propre tool_calls (les inner calls qu'il a faits) — pas attribué au root.
   - **I3** : Les events `agent.message.delta` du sub-agent + `agent.stopped` sont émis sur l'agentId du sub-agent (pas du root).
   - **I4** : Pour les tool_results de tools NON-Task, le `agentId` du result event matche l'agentId qui a émis le tool_use.start.

3. **Vérification via REST**
   ```
   GET /sessions/:id/tool-calls
   GET /sessions/:id/agents
   ```
   et lecture directe des events via sandbox_exec sqlite3.

## Format des reports
- suite: `sdk-translator`
- caseName: une par invariant (`orchestrator-task-call-attributed-to-root`, `subagent-has-own-tool-calls`, `subagent-message-delta-and-stopped-events-present`, `tool-results-route-to-emitter`)
- evidence: `{event_seq, agentId, toolUseId, toolName?}`

## Critère de done
- 4 invariants reportés
- Doc `05-translator-audit.md` publié avec un tableau seq × event_type × agentId attribué

## Anti-patterns
- Tester sur une session bridge (le translator n'est pas exercé en bridge mode)
- Bloquer indéfiniment si la SDK refuse — timeout dur à 120 s, SKIP si nécessaire
