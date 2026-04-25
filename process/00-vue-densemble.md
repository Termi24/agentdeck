# 00 — Vue d'ensemble des processus de test ERP eyeot

> Cartographie des 6 méthodologies de test utilisées sur eyeot, leurs zones de couverture, leurs contraintes, et l'ordre dans lequel les empiler pour une couverture optimale.

---

## 1. La pyramide des tests adaptée à un ERP multi-rôles

```
                       ╱──────────────────────────╲
                      ╱  Test comparatif (vs       ╲
                     ╱   concurrent OSS) — strat.   ╲      ← Annuel / stratégique
                    ╱──────────────────────────────────╲
                   ╱  Orchestration multi-agents          ╲
                  ╱   (semaine IndusForge — 8 personas)    ╲   ← Avant gros jalons
                 ╱─────────────────────────────────────────────╲
                ╱  Agent métier Playwright MCP                  ╲
               ╱   (1 module à la fois, persona unique)          ╲   ← Avant chaque release
              ╱──────────────────────────────────────────────────────╲
             ╱  E2E scriptés Playwright (specs .ts en CI)              ╲
            ╱   + Script API direct multi-personas (Python)             ╲   ← À chaque PR critique
           ╱──────────────────────────────────────────────────────────────╲
          ╱  Tests unitaires & intégration pytest (backend) + vitest (front) ╲   ← À chaque commit
         ╱──────────────────────────────────────────────────────────────────────╲
```

**Règle d'or** : ne jamais sauter une couche. Un agent métier qui passe ne remplace pas pytest — un test pytest qui passe ne valide pas l'UX.

---

## 2. Les 6 méthodologies en détail

### 2.1 Tests automatisés backend (pytest)

- **Couvre** : models, services, routes API, fixtures, migrations.
- **Effort** : 1-5 jours (création initiale par module). Run < 5 min.
- **Outillage** : `pytest` + `conftest.py` (SQLite in-memory, fixtures `app`, `client`, `db`, `admin_headers`, `user_headers`).
- **Force** : feedback rapide, isolation totale, CI-friendly, couverture mesurable.
- **Faiblesse** : ne valide pas l'environnement prod (FK Membership, seeds, permissions différentes par org).
- **Quand utiliser** : à chaque commit (CI), avant chaque release, avant tout refactor.
- → Détail : `01-tests-automatises.md` §pytest

### 2.2 Tests automatisés frontend (vitest + Playwright E2E)

- **Couvre** : composants React, hooks, parcours utilisateur scriptés.
- **Effort** : 1-3 jours par parcours critique.
- **Outillage** : `vitest` (unit), `Playwright` CLI (E2E, fichiers `*.spec.ts`).
- **Force** : régression UI captée, contrat front↔back vérifié.
- **Faiblesse** : fragile (sélecteurs, async timing), maintenance lourde.
- **Quand utiliser** : sur les golden paths uniquement (login, création ticket, conversion devis→commande, …).
- → Détail : `01-tests-automatises.md` §E2E

### 2.3 Script API direct multi-personas

- **Couvre** : toutes les routes CREATE/UPDATE/DELETE/ACTIONS, vues par chaque persona avec son token réel.
- **Effort** : 0,5-1 jour (création), 5-10 min par run.
- **Outillage** : Python `requests`, fichier `_team/test-all-creates.py`.
- **Force** : couverture **massive** des permissions (RBAC) et des contrats API en pure HTTP, sans Playwright. Indique vite quels endpoints sont cassés.
- **Faiblesse** : ne teste pas l'UI, ne capture pas les frictions UX.
- **Quand utiliser** : avant un tag de release, après un refactor RBAC, après un refactor multi-org.
- → Détail : `01-tests-automatises.md` §script-api

### 2.4 Agent métier Playwright MCP (skill `crm-*`)

