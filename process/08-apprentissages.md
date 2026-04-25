# 08 — Apprentissages, lessons learned, anti-patterns

> Capitalisation des leçons apprises au fil des campagnes de test sur eyeot. Mis à jour à chaque retex significatif.

---

## 1. Frictions techniques majeures rencontrées

### 1.1 Browser context partagé entre sub-agents (faux positifs en série)

**Symptôme** : 3 sub-agents Playwright lancés en parallèle, chacun se loguant avec un persona différent. Au bout de ~30 secondes, **tous se retrouvent logués comme le même persona** (le dernier qui s'est connecté).

**Cause technique** : 
- Cookie HttpOnly `refresh_token` partagé entre tous les onglets/sessions
- `localStorage` Zustand persist (auth-store) partagé
- Autofill navigateur Chromium sur le formulaire login

**Conséquence** : 60% des rapports sub-agents commençaient par "Identité ≠ attendue, STOP protocole". Beaucoup de **faux bugs** rapportés alors qu'il s'agissait d'un email autofill stale.

**Mitigation court terme** :
- Lancer les sub-agents **séquentiellement**, pas en parallèle.
- Avant chaque login, exécuter :
  ```javascript
  localStorage.clear();
  sessionStorage.clear();
  document.cookie.split(';').forEach(c => 
    document.cookie = c.split('=')[0] + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
  );
  ```
- Patch backend `/auth/logout-all-sessions` ajouté pour invalider tous les refresh_token côté serveur.

**Mitigation cible** : architecture **context-per-agent** dans le BrowserManager (un `BrowserContext` Playwright distinct par `agent_id`, isolation totale cookies/localStorage/cache). Cf. `G:\agentdeck\procedures\METHODOLOGY-REVIEW.md` §2.1.

**Coût** : ~3 jours de temps perdu sur la semaine IndusForge avant de comprendre la cause.

### 1.2 SSE qui empêche `networkidle`

**Symptôme** : un test E2E sur une page avec notifications SSE attend indéfiniment sur `await page.waitForLoadState('networkidle')`.

**Cause** : la connexion SSE reste ouverte → `networkidle` n'est jamais atteint.

**Mitigation** : NE JAMAIS utiliser `networkidle` sur les pages eyeot. Préférer :
```typescript
await page.locator('h1:has-text("Service IT")').waitFor({ state: 'visible' });
await page.waitForLoadState('domcontentloaded');
```

### 1.3 Cookie banner RGPD bloque les clics

**Symptôme** : un clic sur un bouton ne fait rien, sans erreur visible.

**Cause** : le cookie banner RGPD est présent, intercepte les clics.

**Mitigation** : `beforeEach` qui dismiss le banner :
```typescript
await page.goto('/');
await page.click('button:has-text("Tout accepter")', { timeout: 2000 }).catch(() => {});
```

**Anecdote** : irritant IRR-008 de la semaine IndusForge (tour guidé bloque le cookie banner). Risque conformité RGPD.

### 1.4 Rate-limit `/auth/login` agressif et trompeur

**Symptôme** : 8 logins consécutifs depuis la même IP en 30s → 429 même pour les credentials corrects.

**Cause** : Flask-Limiter avec un bucket commun pour `/auth/login`, sans distinction succès/échec.

**Mitigation** :
```python
def login(session, persona):
    for attempt in range(5):
        r = session.http.post(...)
        if r.status_code == 429:
            wait = 15 * (attempt + 1)
            time.sleep(wait)
            continue
        return r
```

**Anecdote** : irritant IRR-001. Tous les tests parallèles tombaient dans le bucket. Faux bugs "login impossible" rapportés.

### 1.5 Rate-limit cluster sur les mutations admin

**Symptôme** : un admin essaye de créer 50 catégories en 5 minutes → 429 après ~6 mutations.

**Cause** : `Flask-Limiter` plan starter `60/minute` partagé, agressif pour un admin.

**Mitigation** : différencier les buckets admin / user, exposer le header `X-RateLimit-Remaining`.

**Anecdote** : BUG-IT-001 du test exhaustif IT 2026-04-24.

### 1.6 Bugs spécifiques à un état d'org (seeds manquants)

**Symptôme** : un endpoint POST retourne 500 sur l'org A mais 201 sur l'org B.

**Cause** : la logique métier dépend d'un seed (catégorie default, SLA policy default, site default) qui existe sur B mais pas sur A.

**Mitigation** : 
1. **Toujours tester sur 2 orgs minimum** (compte primaire + IndusForge) pour distinguer bug code vs bug état.
2. Garantir que `provisioning_service.create_organization()` joue **tous les seeds nécessaires** (pas juste les seeds RBAC).

**Anecdote** : le test #1 du module IT (compte amine sur org `eyeot`) a vu un POST 500 sur tickets. Le test #2 (Amandine sur org `IndusForge`) n'a vu **aucun** 500. Le diagnostic "code cassé" du test #1 était faux ; c'était un état d'org incomplet.

### 1.7 Faux 401 par race condition au montage

**Symptôme** : 12-15 erreurs 401 dans la console à chaque chargement d'une page IT.

**Cause** : un composant React appelle `useQuery` avant que l'axios interceptor n'ait injecté le token (depuis Zustand auth-store).

**Mitigation** : ajouter un guard dans tous les hooks API :
```typescript
useQuery({
  queryKey: ['tickets'],
  queryFn: getTickets,
  enabled: isAuthenticated && !!token,  // <— guard
})
```

**Anecdote** : BUG-IT-008 du test exhaustif IT 2026-04-24. Pollue les logs PostHog (faux 401 enregistrés comme erreurs réelles).

### 1.8 Conventions REST incohérentes (DELETE prend `software_id` au lieu de `installation_id`)

**Symptôme** : un dev front fait POST puis DELETE avec l'`id` retourné → 404. Il doit utiliser un autre champ (`software_id`).

**Cause** : la route handler fait `query.filter_by(software_id=path_param)` au lieu de `id=path_param`. La route `/asset/<asset_id>/software/<software_id>` est sémantiquement ambiguë.

**Mitigation** : 
- Renommer la route en `/asset/<asset_id>/installations/<installation_id>` (clair)
- OU accepter les deux pour compatibilité

**Anecdote** : BUG-IT-006. Confusion REST classique des relations N-N.

### 1.8.5 Zustand `partialize` qui exclut le token = race 401 systémique

**Symptôme observé sur eyeot (Sprint S0, 2026-04-25)** : 8-15 erreurs 401 dans la console à chaque navigation/reload de page authentifiée. React Query retry storm → consomme le rate-limit en <1s → 429 cascade.

**Cause racine** : le store auth Zustand utilise `persist` avec `partialize` qui exclut **explicitement** `accessToken` du localStorage avec le commentaire "kept in memory only" :

```typescript
persist(storeImpl, {
  name: 'eyeot-auth',
  partialize: (state) => ({
    user: state.user,
    permissions: state.permissions,
    isAuthenticated: state.isAuthenticated,  // ← rehydrate true
    // accessToken: NOT persisted
  }),
})
```

Après reload :
1. Zustand rehydrate `isAuthenticated=true`
2. `accessToken` reste `null`
3. Tous les hooks `useQuery` du module fire au mount
4. Axios interceptor : `if (!token) return config` → envoie sans `Authorization`
5. Backend → 401
6. Response interceptor déclenche un `/auth/refresh` (cookie httpOnly présent)
7. Retry de chaque requête échouée → 200
8. Mais entretemps : 10+ 401 visibles, 10+ retry → consomme rate-limit → 429

**Pourquoi c'est vicieux** : un fix naïf à `enabled: isAuthenticated` côté React Query ne suffit pas. `isAuthenticated` est `true` immédiatement après rehydrate ; il faut aussi gate sur `!!accessToken`.

**Fix appliqué** (deux niveaux) :

1. **Helper React Query générique** (`frontend/src/hooks/use-authed-query.ts`) :
   ```typescript
   export function useAuthedQuery(options) {
     const isAuthenticated = useAuthStore(s => s.isAuthenticated)
     const hasToken = useAuthStore(s => !!s.accessToken)
     return useQuery({
       ...options,
       enabled: isAuthenticated && hasToken && (options.enabled ?? true),
     })
   }
   ```

2. **Axios request interceptor** (`frontend/src/api/client.ts`) :
   ```typescript
   apiClient.interceptors.request.use(async (config) => {
     let token = useAuthStore.getState().accessToken
     const { isAuthenticated } = useAuthStore.getState()

     // Si rehydraté loggé mais token absent → trigger refresh proactif
     if (!token && isAuthenticated) {
       try {
         token = await ensureFreshToken()
       } catch {
         return config  // laisse passer, response interceptor gère le 401
       }
     }
     // ... reste de l'interceptor
   })
   ```

Le 2e fix couvre **toutes les routes** (notifications, settings, IT, …), pas seulement le module qu'on a migré vers `useAuthedQuery`.

**Anecdote chiffrée** : avant le 2e fix, le re-test prod comptait 8-15 401 + 15-22 retry-storm 429 par chargement de page IT. Après le 2e fix : ≤ 2 401 résiduels (rapport `09-cloture-sprint-S0.md`).

**Leçon transverse** : si un store auth utilise `partialize`, il faut traiter le token comme **une ressource async** (peut être absente après rehydrate, doit être chargée avant d'envoyer une requête). Soit via gate React Query, soit via interceptor proactif. Idéalement les deux.

### 1.9 Validation laissée silencieuse côté backend

**Symptôme** : un POST `licence à 1 siège` puis 2 installations → backend accepte, `used_seats=2/total_seats=1`.

**Cause** : le service `install_software()` ne vérifie pas la saturation. Pas de lock optimiste pour éviter race condition concurrente.

**Mitigation** :
```python
def install_software(license_id, asset_id):
    with db.session.begin_nested():
        license = SoftwareLicense.query.with_for_update().get(license_id)
        if license.used_seats >= license.total_seats:
            raise ConflictError("Saturation licence — sièges insuffisants")
        license.used_seats += 1
        # ... create ITAssetSoftware
```

**Anecdote** : BUG-IT-005. **Risque audit Microsoft/Adobe = sanctions financières.**

### 1.10 PUT non-partial (Marshmallow `partial=False` par défaut)

**Symptôme** : pour modifier un seul champ d'une catégorie, le client doit renvoyer **tout le payload**, sinon 400 "Missing data for required field".

**Cause** : schema Marshmallow réutilisé entre POST et PUT sans `partial=True`.

**Mitigation** :
```python
@categories_bp.put('/<id>')
def update_category(id):
    data = CategorySchema(partial=True).load(request.json)  # <— partial
    ...
```

**Anecdote** : BUG-IT-003. UX dev cassée (pourtant l'API tickets/assets/software fait du partial OK → incohérence interne).

### 1.11 Sortie 400 HTML brute (Werkzeug) au lieu de JSON

**Symptôme** : un POST sans body retourne `400 "The browser (or proxy) sent a request that this server could not understand."` en HTML.

**Cause** : `request.get_json(force=True)` lance une exception non capturée par le error handler RFC 7807.

**Mitigation** :
```python
@app.errorhandler(BadRequest)
def handle_bad_request(e):
    return jsonify({"type": ..., "title": "Bad Request", "detail": str(e)}), 400
```

**Anecdote** : BUG-IT-004. DX cassée (dev front ne sait pas que le payload est requis).

### 1.12 PostHog `eu.i.posthog.com/flags` retourne 401/404 en boucle

**Symptôme** : 5-10 erreurs 401/404 vers PostHog dans la console à chaque page.

**Cause probable** : clé PostHog non renouvelée OU config front pointe vers un projet supprimé.

**Mitigation** : vérifier que `VITE_POSTHOG_KEY` est valide en prod, vérifier que le projet PostHog existe.

**Anecdote** : BUG-IT-011. Pollue les logs réels.

### 1.13 DialogContent missing DialogTitle (a11y)

**Symptôme** : warning console à chaque ouverture de drawer/modal :
> "DialogContent requires a DialogTitle for the component to be accessible for screen reader users"

**Cause** : composants Radix Dialog mal configurés.

**Mitigation** :
```tsx
<DialogContent>
  <VisuallyHidden>
    <DialogTitle>{title}</DialogTitle>
  </VisuallyHidden>
  ...
</DialogContent>
```

**Anecdote** : BUG-IT-015. Bloquant pour audit RGAA.

---

## 2. Anti-patterns à proscrire dans les tests

### 2.1 Mocker la DB en pytest

**Mauvaise pratique** :
```python
@patch('models.user.User.query')
def test_get_user(mock_query):
    mock_query.get.return_value = MagicMock(...)
    ...
```

**Pourquoi pas** : on teste le mock, pas la logique métier ni les contraintes DB. Les bugs FK / migrations / cascades sont invisibles.

**À la place** : utiliser SQLite in-memory comme dans `conftest.py`. Suffisamment rapide (millisecondes par test).

### 2.2 Sélecteurs Playwright sur classes Tailwind

**Mauvaise pratique** :
```typescript
await page.click('.bg-primary.text-white.px-4');
```

**Pourquoi pas** : les classes Tailwind changent à la moindre refonte UI. Tests fragiles.

**À la place** : `getByRole`, `getByText`, `data-testid`.

### 2.3 `setTimeout` au lieu de `waitFor`

**Mauvaise pratique** :
```typescript
await page.click('button');
await page.waitForTimeout(2000);  // espère que c'est chargé
```

**Pourquoi pas** : flaky, lent, ne reflète pas le vrai état. Si l'action prend 3s, le test casse.

**À la place** : `await page.locator('...').waitFor({ state: 'visible' })`.

### 2.4 Hard-coder des UUIDs dans les tests

**Mauvaise pratique** :
```python
client.post('/api/v1/it/tickets', json={"category_id": "12345678-..."})
```

**Pourquoi pas** : si la fixture est régénérée, l'UUID change → test cassé.

**À la place** : `uuid.uuid4()` dans le test ou fixture pytest qui crée + retourne l'objet.

### 2.5 Tester en parallèle sur la même instance ERP

**Mauvaise pratique** : 8 sub-agents Playwright, 8 personas, lancement simultané, browser context partagé.

**Pourquoi pas** : faux positifs en série (cf. §1.1).

**À la place** : séquentiel, ou agentdeck context-per-agent.

### 2.6 Skipper le cleanup après test métier

**Mauvaise pratique** : agent crée 50 objets de test "TEST QA" et termine sans supprimer.

**Pourquoi pas** : prochain run trouve l'org polluée, peut casser des tests d'unicité.

**À la place** : cleanup obligatoire dans le brief, avec préfixe identifiable.

### 2.7 "Tout couvrir en E2E"

**Mauvaise pratique** : 200 specs Playwright pour un projet → 30 min de CI, lourd à maintenir.

**Pourquoi pas** : E2E est cher (maintenance, async timing, fragilité). Garder pour les golden paths.

**À la place** : pyramide de tests :
- 1000 tests pytest (rapides)
- 50 specs E2E (golden paths critiques)
- 10 sessions agent métier MCP (UX réelle)

### 2.8 Ignorer les findings d'agent métier

**Mauvaise pratique** : l'agent rapporte 30 frictions UX, on les ignore parce que "c'est cosmétique".

**Pourquoi pas** : 30 frictions cumulent un sentiment "produit pas pro" qui fait perdre des deals.

**À la place** : trier par sévérité, allouer 1-2 j par sprint pour les frictions accumulées.

### 2.9 Lancer un test exhaustif sans cartographie

**Mauvaise pratique** : "teste le module IT" sans liste exhaustive d'endpoints.

**Pourquoi pas** : l'agent fait 30 actions sur les pages évidentes, rate les endpoints cachés (escalate, suggest, helpful).

**À la place** : cartographie d'abord (`Explore` agent), puis test exhaustif avec la liste exhaustive en input.

### 2.10 Confondre bug et manque fonctionnel

**Mauvaise pratique** : "le drawer asset n'a pas d'onglet contrats" classé comme BUG-IT.

**Pourquoi pas** : ce n'est pas un bug, c'est une feature non implémentée côté UI (alors que l'API a la donnée). Triage différent.

**À la place** : numérotation distincte (`BUG-XX-NNN` vs `MISS-XX-NNN`). Les MISS sont du backlog produit, pas du fix urgence.

---

## 3. Faux positifs récurrents identifiés

(Issus de la semaine IndusForge — `_team/irritants.md` §"Faux positifs clôturés")

### 3.1 IRR-204 — "Rate-limiter sur endpoints métier"
**Faux** : le limiter n'est appliqué que sur `/auth/login`, `/auth/register`, `/auth/totp/*`. Pas de `default_limits` global. Les 429 vus venaient du bucket `/auth/login` saturé par les tests parallèles.

### 3.2 IRR-221 — "/projets/portfolio/summary manquant"
**Faux** : le frontend appelle `/projets/portfolio/kpis`, pas `/summary`. La route existe.

### 3.3 IRR-222 — "Schéma /projets POST incohérent"
**Faux** : le formulaire UI utilise bien `budget_planned` et `status: 'DRAFT'`. Sub-agent avait testé avec mauvais champs.

### 3.4 IRR-226 — "Mixed Content HTTP→HTTPS"
**Faux** : l'axios client utilise `/api/v1` relatif, aucune URL `http://` hardcodée.

### 3.5 IRR-243 — "Route /api/v1/finance/approbations inexistante"
**Faux** : le frontend appelle `/api/v1/accounting/approvals` qui existe (lignes 217-261).

### 3.6 IRR-100 / 200 / 220 / 241 / 242 — "Sessions croisées / permissions manquantes"
**Faux** : artefacts des tests parallèles partageant le même browser context (cf. §1.1).

### Leçon transverse
**Avant de déclarer un bug**, vérifier :
1. La même IP / le même browser context n'a pas pollué le résultat
2. La route appelée est bien celle qu'on croit (regarder Network panel)
3. Le payload envoyé est bien celui qu'on croit
4. Si deux agents partagent le canal, l'un n'a pas masqué l'autre

→ Garder un bucket "à investiguer" séparé du bucket "bug confirmé".

---

## 4. Apprentissages stratégiques

### 4.1 La cartographie sauve du temps de test

Tester un module sans cartographie préalable, c'est perdre 50% du temps en exploration. Investir 1h en cartographie économise 3h en test (chiffre observé semaine IndusForge).

### 4.2 L'API est en avance sur l'UI (typique eyeot)

Le test exhaustif IT a montré : **12 manques fonctionnels** où l'API a la fonctionnalité mais l'UI ne l'expose pas (suggestions KB, satisfaction, toggles privé/solution, onglets asset, filtres tickets, widgets dashboard). Pattern récurrent dans les ERP avec un backend mature et un frontend qui suit.

→ Toujours tester l'API séparément de l'UI, sinon on rate ces opportunités à faible effort.

### 4.3 La state machine côté API peut être un actif différenciant

L'API tickets eyeot retourne `409 "Transition invalide: NOUVEAU -> RESOLU. Transitions possibles: EN_COURS, ANNULE"` sur une transition invalide. Ce niveau de qualité est **rare** et devrait être :
1. Reproduit dans les autres modules (RH leaves, Maintenance interventions, Projets tasks)
2. Documenté comme standard interne pour les futures features

### 4.4 Tester sur 2 orgs minimum

Le test #1 du module IT a vu un 500. Le test #2 (autre org) n'en a vu aucun. Le diagnostic "code cassé" était faux ; c'était un état d'org incomplet.

→ **Règle** : un bug qui n'apparaît que sur 1 org sur 2 est probablement un bug d'état (seeds, FK, RBAC), pas un bug de code. Distinguer est crucial pour ne pas commit du fix inutile.

### 4.5 Le canal `_team/` doit être strict

Pendant la semaine IndusForge, ~20% des messages canal étaient hors-format (pas de timestamp, pas de destinataire, pas de catégorie). Conséquence : confusion, doublons d'irritants, handoffs ratés.

→ **Règle** : un message hors-format est rejeté ou demandé à reformater. Le format est plus important que le contenu.

### 4.6 Un bug critique en prod justifie une pause de toute évolution

Dès qu'un test révèle un BLOQUANT en prod, **tous les sprints en cours doivent s'arrêter** pour faire un Sprint S0 hotfix. Continuer à empiler des features sur du code cassé = dette qui s'accumule.

→ Décision déléguée au PO mais recommandation par défaut : pause + S0.

### 4.7 La pyramide des tests doit être inversée pour un agent

Pour un humain dev : majorité de tests unitaires (rapides), peu d'E2E (chers, lents).
Pour un agent QA : majorité de tests métier MCP (riches, captent les frictions), peu d'unitaires (déjà couverts par CI).

→ Les agents ne remplacent pas pytest. Ils complètent.

### 4.8 Documenter les "non-bugs" autant que les bugs

Les **manques fonctionnels** (MISS-XX-NNN) et les **frictions UX** (UX-XX-NNN) sont souvent plus utiles que les bugs critiques. Ils représentent l'écart entre "fonctionne" et "agréable à utiliser".

→ Format de rapport agent métier : 3 sections distinctes (BUG / UX / MISS) obligatoires.

### 4.9 Le test exhaustif avant un sprint = 0 surprise

Lancer un test exhaustif (méthodo §05) **avant** un Sprint S0 hotfix garantit que le sprint démarre avec un brief précis (top 10 fixes chiffrés). Ne pas le faire, c'est commiter à l'aveugle.

**Coût** : ~1h pour le test exhaustif. **Économie** : ~2-3 j de re-priorisation pendant le sprint.

### 4.10 Capitaliser dans `process/` et `procedures/` après chaque campagne

C'est exactement ce que ce dossier fait. Sans capitalisation, chaque campagne réinvente la roue.

→ **Règle** : à la fin de chaque campagne, ajouter une entrée dans ce fichier (apprentissages) et créer/mettre à jour les procedures réutilisables.

---

## 5. À garder en tête au prochain démarrage

### 5.1 Avant de commencer
- [ ] Cartographie du module est-elle à jour ?
- [ ] Seeds sont-ils joués sur l'env de test ?
- [ ] 2 orgs disponibles pour distinguer bug code vs bug état ?
- [ ] Canal `_team/` vierge ou nouveau dossier d'output ?

### 5.2 Pendant le test
- [ ] Bucket "à investiguer" séparé du bucket "bug confirmé"
- [ ] Captures avec noms parlants
- [ ] Console + network requests captés systématiquement
- [ ] Cleanup au fur et à mesure

### 5.3 Après le test
- [ ] Trier les findings par sévérité ET par confiance (vrais bugs vs faux positifs)
- [ ] Mettre à jour le rapport exécutif
- [ ] Capitaliser les nouveaux apprentissages dans ce fichier
- [ ] Proposer un Sprint S0 si bloquants détectés

---

## 6. Métriques post-mortem (semaine IndusForge complète)

| Métrique | Valeur |
|---|---|
| Durée totale | 2 semaines calendaires |
| Commits | 25 |
| Personas joués | 8 |
| Modules touchés | 11/11 |
| Flows UI exécutés | ~60 |
| Irritants documentés | 244+ |
| Bugs patchés en cours | ~40 |
| Faux positifs identifiés à la clôture | ~10 |
| % de faux positifs / total | ~4% |
| Cause #1 des faux positifs | Browser context partagé |
| Sub-agents lancés en parallèle (échec) | 3 simultanés |
| Sub-agents lancés séquentiellement (succès) | 1 à la fois |

---

## 7. Comparatif des outils pendant la campagne

| Outil rencontré | Rôle joué | Limite atteinte | Ce que agentdeck doit absorber |
|---|---|---|---|
| `_team/channel.md` | Canal partagé | Append-only, pas de threads | `post_to_channel` + `read_channel` |
| `_team/shared-state.md` | État partagé | Edition manuelle, conflits | `project_memory_read/write` |
| `_team/irritants.md` | Bug tracker | Pas de filtrage par sévérité | Tab dédié dans agentdeck |
| `Bash run_in_background` | Exec long | Output JSONL difficile à lire | `sandbox_exec` + `runId` + `diff_exec` |
| Playwright MCP | Browser piloté | Context partagé (cf. §1.1) | `browser_*` natif par session, **context-per-agent** |
| Skills `crm-*` | Personas | Pas de coordination | DM inter-skills (`send_direct`/`read_direct`) |
| `Agent` tool | Sub-agent | Pas de canal partagé | Channel + memory natifs agentdeck |
| `Skill` tool | Skill métier | Synchrone, pollue contexte | Async invocation |
| Procedures markdown | Runbooks | Pas d'exécutable | `run_test_procedure` runtime |

→ **Conclusion** : agentdeck a la bonne intuition architecturale (channel + memory + sandbox + browser + test reports + DM). Le manque #1 à combler reste le **context-per-agent** sur Playwright. Le reste est itératif.

---

*Apprentissages — 2026-04-25, v1.0. À mettre à jour après chaque campagne.*
