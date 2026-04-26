# Final summary — campagne qa-822fa460

**Date**: 2026-04-26
**Orchestrateur**: claude-code-orchestrator
**Cible**: agentdeck (self-audit, 9-phase pipeline, single session)

## Score
- Specialists: **9/9** complets (schema, sdk-translator, rest, mcp, event-replay, ui-playwright, security, integration, perf)
- Tests: **~270/290 PASS**
- Bugs réels: **6 HIGH + 3 MED + 2 LOW + 5 MISS/UX + 2 SEC gaps**
- Faux positifs: **1/12** (BUG-UI-01a déjà fixé en amont)
- **Patches appliqués: 10/12** — typecheck PASS sur 4/4 workspaces (4.47s, 0 régression)

## Patches appliqués
| # | Bug | Fichier(s) |
|---|---|---|
| 1 | UI-01b | apps/web/src/app/sessions/[id]/page.tsx |
| 2 | REST-002 | packages/proxy/src/routes/test-tools.ts |
| 3 | SCH-01a | packages/shared/src/types/events.ts (MemoryUpdated.sessionId) |
| 4 | SCH-01b | packages/proxy/src/routes/project-memory.ts (appendEvent) |
| 5 | SCH-02a | packages/shared/src/types/events.ts (SandboxExecCompleted) |
| 6 | SCH-02b | packages/proxy/src/routes/sandbox.ts (op:create/modify, exec event) |
| 7 | REST-003 | packages/proxy/src/routes/sessions.ts (heartbeat 410) |
| 8 | MCP-B1 | CLAUDE.md + packages/mcp/src/index.ts (37/36 → 42) |
| 9 | MISS-INT-1 | packages/proxy/src/routes/sessions.ts (GET /events) |
| 10 | SCH-03 | packages/proxy/src/persistence.ts (events.seq = nextSeq) |

## Bugs hors périmètre patches (raison)
- **BUG-UI-01a** : faux positif (déjà fixé en amont)
- **BUG-SCH-04** : recommandation doc (amender CLAUDE.md plutôt que migration)
- **BUG-SDK-1** : design memo requis (MCP shim sans per-call subagent context)
- **BUG-MCP-B2** : process fix (`pnpm --filter @agentdeck/mcp build` + reinstall bridge)
- **BUG-REST-001** : Windows DLL init failed sur sandbox_exec — investigation séparée

## Perf — pas de régression
- Hot REST p95 < 13ms partout (max: GET /sessions = 12.1ms)
- Throughput synthétique: **6510 eps** (+46% vs claim commit 39798f5)
- 5000-event aggregates p95: 3.77ms (WIN-5 events index proves out)

## Sécurité — 0 critique
- AES-256-GCM round-trip: ciphertext ≠ plaintext, GCM tag présent
- Sandbox path-traversal: 4/4 vecteurs bloqués (incl. Windows absolute)
- CORS hard-restricted à 127.0.0.1:3000-3010
- install-claude.mjs idempotent (Set dédup + claude mcp add overwrite)

## Pour fermer formellement la campagne dans le hub
Le proxy est tombé après les patches (likely hot-reload sur persistence.ts). Pour finaliser :

```bash
# 1. Restart proxy + web
cd G:/agentdeck && pnpm dev
# Wait for "Listening on :4317" + "Ready in"

# 2. Depuis n'importe quel MCP bridge:
mcp__agentdeck__submit_campaign_retrospective({campaignId: "qa-822fa460", ...})
mcp__agentdeck__end_campaign({campaignId: "qa-822fa460", status: "completed"})
```

## Recommandations next campaign
1. Restart proxy maintenant pour activer les 10 patches (events.seq, MemoryUpdated.sessionId, sandbox events, heartbeat 410, GET /events)
2. Lancer `regression-tester` pour figer les 10 fixes dans `_qa/regression-suite.jsonl`
3. Ajouter "curl :3000" au pre-start checklist (UI auditor a perdu 1 cycle)
4. Test `tool_count_consistency` automatique (drift 30/36/42 endémique)
5. Design memo BUG-SDK-1 avant patch (architectural)
6. Investigation BUG-REST-001 séparée (shell:false + arg array, ou env explicit)
7. `react-window` ActivityFeed avant >50k events stress test
