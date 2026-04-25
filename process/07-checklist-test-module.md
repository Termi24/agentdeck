# 07 — Checklist actionnable pour tester un module de A à Z

> Liste exhaustive à parcourir avant de considérer un module "testé". À utiliser avant chaque livraison majeure de feature ou avant chaque release. Découpée par phases pour permettre l'exécution incrémentale.

---

## Phase 0 — Pré-requis (avant de démarrer)

- [ ] La cartographie du module est à jour (`CARTOGRAPHY.md` ou doc dédiée)
- [ ] Les seeds de configuration sont joués sur l'environnement de test
- [ ] L'environnement cible est joignable (`curl -I <url>` répond 200)
- [ ] Les credentials de test sont validés (smoke login OK pour au moins 1 compte)
- [ ] Docker compose est up (si test local) OU l'équivalent (si test prod/staging)
- [ ] Le canal `_team/` est vierge ou tu as nommé un nouveau dossier d'output

---

## Phase 1 — Tests automatisés backend (pytest)

### 1.1 Existence
- [ ] Au moins un fichier `backend/tests/test_<module>*.py` existe
- [ ] Couverture mesurée : `pytest --cov=services.<module> --cov=api.<module>`

### 1.2 State machine et workflows
- [ ] Toutes les transitions valides sont testées (1 test par transition)
- [ ] Toutes les transitions **invalides** sont testées (assertion 409)
- [ ] Side effects testés (timestamps, audit, propagations)

### 1.3 Validation des entrées
- [ ] Champs requis : POST sans champ → 400 ou 422 explicite
- [ ] Énumérations : valeur hors enum → 400 explicite
- [ ] Longueurs : titre > max → 400
- [ ] Formats : email/UUID/date invalides → 400

### 1.4 RBAC
- [ ] User avec permission `module:read` peut GET, ne peut pas POST/PUT/DELETE
- [ ] User avec permission `module:write` peut POST/PUT, ne peut pas DELETE
- [ ] User sans aucune permission `module:*` reçoit 403
- [ ] Admin avec `admin:all` peut tout

