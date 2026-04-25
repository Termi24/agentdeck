# Procedure: audit-rest

## Objectif
Auditer toutes les routes Fastify du proxy avec 1 happy path + 1 sad path par route. Détecter régressions de schéma, codes d'erreur incohérents, payloads non-ISO, contraintes FK leakées en 500.

## Pré-requis
- Proxy en up sur `baseUrl` (ex: http://127.0.0.1:4317)
- Tools : `mcp__agentdeck__api_inventory`, `mcp__agentdeck__validate_claims_bulk`
- Une session de probe (peut être créée à la volée avec `bridge:true`)

## Étapes

1. **Cartographie**
   ```
   inventory = api_inventory({framework:'fastify', rootPath:'G:/agentdeck/packages/proxy/src', selfCheck:{baseUrl}})
   ```
   Doit retourner ≥ 60 routes, 0 phantom (`/path` ou `/...`).

2. **Construction de la matrice**
   Pour chaque route :
   - happy = payload valide minimal (ex: GET sans args, POST avec corps zod-valide)
   - sad = au moins 1 sur ces classes : 400 (zod fail), 404 (id inconnu), 405 (méthode), 401/403 si auth attendue, 500 (FK violation déclenchée volontairement)
   - skipper happy pour les routes destructives globales (`/sessions/:id/cancel` au-dessus de la session de probe)

3. **Exécution batch**
   ```
   results = validate_claims_bulk({claims, parallelism:8})
   ```
   Une seule call MCP, max 100 claims par batch.

4. **Reporting**
   Pour chaque result : `report_test_result(suite='rest-coverage', caseName='<METHOD> <path>', status, evidence={status, sampleBody, mismatches})`.
   Publier `02-coverage-positive.md` + `03-coverage-negative.md` (tables markdown).

5. **Cross-check phantom routes**
   Comparer `inventory.routes.length` au compte attendu (≥ 60). Tagger BUG-INV-001 si > 5 entrées avec path `/path`, `/...`, ou path qui ne matche pas une route déclarée.

## Format des reports
- suite: `rest-coverage`
- caseName: `<METHOD> <path>` (ex: `POST /sessions/:id/channel`)
- evidence: `{status: <number>, sampleBody: <string|null, max 500 chars>, mismatches: <string[]>, retries: <number>}`

## Critère de done
- ≥ 1 probe par route déclarée
- 0 route phantom dans l'inventaire
- Au moins 1 publish_doc par fichier (positif + négatif)
- Channel summary posté avec compte `passed/failed/skipped`

## Anti-patterns
- Lancer 67 `validate_claim` en série (utiliser `validate_claims_bulk`)
- Inventer la matrice sans `api_inventory` (oubli garanti)
- Skipper les sad paths "trop coûteux" — ils trouvent les vrais bugs
