# Revue méthodologique — agentdeck vs retour d'expérience IndusForge

Analyse rédigée après une campagne intensive de 25 commits sur 2 semaines
de test collaboratif multi-agents (organisation `industest` dans l'ERP
eyeot), où 8 personas-métier ont exécuté ~60 flows UI + API en itérations
sub-agents successives.

Lecture transversale de ce qui a fonctionné, ce qui a cassé, et
propositions concrètes pour agentdeck.

---

## 1. Ce que agentdeck fait déjà mieux que mon set-up ad-hoc

Pendant IndusForge j'ai dû improviser des équivalents primitifs pour :

| Besoin rencontré | Mon bricolage | Le tool agentdeck équivalent |
|-------------------|---------------|------------------------------|
| Canal partagé agents | fichier `_team/channel.md` edité à la main | `post_to_channel` + `read_channel` |
| Rapports structurés | fichiers `_team/final-report.md`, `retest-report.md` | `publish_doc` |
| État partagé / fixtures | `_team/shared-state.md` | `project_memory_read/write` |
| Execution shell | `Bash` avec `run_in_background` + `ScheduleWakeup` | `sandbox_exec` + `runId` + `diff_exec` |
| Credentials | fichier `reference_vps.md` + clés SSH manuelles | `secrets_get` (AES-256-GCM) |
| Browser Playwright | MCP plugin_playwright chargé via `ToolSearch` | `browser_*` natif par session |
| Coordination inter-agents | impossible, agents parallèles isolés | `send_direct` / `read_direct` / `wait_for_channel` |
| Pause pour humain | conversation principale | `await_user_input` |
| Runbooks réutilisables | prompts inlineés dans chaque `Agent(…)` | `procedures/*.md` + `run_test_procedure` |
| Rapports de test structurés | tables Markdown dans `irritants.md` | `report_test_result` → tab Results |
| Observabilité | aucune, je devais lire les JSONL output | tab dédié par agent + replay scrubber |

**agentdeck a déjà la bonne intuition architecturale** : channel + docs +
memory + secrets + sandbox + browser + test reports + DM sont exactement
les primitives qui auraient raccourci la semaine IndusForge de ~50 %.

---

## 2. Les 3 frictions majeures que j'ai rencontrées et qu'agentdeck doit absorber

### 2.1 Le piège du browser context partagé entre sub-agents

**Ce que j'ai vécu** : j'ai lancé 3 sub-agents Playwright en parallèle,
chacun se loguant avec un persona différent (Hugo, Camille, Damien).
Systématiquement, après ~30 secondes, tous se retrouvaient logués comme le
même persona (celui du dernier login) — à cause du cookie HttpOnly
`refresh_token` partagé, du `localStorage` Zustand persist, et de l'autofill
navigateur.

**Conséquences observées** :
- 60 % des rapports sub-agents commençaient par « Identité ≠ attendue, STOP protocole ».
- Faux positifs nombreux rapportés comme « bug serveur » alors que c'était juste un email autofill stale.
- Patch IRR-300 sur `/auth/logout` nécessaire pour pouvoir même purger côté client la session HttpOnly.