### 1.5 Multi-tenant (critique)
- [ ] Un objet d'org A est invisible depuis org B (test pour CHAQUE modèle)
- [ ] Un user d'org A ne peut pas modifier un objet d'org B (404 et non 403, pour ne pas leak l'existence)
- [ ] Le filtre tenant s'applique aux jointures (ex: une licence d'org A ne peut pas être liée à un asset d'org B)

### 1.6 Side effects DB
- [ ] Les soft-deletes ne suppriment pas physiquement
- [ ] Les cascades sont correctes (ex: supprimer un Software cascade les SoftwareLicense)
- [ ] Les compteurs sont décrémentés à la suppression

### 1.7 Régressions
- [ ] Tous les tests préexistants passent sans modification
- [ ] CI verte sur la branche

---

## Phase 2 — Script API direct multi-personas

- [ ] Le script `_team/test-all-creates.py` couvre les nouveaux endpoints du module
- [ ] Les nouveaux fixtures (IDs créés en chaîne) sont déclarés (`saves_id_as`)
- [ ] Run depuis prod : `python _team/test-all-creates.py --base https://erp.eyeot.fr`
- [ ] Rapport généré dans `_team/test-all-creates-report.md`
- [ ] Sur les nouveaux endpoints : ✅ pour les routes happy path, attendus pour les routes RBAC restreintes (403)

---

## Phase 3 — Tests E2E Playwright

- [ ] Au moins 1 spec E2E pour le golden path du module
- [ ] La spec gère le cookie banner RGPD (dismiss en `beforeEach`)
- [ ] La spec utilise `getByRole`, `getByText`, `data-testid` (pas les classes Tailwind)
- [ ] La spec attend des sélecteurs visuels concrets, pas `networkidle`
- [ ] Run en local : `pnpm test:e2e`
- [ ] Run en CI : la GitHub Action E2E passe

---

## Phase 4 — Test fonctionnel rapide via agent métier

- [ ] Agent lancé avec brief structuré (cf. `06-templates-prompts.md` §3)
- [ ] Compte testeur **ne pollue pas** un compte démo client (utiliser IndusForge ou eyeot)
- [ ] Cleanup confirmé dans le rapport (préfixe "TEST QA" supprimé)
- [ ] Captures organisées avec noms parlants
- [ ] Mode bug-hunter (5 questions) appliqué
- [ ] Rapport rédigé dans `_analysis/06-test-fonctionnel-<module>.md`

---

## Phase 5 — Test exhaustif d'un module en prod

À utiliser **avant** un Sprint S0 hotfix ou une release majeure.

- [ ] Brief avec liste exhaustive d'endpoints (pas "etc.")
- [ ] Brief avec liste exhaustive de pages
- [ ] 5 parcours métier réalistes définis
- [ ] Agent lancé en background (`run_in_background=true`)
- [ ] Rapport en 9 sections (cf. `05-test-exhaustif-prod.md` §7)
- [ ] Couverture endpoints ≥ 90%
- [ ] Couverture pages = 100%
- [ ] Cleanup confirmé
- [ ] Top 10 fixes priorisé et chiffré
- [ ] Rapport rédigé dans `_analysis/07-test-exhaustif-<module>.md`

---

## Phase 6 — Audit RBAC multi-personas

- [ ] Test sur 6 rôles minimum (admin, directeur, commercial, magasinier, technicien, RH)
- [ ] Matrice page × rôle remplie (✓/✗)
- [ ] Matrice action × rôle remplie (✓/✗)
- [ ] Faux positifs vérifiés (browser context partagé entre tests)
- [ ] Rapport rédigé dans `_analysis/08-audit-rbac-<module>.md`

---

## Phase 7 — Tests de cohérence cross-module

À utiliser quand le module a des **handoffs** vers d'autres modules.

- [ ] Identifier les handoffs (ex: IT → Maintenance, RH → Admin, Commercial → Magasinier)
- [ ] Pour chaque handoff, scénario réaliste joué via 2 agents (l'un déclenche, l'autre vérifie)
- [ ] Vérifier que les **données** sont bien transmises (pas juste la notification)
- [ ] Vérifier qu'il n'y a pas de **double enregistrement** (l'objet créé une seule fois)
- [ ] Vérifier les **permissions cross-module** (le second agent voit-il bien ce que le premier a fait ?)

---

## Phase 8 — Observabilité & monitoring

- [ ] Console errors capturés (`browser_console_messages`) — 0 erreur ≥ warning au montage
- [ ] Network errors capturés — 0 401/500 systémique au montage
- [ ] PostHog : événements custom du module sont bien envoyés
- [ ] Logs serveur : aucune stack trace inattendue dans la dernière session
- [ ] Métriques : temps de réponse < 500ms p95 sur les endpoints du module

---

## Phase 9 — Documentation

- [ ] La cartographie du module est mise à jour (`CARTOGRAPHY.md`)
- [ ] Le glossaire métier est à jour (énumérations, statuts, abréviations)
- [ ] La doc API est à jour (Swagger/OpenAPI ou doc Markdown)
- [ ] Le CHANGELOG mentionne les nouvelles features et bugs fixés
- [ ] Les seeds sont documentés (quel script, quoi crée, comment relancer)

---

## Phase 10 — UX & accessibilité

- [ ] Toutes les actions critiques ont une **modale de confirmation** (suppression, transition irréversible)
- [ ] Toutes les actions ont un **toast Sonner** de feedback (succès/erreur)
- [ ] Les **messages d'erreur** sont actionnables (pas "une erreur est survenue")
- [ ] Les **champs requis** sont signalés AVANT de valider (`*` rouge ou label visuel)
- [ ] La **recherche** retourne des résultats pertinents en < 1s
- [ ] **A11y** : tab order cohérent, labels présents, contraste WCAG AA, DialogTitle pour les modales
- [ ] **Responsive** testé en 1024px et 1440px
- [ ] Pas de **cul-de-sac UX** (toute action a un retour ou une suite logique)

---

## Phase 11 — Sécurité

- [ ] Pas de **données sensibles** exposées dans le client (mot de passe, clé API en `localStorage`)
- [ ] Les actions destructives requièrent **2FA** ou re-saisie mot de passe (selon politique)
- [ ] Les **uploads** sont validés (taille, type MIME, antivirus si pertinent)
- [ ] Les **API keys** sont rotables côté admin
- [ ] **CORS** correctement configuré
- [ ] **CSP** (Content Security Policy) ne casse pas les inline scripts légitimes
- [ ] **HSTS** activé en prod
- [ ] **Audit trail** : toute action sensible est tracée

---

## Phase 12 — Performance

- [ ] **Pagination** côté API (cursor ou page) — pas de retour de 10k items en une fois
- [ ] **Indexes DB** posés sur les colonnes filtrées/triées
- [ ] **Eager loading** correct (pas de N+1 sur les listes)
- [ ] **Cache Redis** pour les données chaudes (permissions, dashboard stats)
- [ ] **Bundle frontend** : le module n'augmente pas la taille critique > 50ko gzipped
- [ ] **Lazy loading** des routes lourdes (Gantt, charts)

---

## Phase 13 — Préparation release

- [ ] Tous les `console.log` supprimés ou conditionnels
- [ ] Tous les `// TODO` traités ou tracés en issue
- [ ] Tous les `any` TypeScript justifiés ou supprimés
- [ ] La PR est rebase sur `main` à jour
- [ ] Le PR description liste les bugs fixés (numéros IRR / BUG)
- [ ] Le tag de release est créé après merge
- [ ] Le CHANGELOG est à jour
- [ ] La démo client préparée (script + données fictives)

---

## Phase 14 — Post-release

- [ ] Smoke test prod après déploiement (1 login + 1 action critique par module)
- [ ] PostHog : pas de pic d'erreurs dans les 24h post-deploy
- [ ] Logs serveur : aucune stack trace inattendue
- [ ] Le re-test post-fix est consigné dans `_analysis/08-retest-post-fix.md`
- [ ] Rétrospective sprint : capitaliser les apprentissages dans `08-apprentissages.md` de ce dossier

---

## Estimation par phase (effort moyen)

| Phase | Effort | Quand |
|---|---|---|
| 0 — Pré-requis | 30 min | Avant chaque session |
| 1 — pytest | 2-5 j (création initiale) | Avant chaque PR |
| 2 — Script API | 0,5 j (extension) | Avant release |
| 3 — E2E Playwright | 1-3 j (création initiale) | Avant release critique |
| 4 — Agent fonctionnel | 30 min - 1h | Avant chaque release |
| 5 — Test exhaustif | 30 min - 2h | Avant Sprint S0 ou release majeure |
| 6 — RBAC | 1 j | Après tout refactor RBAC ou multi-org |
| 7 — Cross-module | 2-3 j | Avant gros jalon (semaine IndusForge) |
| 8 — Observabilité | 0,5 j | Continu |
| 9 — Documentation | 0,5 j | Avant chaque release |
| 10 — UX/a11y | 1 j | Avant chaque release |
| 11 — Sécurité | 1 j (audit) | Trimestriel |
| 12 — Performance | 1 j (profiling) | Sur demande |
| 13 — Release prep | 0,5 j | Avant chaque release |
| 14 — Post-release | 0,5 j | Après chaque release |

**Total minimum pour qualifier un module "production-ready"** : ~10-15 jours de testing distribués.

---

## Quand sauter une phase

- **Phase 1 (pytest)** : ne JAMAIS sauter pour le code backend nouveau.
- **Phase 5 (test exhaustif)** : sauter si feature mineure et zéro bug visible en agent rapide (§4).
- **Phase 6 (RBAC)** : sauter si pas de modif RBAC depuis le dernier audit complet.
- **Phase 11-12** : sauter si pas de modification de sécurité/perf depuis le dernier audit.

**Ne JAMAIS sauter** : phases 0, 1, 4, 9, 10, 13, 14.

---

*Checklist actionnable pour tester un module — 2026-04-25, v1.0.*
