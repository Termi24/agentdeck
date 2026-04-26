# Design memo — BUG-SDK-1 : sub-agent attribution dans le shim MCP

**Status** : Forward-compat patch shipped in v0.0.8 (proxy mode only). Bridge mode still open — see §Gaps.
**Origin** : `audit/12-final-summary.md` recommandation #5 ; `audit/patches/bug-6-SDK-1.md` (PATCH-BLOCKED)
**Author** : claude-code 2026-04-26
**Vault mirror** : [[01-Projects/agentdeck/02-Architecture/ADRs/ADR-003-sub-agent-attribution]]

## Patch shipped (v0.0.8)

Forward-compatible option (b') landed:

- **MCP shim** (`packages/mcp/src/index.ts` + `proxy-client.ts`) extracts `_meta.toolUseId` (and `_meta.tool_use_id` as a snake_case fallback) from each `CallToolRequest` and forwards it via the `X-Agent-Tool-Use-Id` header on every proxy HTTP shim call. Setting `AGENTDECK_LOG_META=1` logs every `_meta` received in stderr — turns the running MCP into a permanent empirical probe so we'll know in the wild whether Anthropic SDK populates `toolUseId` without re-instrumenting.
- **Proxy translator registry** (`packages/proxy/src/services/multi-agent-registry.ts`) holds the `MultiAgentContext` (with its `toolUseOwner` and `taskToolUseToChild` maps) for every proxy-hosted SDK session. `runSession()` registers/unregisters in matching `try/finally`-equivalent boundaries.
- **Attribution middleware** (`packages/proxy/src/services/sdk-attribution.ts`) Fastify `preHandler` reads the header, queries `getToolUseOwner(sessionId, toolUseId)`, and rewrites the body's agent-attribution field on 7 routes: channel, dm, docs, sandbox/exec, test-results, agents (parentAgentId — fixes spawn_agent flattening), agent-cancel.
- **Regression entries** REG-016 (channel attribution) and REG-017 (spawn_agent hierarchy) added to `_qa/regression-suite.jsonl`.

The patch is **no-op when the header is absent** (current bridge behavior preserved) and **no-op when the registry is empty** (bridge sessions remain unaddressed — see §Gaps below). Zero regression risk on the existing happy paths; activate the new behavior only when the SDK starts shipping `_meta.toolUseId` (or with a future bridge-side workaround).

## Gaps still open

1. **Bridge mode**: Claude CLI / external orchestrators run the SDK out-of-process; the proxy never sees the tool_use stream and the registry stays empty. The middleware no-ops, sub-agents continue to attribute to the root agent. Future fix: a new MCP tool `attribute_tool_use({toolUseId, agentId})` that the bridge SDK calls just before each tool_use, populating a side map keyed by `(sessionId, toolUseId)`. Out of scope for v0.0.8.
2. **Empirical confirmation that `_meta.toolUseId` is populated by the Anthropic SDK**: the patch is forward-compatible but unverified. `AGENTDECK_LOG_META=1` provides the probe; first SDK session run with this env should answer it. If negative, options (b) UPDATE-after or option (a) SDK extension become the path forward.
3. **project_memory + browser screenshots**: not in `ROUTE_RULES` because the URL doesn't carry a sessionId. A future patch can pass `X-Agent-Session-Id` from the shim alongside the tool_use header.

## TL;DR

Un sub-agent qui appelle `mcp__agentdeck__post_to_channel` est **enregistré dans la DB sous l'identité du root agent**. Idem pour DM, docs, sandbox-write, test-result, memory, browser-screenshot, request-agent-cancel, et même `spawn_agent.parentAgentId` qui sera toujours le root au lieu du sub-agent appelant. **L'AgentTree de la dashboard ment dès qu'un sub-agent émet du contenu**.

Trois options ont déjà été tracées dans `bug-6-SDK-1.md`. Ce memo creuse, recommande **option (b') v2** (header `X-Tool-Use-Id` + résolution côté proxy via le `toolUseOwner` du translator), et fournit un patch sketch sandbox-only pour validation Amine.

## 1. Étendue exacte du bug

`packages/mcp/src/proxy-client.ts` reçoit `AGENTDECK_AGENT_ID` **une fois au startup** = le root agent du bridge. Tout shim HTTP réutilise `this.agentId` via `requireAgent()`. Routes affectées :

| Méthode shim | Route HTTP | Champ écrit côté DB | Conséquence dashboard |
|---|---|---|---|
| `postChannel` | `POST /sessions/:id/channel` | `channel_messages.from_agent_id` | Channel feed du sub-agent disparaît, attribué au root |
| `sendDirect` | `POST /sessions/:id/dm` | `direct_messages.from_agent_id` | DM feed entre sub-agents impossible (tous viennent du root) |
| `publishDoc` | `POST /sessions/:id/docs` | `docs.updated_by_agent_id` | Tab "Docs" attribue les writes au root |
| `sandboxWrite` | `POST /sessions/:id/sandbox/write` | event `sandbox.file.changed` (no agent_id column) | OK actuellement (pas d'attribution agent côté file row), mais event lacks agent context |
| `sandboxExec` | `POST /sessions/:id/sandbox/exec` | `exec_runs.agent_id` | Run attribué au root, perte de la causalité par sub-agent |
| `reportTestResult` | `POST /sessions/:id/test-results` | `test_results.agent_id` | Tab "Tests" : impossible de filtrer par persona |
| `memoryWrite` | `POST /projects/:p/memory/:key` | `project_memory.updated_by_agent_id` | Trace de qui a écrit la note perdue |
| `requestAgentCancel` | `POST /sessions/:id/agents/:aid/cancel` | `agent_cancel_requests.requested_by_agent_id` | Audit log "qui a annulé qui" cassé |
| `browserNavigate/Click/…` | `POST /sessions/:id/browser/*` | divers (per-agent context) | **Indirectement OK** car le code accepte `agentId` dans body et le shim le passe — voir §2 |
| `spawnAgent` | `POST /sessions/:id/agents` | `agents.parent_agent_id` | Sub-agent qui spawn fait toujours un enfant du root au lieu d'un grand-enfant |

**Total : 8 routes attribuent mal + 1 effet de bord sur la hiérarchie d'agents.**

### 1.1 Pourquoi `browser_*` est moins cassé

Le shim browser passe `agentId: this.requireAgent()` mais expose aussi `browserNewContext({agentId, reset})` en argument explicite. Si l'orchestrateur appelle `browser_new_context({agentId: 'sub-1'})` AVANT toute action UI, les outils suivants utilisent ce context isolé. **Mais** le `agentId` du body reste celui passé par le shim (= root) tant qu'on n'override pas explicitement chaque call. C'est partiellement masqué par le fait que les routes browser stockent leurs résultats dans `browser_screenshots.agent_id` qui peut être null.

### 1.2 Pourquoi `spawn_agent.parentAgentId` est cassé

```ts
parentAgentId: input.parentAgentId === undefined ? this.agentId : input.parentAgentId,
```

`this.agentId` est le root. Si un sub-agent appelle `spawn_agent({name: 'grandchild'})` sans `parentAgentId`, le grandchild est inséré comme enfant **du root**, pas du sub-agent appelant. La hiérarchie est aplatie silencieusement.

## 2. Trois options réexaminées

### Option (a) — extension SDK : hook `tool_use_id` natif

Le SDK Anthropic injecterait `_meta.tool_use_id` dans le `CallToolRequest` du MCP. Le shim le lirait, le passerait en body. Le proxy mapperait via `toolUseOwner`.

**Pros** : architecture propre.
**Cons** : demande modification de `@anthropic-ai/claude-agent-sdk` ou de la spec MCP. **Hors scope court terme**.

### Option (b) — translator post-processing + UPDATE différé

Le translator écoute le `tool_use` du SDK : pour `mcp__agentdeck__post_to_channel` / `sendDirect` / `publishDoc` / etc., il enregistre `pendingMcpAttribution[tool_use_id] = realAgentId`. Le shim HTTP s'exécute normalement (écrit avec `from_agent_id = root`). Le translator écoute le `tool_result` : il parse le content (qui contient `{messageId: M}`) → `UPDATE channel_messages SET from_agent_id = realAgentId WHERE id = M`.

**Pros** : aucun changement SDK, aucun changement shim MCP. Compatible.
**Cons** : 
- **Race condition** : entre l'INSERT (au moment du HTTP) et l'UPDATE (au moment du tool_result), la dashboard servie via Socket.IO **voit le row attribué au root** pendant typiquement 100-2000 ms. UI flicker.
- **Fragile parsing** : il faut extraire `messageId` / `docId` / `resultId` / etc. du tool_result content (qui est une chaîne JSON stringifiée par le shim, possiblement entourée de prose). Si le format change, le parser casse silencieusement.
- **8 chemins UPDATE différents** à maintenir, un par route.
- Side table `pendingMcpAttribution` qui doit être nettoyée correctement (memory leak si on oublie un tool_result).

**Estimation** : ~140 LOC dans `sdk-translator.ts` + 1 nouvelle helper UPDATE par route × 8 = ~80 LOC supplémentaires en `persistence.ts`. **Total : ~220 LOC**.

### Option (b') — header `X-Tool-Use-Id` + résolution côté proxy (RECOMMANDÉ)

Variante propre de (b) qui élimine la race + le parsing fragile.

**Mécanisme** :

1. Le SDK Anthropic invoque le MCP server avec un `CallToolRequest`. Vérifier que `request.params._meta?.toolUseId` est exposé (specs MCP 2024-11-05+ et le SDK Anthropic le passent — à confirmer par un probe test).
2. Si oui, le shim MCP lit `_meta.toolUseId` dans `CallToolRequest` et l'inscrit dans le header `X-Agent-Tool-Use-Id` de chaque call HTTP au proxy.
3. Le proxy expose un middleware Fastify qui :
   - Lit `X-Agent-Tool-Use-Id` du header
   - Cherche dans le `toolUseOwner` map du translator (déjà populé par les events SDK)
   - Si trouvé, **substitue le `fromAgentId` du body** par `toolUseOwner[X-Agent-Tool-Use-Id]` AVANT l'INSERT.
4. Si `_meta.toolUseId` n'est pas exposé par le SDK, fallback sur option (b) post-UPDATE.

**Pros** :
- Pas de race : l'INSERT a déjà la bonne attribution.
- Pas de parsing du tool_result.
- Middleware unique pour les 8 routes (pas de duplication).
- Le shim MCP ne change pas son contrat (il continue à passer `fromAgentId: rootAgent` en body, le middleware override).

**Cons** :
- Dépend de `_meta.toolUseId` côté MCP — à valider par probe.
- Ajoute un point de mutation côté serveur (le body HTTP n'est plus authoritative pour `fromAgentId`).
- Le `toolUseOwner` map peut ne pas être encore populé quand le HTTP arrive (race contraire à (b)). Mitigation : le `tool_use` event SDK arrive AVANT que le SDK invoque le tool → arrive AVANT le HTTP. Ordre garanti par construction.

**Estimation** : ~60 LOC translator (exposer le map en query helper) + ~40 LOC nouveau middleware Fastify + ~20 LOC dans le shim MCP pour lire `_meta`. **Total : ~120 LOC**.

### Option (c) — MCP route handlers consument déjà `fromAgentId` body, le SDK l'injecte via Task

Le MCP route handlers acceptent déjà `fromAgentId` en body. Si le SDK pouvait inject ce field via un mécanisme propre au moment du Task tool dispatch, le shim n'aurait rien à faire.

**Cons** : le SDK Anthropic n'expose pas de hook pour modifier les arguments d'un MCP tool call avant qu'il sorte. Donc égal à option (a) en pratique.

## 3. Recommandation

**Implémenter option (b')** avec un **probe préalable** pour confirmer `_meta.toolUseId` :

### Phase 0 — probe (1 jour)

Écrire un mini test dans `packages/mcp/src/handlers/` qui logge tout `request.params._meta` reçu sur n'importe quel CallToolRequest. Lancer une session SDK avec un sub-agent + 1 channel post. Vérifier ce qu'on reçoit dans `_meta`.

**Si `_meta.toolUseId` est présent** : option (b') marche. Procéder à phase 1.
**Si absent** : fallback option (b) avec UPDATE différé. Plus fragile mais possible.

### Phase 1 — implementation option (b') (2-3 jours)

1. **Translator** : ajouter `getOwnerByToolUseId(id: string): string | null` qui exporte un view read-only du `toolUseOwner` map.
2. **Proxy middleware** : ajouter `attributionMiddleware` qui pré-traite tout `POST /sessions/:id/{channel,dm,docs,sandbox/exec,test-results,sandbox/write,browser/screenshot}` et `POST /projects/:p/memory/:key` :
   - Lit `X-Agent-Tool-Use-Id`
   - Si trouvé et `getOwnerByToolUseId(id) !== null`, override `request.body.fromAgentId` / `byAgentId` / `agentId` / `updatedByAgentId` selon la route.
3. **MCP shim** : modifier `proxy-client.ts:request()` pour accepter un `toolUseId` optionnel et le passer en header. Le `index.ts` extrait `_meta.toolUseId` du `CallToolRequest` et le forwarde.
4. **`spawn_agent.parentAgentId`** : cas spécial — le shim n'a pas de tool_use_id du parent au moment où il forge le request. Stratégie : le proxy applique le même middleware sur `POST /sessions/:id/agents` et override `parentAgentId` avec `getOwnerByToolUseId(X-Agent-Tool-Use-Id)`.
5. **Tests** : ajouter REG-016 et REG-017 dans `_qa/regression-suite.jsonl` (channel post depuis sub-agent → from_agent_id != root ; spawn_agent depuis sub-agent → parent_agent_id == sub-agent).

### Phase 2 — clean-up (0.5 jour)

Mettre à jour `02-Architecture/Critical-Invariants.md` avec un nouveau invariant 11 décrivant le mécanisme.

## 4. Patch sketch (NON-applied)

Patch draft à `sandbox/audit/patches-sdk-1/` (à créer après GO Amine). Vu la complexité (8 routes + middleware + translator export + shim header + spawn_agent edge case), **séparer en 4 patches** :

- `sdk-1a-translator-export.diff` : expose `getOwnerByToolUseId`
- `sdk-1b-proxy-middleware.diff` : nouveau `attributionMiddleware`
- `sdk-1c-mcp-shim-header.diff` : pass `_meta.toolUseId` en header
- `sdk-1d-spawn-agent-fix.diff` : middleware appliqué à `POST /sessions/:id/agents`

Chacun applique-able indépendamment, chacun avec son test REG associé.

## 5. Décisions à prendre

1. **GO probe `_meta.toolUseId`** ? (1 jour solo dev)
2. Si probe positif : **GO implementation phase 1** ? (2-3 jours)
3. Si probe négatif : **GO option (b) UPDATE différé** ? (~3 jours, plus fragile)
4. **Inclure le fix `spawn_agent.parentAgentId`** dans le même patch ou différer en sdk-1.5 ? (recommandation : même patch, c'est le même bug)

## 6. Risques & mitigation

| Risque | Mitigation |
|---|---|
| `_meta.toolUseId` n'est pas standard MCP | Phase 0 probe avant tout investissement |
| Race tool_use event vs HTTP : le map n'est pas populé à temps | Wait-for max 100 ms côté middleware. Sinon fallback `fromAgentId` du body (= root) avec un log warn |
| Sub-agent legitimately wants to post sous une autre identité | Conserver `fromAgentId` du body comme override possible : si `body.fromAgentId !== rootAgent`, faire confiance au body (current behavior) |
| Schemas REST cassés downstream (ex. clients qui parsent la réponse) | Aucun changement de réponse, juste du body input. Pas de breaking change. |
| `request_agent_cancel.requestedByAgentId` middleware override casse les cancellations programmatiques (orchestrateur cancel un sub-agent) | Whitelist : ne pas appliquer le middleware sur cette route (le `requestedByAgentId` du body est généralement explicit dans ce cas) |

## Liens

- `audit/patches/bug-6-SDK-1.md` — précédente analyse PATCH-BLOCKED
- `audit/12-final-summary.md` recommandation #5
- [[01-Projects/agentdeck/02-Architecture/Critical-Invariants#1. SDK event translator — trois maps obligatoires|invariant 1]] — `toolUseOwner` map déjà existante
- `packages/proxy/src/sdk-translator.ts` — où ajouter `getOwnerByToolUseId`
- `packages/mcp/src/proxy-client.ts` — où injecter le header
- MCP spec `_meta` : https://spec.modelcontextprotocol.io/specification/server/tools/

## Verdict requis

> **Amine, GO / NO-GO sur la phase 0 (probe `_meta.toolUseId`) ?**
> 
> Coût phase 0 : 1 jour solo dev (probe + recommandation phase 1 ou (b)).
> Pas de modification du code production avant ton GO sur le résultat de la phase 0.