**Ce qu'agentdeck expose aujourd'hui** (d'après `CLAUDE.md`) :

> One `Browser` / `BrowserContext` / `Page` per session.

→ Un seul context par **session**. Si on lance 3 sub-agents dans la même
session, ils partagent le context → même problème que moi.

**Proposition concrète : `packages/proxy/src/services/browser-manager.ts`**

Ajouter un mode **« context-per-agent »** :

```typescript
// browser-manager.ts
class BrowserManager {
  private contexts = new Map<string, BrowserContext>(); // keyed by agentId

  async getPage(sessionId: string, agentId: string): Promise<Page> {
    const key = `${sessionId}:${agentId}`;
    let ctx = this.contexts.get(key);
    if (!ctx) {
      ctx = await this.browser.newContext({
        storageState: undefined,  // fresh: no cookies, no localStorage
        viewport: { width: 1366, height: 768 },
      });
      this.contexts.set(key, ctx);
    }
    // One page per context
    const pages = ctx.pages();
    return pages[0] ?? await ctx.newPage();
  }

  async disposeAgent(sessionId: string, agentId: string): Promise<void> {
    const key = `${sessionId}:${agentId}`;
    const ctx = this.contexts.get(key);
    if (ctx) {
      await ctx.close();
      this.contexts.delete(key);
    }
  }
}
```

Chaque agent obtient son propre `BrowserContext` isolé (cookies,
localStorage, service workers, cache distincts). C'est **l'équivalent
programmatique du « mode navigation privée »** par agent.

**Un flag dans le MCP tool** (par exemple `browser_navigate` avec un
`agent_id` implicite depuis l'env `AGENTDECK_AGENT_ID`) permettrait de
router vers le bon context.

### 2.2 Les sub-agents rapportent des faux positifs quand ils testent à l'aveugle

**Ce que j'ai vécu** : plusieurs rapports sub-agents ont affirmé « bug
backend » (ex: IRR-500 « login retourne le mauvais user ») qui, validés
par un simple `curl` direct, étaient en réalité des artefacts de l'UI
(autofill, RHF stale state). Sans contre-vérification, j'aurais patché
des bugs inexistants.

**Proposition concrète : un nouveau tool `validate_claim`**

```typescript
export const ValidateClaimInput = z.object({
  hypothesis: z.string().min(10),      // « POST /auth/login retourne user X au lieu de Y »
  reproducer: z.object({
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
    url: z.string().url(),
    headers: z.record(z.string(), z.string()).optional(),
    body: z.unknown().optional(),
    expected: z.string(),            // « should return user.email === X »
  }),
});
```

L'implémentation fait un `fetch` depuis le proxy (pas depuis le browser,
pour éviter les artefacts), exécute le reproducer, compare à l'attendu,
et retourne `{ confirmed: bool, actual: …, note: … }`. L'agent DOIT
appeler `validate_claim` avant de `report_test_result({status:'failed'})`
— protocole enforced dans les procedures.

Ça aurait tué ~40 % des faux positifs de ma campagne.

### 2.3 Pas d'inventaire exhaustif des routes = tests incomplets

**Ce que j'ai vécu** : j'ai passé 4 rounds à tester ce qui me venait en
tête (dashboard, login, admin). Quand l'utilisateur m'a demandé « as-tu
tout testé ? », j'ai dû ajouter une **Phase A** dédiée à l'inventaire
exhaustif via `grep` + audit statique du code. C'est cette phase qui a
révélé qu'il existait 115 routes mutation dont une trentaine n'avait
jamais été exercée.

**Proposition concrète : procedure + tool `api_inventory`**

Nouveau tool :

```typescript
export const ApiInventoryInput = z.object({
  framework: z.enum(['flask', 'fastapi', 'nestjs', 'django', 'rails', 'auto']),
  rootPath: z.string(),       // `backend/api/v1/` ou équivalent
});
```

Retourne un JSON :

```json
{
  "routes": [
    {
      "module": "clients",
      "method": "POST",
      "path": "/api/v1/clients/",
      "permission": "crm:write",
      "handler": "create_client",
      "schema": "ClientCreateSchema",
      "category": "CREATE"
    },
    …
  ],
  "byCategory": { "CREATE": 33, "UPDATE": 18, "DELETE": 19, "ACTION": 45 },
  "byModule": { "clients": 5, "stock": 7, … }
}
```

L'agent peut ensuite itérer sur cette liste pour **garantir la couverture
exhaustive**. C'est ce qui m'a permis d'atteindre 100 % de l'inventaire
eyeot (115 routes).

Combinable avec une nouvelle procedure `exhaustive-crud-test.md` qui prend
l'inventaire + un seed et teste tout automatiquement.

---

## 3. Nouveaux tools à ajouter (7 propositions concrètes)

| # | Tool | Besoin réel rencontré | Bénéfice |
|---|------|----------------------|----------|
| 1 | `browser_new_context` | Cross-contamination sessions | Un context (cookies/localStorage/SW) isolé par agent |
| 2 | `browser_dispose_context` | Idem, cleanup | Libère les resources Playwright entre tests |
| 3 | `validate_claim` | Faux positifs sub-agents | Contre-vérification API-level avant d'accepter un bug rapporté |
| 4 | `api_inventory` | Couverture non exhaustive | Liste les 115 routes mutation pour itération garantie |
| 5 | `api_login_multi` | Rate-limit 429 entre logins | Login des N personas en batch avec back-off géré côté proxy |
| 6 | `test_matrix_report` | Pas de vue transverse | Tableau persona × route × statut (200/403/404) pour le rapport final |
| 7 | `seed_org_iso` | Bootstrap manuel | Exécute un seed dans le backend cible pour créer une org isolée de test |

Les 1 et 2 nécessitent une modif de `browser-manager.ts`. Les 3, 4, 6
peuvent être purement ajoutés côté MCP + proxy (pas de browser touché).
Les 5 et 7 sont des orchestrateurs d'appels existants.

---

## 4. Nouvelles procédures (runbooks) à bundler

En plus de `browser-smoke.md` et `inventory-node.md`, je propose 4
procédures qui cristallisent les protocoles validés sur IndusForge :

### `procedures/exhaustive-crud-test.md`

```markdown
# exhaustive-crud-test

Teste 100 % des routes CRUD d'un backend contre une org de test isolée.

## Required secrets
- STAGING_URL
- TEST_ORG_SLUG
- TEST_PASSWORD (commun à tous les personas de test)

## Steps
1. `api_inventory` sur le backend pour récupérer la liste des routes mutation
2. `seed_org_iso` pour créer l'org + users de test si pas déjà fait
3. `api_login_multi` pour logger les 8 personas avec back-off anti-429
4. Pour chaque route CREATE → exercer avec payload minimal, saver l'id en memory
5. Pour chaque route UPDATE → exercer sur les ids créés
6. Pour chaque route ACTION → workflow transitions
7. Pour chaque route DELETE → cleanup en fin
8. `publish_doc` coverage-report.md avec la matrice
9. `report_test_result` suite=api-crud
```

### `procedures/isolated-ui-smoke.md`

```markdown
# isolated-ui-smoke

Smoke test UI de chaque flow de création en isolation forte (1 context par persona).

## Steps (en boucle pour chaque persona)
1. `browser_new_context` pour cet agent
2. `browser_navigate` /sign-in
3. `browser_fill_form` email + password
4. `browser_click` submit
5. Pour chaque bouton « + Nouveau X » de la sidebar → ouvrir, remplir, soumettre, vérifier toast
6. `browser_screenshot` à chaque étape critique
7. `browser_dispose_context` en fin
```

### `procedures/rbac-probe.md`

```markdown
# rbac-probe

Pour chaque paire (persona, route), teste si l'accès est autorisé et rapporte la matrice.

## Output
- matrix.csv : persona × route × status × expected
- flags tous les écarts (ex: persona avec `crm:read` qui reçoit 403 sur une route CRM en read)
```

### `procedures/claim-validator.md`

```markdown
# claim-validator

Meta-procédure : prend en input un rapport de test d'un sub-agent, ré-exécute
chaque bug annoncé via `validate_claim`, et retourne la liste dédupliquée
des vrais bugs (faux positifs filtrés).
```

---

## 5. Ajustements au protocole documenté dans `CLAUDE.md`

Les invariants actuels sont bons mais je propose 4 ajouts :

- **Isolation obligatoire** : pour toute procedure qui impersonne plusieurs
  users, utiliser `browser_new_context` par agent. Documenter l'anti-pattern
  de l'utilisation de la `Page` partagée.

- **Numérotation d'IRR centralisée** : `project_memory_write` sur la clé
  `next_irr_number` à incrémenter par tous les agents. Les 4 rounds d'IndusForge
  ont produit 3 collisions de numéros IRR-xxx entre teams — centraliser évite ça.

- **Protocole anti-faux-positif** : tout `report_test_result({status:'failed'})`
  doit être précédé d'un `validate_claim` réussi. Règle à ajouter aux
  templates d'agents et aux procedures.

- **Rate-limit awareness** : les tools `api_login_multi` et les sub-agents
  sensibles au rate-limit doivent exposer un paramètre `delayBetweenMs` et
  auto-retry sur 429 avec back-off exponentiel. Aujourd'hui chaque agent
  se fait couper son propre flow quand 3-4 requêtes tapent le même bucket.

---

## 6. Ce qui resterait à faire hors agentdeck

Certaines choses ne sont pas du ressort d'agentdeck mais du SaaS testé :

1. **Le SaaS doit exposer un endpoint `/auth/logout` qui révoque côté serveur**
   (y compris le refresh_token cookie), sinon aucune isolation n'est possible.
   C'est le bug IRR-300 d'IndusForge.

2. **Un seed déterministe** avec `email_verified=True` et mdp connu. Sans
   cela, pas de test automatisé possible.

3. **L'org de test doit être isolée tenant** (pas de partage de FK avec
   l'org de prod). Cf `industest` vs `demo-eyeot` vs `eyeot` dans IndusForge.

Peut-être ajouter à agentdeck une **section doc `SAAS-PREREQS.md`** avec
la checklist minimale qu'un SaaS doit exposer pour être testable.

---

## 7. Synthèse — les 5 ajouts prioritaires

Si je devais PR les 5 améliorations à plus fort ROI, je prioriserais :

1. **`browser_new_context` / `browser_dispose_context`** — résout le bug
   d'isolation qui m'a fait perdre ~30 % du temps IndusForge.
2. **`validate_claim`** — tue les faux positifs à la source.
3. **`api_inventory`** + procedure `exhaustive-crud-test.md` — garantit la
   couverture 100 %.
4. **Numérotation IRR centralisée via `project_memory_*`** — évite les
   collisions entre teams parallèles.
5. **Rate-limit back-off natif** dans `api_login_multi` + docs.

---

Document rédigé à la fin de la campagne IndusForge, basé sur 25 commits
de fix sur l'ERP eyeot et 2 semaines de test multi-persona. Les exemples
de code sont indicatifs ; l'adaptation exacte aux patterns internes de
agentdeck reste à valider.