- **Couvre** : un module entier en UI, sous l'angle d'un persona réaliste (ex : Amandine admin IT, Damien commercial B2B).
- **Effort** : 30 min – 2 h par session, par persona.
- **Outillage** : Skills Claude Code (`crm-it-service`, `crm-commercial`, …) + Playwright MCP.
- **Force** : capte les frictions UX, les manques fonctionnels (l'API a la fonctionnalité mais l'UI ne l'expose pas), les libellés cassés, l'a11y.
- **Faiblesse** : non répétable strictement, dépend de la créativité de l'agent.
- **Quand utiliser** : avant chaque release, à chaque livraison de module, en pré-démo client.
- → Détail : `02-tests-agents-metier.md`

### 2.5 Orchestration multi-agents (semaine IndusForge)

- **Couvre** : tous les modules + cohérence cross-module + collaboration inter-rôles.
- **Effort** : 5-7 jours réels (1-2 jours dev real-time, le reste asynchrone via canal).
- **Outillage** : `crm-qa-orchestrator` ou `crm-semaine-industrielle`, canal `_team/channel.md`, état `_team/shared-state.md`, irritants `_team/irritants.md`.
- **Force** : trouve les bugs cross-module impossibles à voir en isolation (ex : RH crée employé → Admin doit pouvoir l'inviter en 1 clic ; commercial crée devis → magasinier voit la dispo stock).
- **Faiblesse** : très lourd à mettre en place, risque de browser context partagé entre agents (cf. `08-apprentissages.md`).
- **Quand utiliser** : avant un jalon majeur (release v1.0, lancement client, audit RGPD).
- → Détail : `03-orchestration-multi-agents.md`

### 2.6 Test comparatif vs concurrent open-source

- **Couvre** : positionnement stratégique, identification des manques structurels, planification roadmap.
- **Effort** : 2-5 jours.
- **Outillage** : exploration code des deux produits + cartographie + matrice + roadmap.
- **Force** : décision-making, alignement commercial, plan d'investissement chiffré.
- **Faiblesse** : ne trouve pas de bugs, c'est un travail d'analyse pas de QA.
- **Quand utiliser** : avant un sprint produit majeur, avant un appel d'offres, à la demande du PO.
- → Détail : `04-test-comparatif-cartographie.md`

---

## 3. Matrice "quel test pour quel objectif"

| Objectif | Méthodo prioritaire | Méthodo secondaire |
|---|---|---|
| Détecter les régressions code | pytest | vitest |
| Valider un parcours utilisateur | E2E Playwright | Agent métier MCP |
| Vérifier la sécurité RBAC | Script API direct | pytest (test_rbac.py) |
| Valider l'UX d'une page | Agent métier MCP | E2E pour les golden paths |
| Trouver les manques fonctionnels (API ≠ UI) | Agent métier MCP exhaustif | Test comparatif |
| Tester un workflow cross-module | Orchestration multi-agents | E2E spec dédiée |
| Cliché de stabilité avant prod | Script API direct + agent métier | Smoke E2E |
| Dimensionner un sprint | Test comparatif | Cartographie code |

---

## 4. Modèle mental : "qui regarde quoi"

```
┌──────────────────────────────────────────────────────────────────┐
│                     L'ERP EYEOT (full-stack)                      │
│                                                                   │
│  ┌────────────┐         ┌────────────┐        ┌──────────────┐  │
│  │  Frontend  │ ◀───── │   API REST │ ◀───── │  DB+Workers  │  │
│  │  React/TS  │         │  Flask     │        │  PG+Celery   │  │
│  └────────────┘         └────────────┘        └──────────────┘  │
│        ▲                       ▲                       ▲          │
│        │                       │                       │          │
│   Playwright              Script API                pytest        │
│   (E2E + MCP)             (requests)                 (unit)       │
└──────────────────────────────────────────────────────────────────┘
        ▲                       ▲                       ▲
        │                       │                       │
   Agent métier            Permission                Modèle
   "use comme              boundaries                données +
   un humain"              RBAC                      contrats
```

**Règle de complémentarité** : Si pytest couvre le **code**, l'agent métier couvre **l'expérience**. Tu as besoin des deux. Le script API couvre **les contrats** sans passer par l'UI.

---

## 5. Boîte à outils — quels MCPs et primitives Claude Code

| Primitive | Pour quoi |
|---|---|
| `Bash` (avec `run_in_background=true`) | Lancer un agent qui prend 30+ min |
| `Agent` (général) | Sub-agent autonome qui isole le contexte de la session principale |
| `Skill` | Invoquer un agent métier (`crm-it-service`, `crm-commercial`, ...) |
| `mcp__plugin_playwright_playwright__browser_*` | Piloter Chromium en condition réelle (login, click, screenshot, network capture) |
| `Glob`, `Grep`, `Read` | Inventaire de code avant de tester |
| `TaskCreate / TaskUpdate / TaskList` | Suivi de la session de test |

---

## 6. Quand mixer les méthodologies — recettes éprouvées

### Recette A — "Sprint hotfix" (ex: après un test live qui révèle des bugs)
```
J1 : Test exhaustif prod (méthodo 5) → liste de bugs précise et chiffrée
J2-J5 : Fix
J6 : Re-test agent métier MCP (méthodo 4) → validation
```

### Recette B — "Release majeure"
```
S-1 : pytest + script API direct + E2E (méthodos 1-3) en CI → 0 régression
S-1 J3 : Agent métier MCP par module (méthodo 4) → 0 friction critique
S-1 J5 : Smoke 8 personas via orchestration (méthodo 5 light) → cohérence cross-module
```

### Recette C — "Sprint stratégique"
```
J1-J3 : Test comparatif vs concurrent (méthodo 6) → positionnement + roadmap chiffrée
J4 : Validation client / PO
J5 : Démarrage sprint dev sur les manques identifiés
```

### Recette D — "Pre-prod après refactor majeur"
```
1. pytest (méthodo 1) → couverture > 70% sur le périmètre touché
2. Script API direct (méthodo 3) → 0 régression API
3. Agent métier sur tous modules (méthodo 4) → 0 friction critique
4. Orchestration light (méthodo 5) sur 1 journée → cohérence multi-rôles
```

---

## 7. Ce que ce dossier ne couvre pas (encore)

- **Tests de performance** (load testing, k6, locust) — à ajouter en `10-tests-performance.md` quand ce besoin émergera.
- **Tests de sécurité dédiés** (OWASP, pen-test, fuzzing) — partiellement couvert dans le skill `security-review` natif Claude Code, à formaliser.
- **Tests d'accessibilité** (RGAA, axe-core) — partiellement couvert par le mode bug-hunter Amandine, à formaliser.
- **Tests de migration de données** (avant/après Alembic) — à ajouter quand un sprint dédié migration apparaîtra.

---

*Vue d'ensemble — 2026-04-25, v1.0.*
