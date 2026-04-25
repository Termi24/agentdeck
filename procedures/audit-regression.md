# Procedure: audit-regression

## Objectif
Tester rapidement (≤ 2 min wall-clock) que tous les bugs précédemment fixés sont restés fixés. Pas de cartographie complète, juste re-jouer la suite versionnée des cas connus.

## Pré-requis
- Tools : `mcp__agentdeck__validate_claims_bulk`, `mcp__agentdeck__sandbox_read`
- Fichier : `_qa/regression-suite.jsonl` (1 cas par ligne, format documenté ci-dessous)

## Format de la regression-suite

Une ligne JSON par cas :
```json
{
  "id": "REG-001",
  "origin": "qa-da2e6f28/F2",
  "desc": "GET /sessions/:id returns non-zero aggregates",
  "setup": [{"method":"POST","url":"<baseUrl>/sessions","body":{"projectId":"default","prompt":"x","bridge":true},"capture":"sid"}],
  "probe": {"method":"GET","url":"<baseUrl>/sessions/{sid}","expectStatus":200,"expectJsonPath":["channelMessageCount",">=",0]},
  "teardown": [{"method":"POST","url":"<baseUrl>/sessions/{sid}/cancel"}],
  "status": "open"
}
```

Le sub-agent doit :
1. Lire la suite
2. Pour chaque cas avec `status:"open"` ou `status:"watching"`, exécuter setup + probe + teardown
3. Mettre à jour la suite avec `lastChecked: <iso>`, `lastResult: 'pass'|'fail'`

## Étapes

1. **Charger la suite**
   ```
   suite = sandbox_read({path:'_qa/regression-suite.jsonl'})
   cases = suite.split('\n').filter(Boolean).map(JSON.parse)
   open_cases = cases.filter(c => c.status === 'open' || c.status === 'watching')
   ```

2. **Construire les claims**
   Concaténer setup + probe pour chaque cas (les `{sid}` placeholders sont résolus avant la batch).
   Pour les cas multi-step (setup + probe), exécuter setups séquentiellement, capturer les valeurs, puis batch les probes.

3. **Exécution batch**
   ```
   results = validate_claims_bulk({claims: probes, parallelism: 4})
   ```
   Parallelism faible parce que les probes touchent des sessions différentes — pas de contention.

4. **Reporting**
   Pour chaque cas : `report_test_result(suite='regression-suite', caseName=case.id, status, evidence={origin, desc, observed})`.

5. **Update suite**
   Réécrire `_qa/regression-suite.jsonl` avec `lastChecked`, `lastResult` mis à jour.

6. **Doc final**
   Publier `regression-report-<date>.md` : `N passing / M failing / K skipped`. Si M > 0, lister les régressions avec leur `origin` (campagne d'origine + bugId) pour audit rapide.

## Format des reports
- suite: `regression-suite`
- caseName: `<REG-NNN>`
- evidence: `{origin, desc, observed_status, observed_body_excerpt?}`

## Critère de done
- 100% des cas `open|watching` exécutés
- ≤ 2 min wall-clock total (sinon le découper en sous-suites par domaine)
- Doc `regression-report-<date>.md` publié

## Anti-patterns
- Re-faire une cartographie complète au lieu d'utiliser la suite — c'est exactement ce que cet auditeur évite
- Supprimer un cas après fix au lieu de le marquer `status:"watching"` (perd la trace de l'historique de régression)
- Dupliquer un cas entre 2 sub-agents — la suite est la source unique de vérité
