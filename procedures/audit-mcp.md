# Procedure: audit-mcp

## Objectif
Exercer chaque tool `mcp__agentdeck__*` au moins une fois et vérifier sa side-effect. Garantir 100% couverture du surface MCP : pas de tool documenté-mais-cassé.

## Pré-requis
- Tools : `mcp__agentdeck__mcp_tools_inventory` + tous les tools `mcp__agentdeck__*` à tester
- Une session de probe (la session courante du sub-agent suffit)

## Étapes

1. **Cartographie**
   ```
   tools = mcp_tools_inventory({rootPath:'G:/agentdeck/packages/mcp/src/tools.ts'})
   ```
   Asserts : `tools.tools.length >= 36`.

2. **Pour chaque tool**
   - Construire le payload minimal valide (champs requis seulement)
   - Invoquer le tool
   - Vérifier la side-effect via :
     - Soit un follow-up MCP (ex: `sandbox_write` puis `sandbox_read`)
     - Soit `validate_claim` HTTP contre le proxy (ex: `publish_doc` puis GET /docs)
     - Soit le retour direct (ex: `read_methodology` retourne du contenu non-vide)

3. **Cas particuliers**
   - `await_user_input` : tester avec `timeoutMs: 3000` et vérifier qu'il retourne timeout, ne hang pas
   - `request_agent_cancel` avec un faux UUID : doit retourner 404
   - `browser_*` : créer un context isolé d'abord (`browser_new_context({reset:true})`), puis disposer (`browser_dispose_context`) à la fin
   - `secrets_get` avec un nom inexistant : 404 attendu (skip le PASS, comptage SKIP)

## Format des reports
- suite: `mcp-coverage`
- caseName: `mcp:<tool_name>` (ex: `mcp:validate_claim`)
- evidence: `{response_shape_ok, side_effect_verified, notes?}`
- status: `passed` | `skipped` (pour cas requiring a missing fixture) | `failed`

## Critère de done
- ≥ 36 tools exercés
- Doc `07-mcp-tool-coverage.md` publié avec table tool × invoked × side-effect-verified
- Channel summary

## Anti-patterns
- Skipper un tool parce que son use-case est "obvious" — c'est exactement ce qui couvre les régressions silencieuses
- Tester un tool browser sans `browser_new_context({reset:true})` d'abord — risque contamination cross-persona
