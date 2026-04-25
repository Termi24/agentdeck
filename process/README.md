# Process — Méthodologies de test ERP eyeot

> Capitalisation exhaustive des processus, méthodologies et apprentissages issus des campagnes de test sur l'ERP **eyeot** (Flask + React, déployé sur `https://erp.eyeot.fr`). Ce dossier sert de référence pour tester n'importe quel module de cet ERP — et plus largement n'importe quelle application full-stack à plusieurs rôles métier.
>
> Date : 2026-04-25. Auteur : capitalisation post-projet (semaine IndusForge + analyse comparative GLPI vs eyeot IT).

---

## Pourquoi ce dossier

L'ERP eyeot a été testé selon **6 méthodologies distinctes mais complémentaires**, chacune adaptée à un objectif et un budget de temps. Ce dossier extrait pour chacune :
- **Quand l'utiliser** (et quand ne pas l'utiliser)
- **Le mode opératoire pas-à-pas**
- **Les templates de prompts d'agents prêts à l'emploi**
- **Les pièges rencontrés en pratique** (issus de la semaine IndusForge réelle, 25 commits, 8 personas, ~60 flows testés, 244+ irritants documentés)
- **Les métriques de succès attendues**

Les méthodologies sont **stackables** : un même module peut être testé en pytest (S0 sécurité), puis en E2E (S1 régression), puis en agent métier Playwright MCP (S2 UX réelle), puis en test comparatif (S3 stratégique).

---

## Index — ordre de lecture recommandé

| # | Fichier | Objectif | Quand le lire |
|---|---|---|---|
| 0 | [00-vue-densemble.md](00-vue-densemble.md) | Cartographie de tous les processus de test | **D'abord** — pour comprendre quel outil prendre |
| 1 | [01-tests-automatises.md](01-tests-automatises.md) | pytest backend + script API direct + Playwright E2E | Avant chaque PR / sprint / tag de release |
| 2 | [02-tests-agents-metier.md](02-tests-agents-metier.md) | Skills `crm-*` Playwright MCP, mode persona, mode bug-hunter | Pour valider l'UX réelle d'un module |
| 3 | [03-orchestration-multi-agents.md](03-orchestration-multi-agents.md) | `crm-qa-orchestrator`, `crm-semaine-industrielle`, canal `_team/` | Pour tester la cohérence cross-module sur plusieurs jours |
| 4 | [04-test-comparatif-cartographie.md](04-test-comparatif-cartographie.md) | Comparaison vs concurrent open-source (cartographie + matrice) | Avant un sprint stratégique / appel d'offres |
| 5 | [05-test-exhaustif-prod.md](05-test-exhaustif-prod.md) | Test d'un module entier en condition prod (backend + frontend) | Avant un hotfix S0 / cliché de stabilité |
| 6 | [06-templates-prompts.md](06-templates-prompts.md) | Tous les templates de prompts d'agents prêts à copier-coller | À chaque lancement d'agent QA |
| 7 | [07-checklist-test-module.md](07-checklist-test-module.md) | Checklist actionnable pour tester un nouveau module de A à Z | Avant chaque livraison de feature majeure |
| 8 | [08-apprentissages.md](08-apprentissages.md) | Lessons learned, frictions, faux positifs, anti-patterns | À garder ouvert pendant toute campagne |
| 9 | [09-glossaire.md](09-glossaire.md) | Termes techniques utilisés dans ce dossier | Au besoin |
| 10 | [10-methodologie-unifiee.md](10-methodologie-unifiee.md) | **La méthodologie ultime** — orchestrator exhaustif multi-personas qui fusionne §01-§06 | Pour une campagne complète de A à Z |

---

## En une page — les 6 méthodologies

| Méthodo | Effort | Quand | Profondeur | Trouve quoi |
|---|---|---|---|---|
| **pytest backend** | 1-5 j | À chaque PR | Endpoint, service, modèle | Régressions code, contrats API |
| **Script API direct** (multi-personas) | 0,5-1 j | Smoke release | Toutes routes CRUD en API pure | Permission gaps, fixtures manquantes, 5xx massifs |
| **Playwright E2E** | 1-3 j | À chaque PR critique | Parcours utilisateur scriptés | Régressions UI, bugs de contract front↔back |
| **Agent métier Playwright MCP** | 0,5-1 j (par module) | Avant release | Tout le module via UI | Frictions UX, manques fonctionnels, bugs réels |
| **Orchestration multi-agents** | 5-7 j | Avant grand jalon | Cross-module + collaboration cohérente | Bugs cross-tenant, ruptures de cohérence |
| **Test comparatif** | 2-5 j | Stratégique | Roadmap & positionnement | Manques structurels, opportunités diff |

---

## Outillage utilisé

| Tool | Rôle |
|---|---|
| **pytest** | Tests unitaires + intégration backend, couverture, fixtures |
| **vitest** | Tests unitaires frontend (composants, hooks) |
| **Playwright** (CLI) | Tests E2E scriptés (specs `.ts`) |
| **Playwright MCP** | Browser piloté par un agent LLM en condition réelle |
| **`requests` Python** | Script API direct multi-personas (`test-all-creates.py`) |
| **Skills Claude Code** (`crm-*`) | Personas métier qui exécutent un brief structuré |
| **Canal `_team/`** (channel/state/irritants) | Coordination inter-agents asynchrone |
| **agentdeck procedures** | Runbooks YAML/Markdown réutilisables (cf. `G:\agentdeck\procedures\`) |

---

## Quelques chiffres post-mortem (semaine IndusForge réelle)

| Métrique | Valeur |
|---|---|
| Durée campagne | 2 semaines calendaires |
| Commits produits | 25 |
| Personas-métier joués | 8 |
| Modules touchés | 11/11 (CRM, stock, achats, maintenance, projets, RH, finance, GED, IT, compliance, settings) |
| Flows UI exécutés | ~60 |
| Irritants documentés | 244+ (IRR-001 → IRR-244) |
| Bugs patchés en cours de semaine | ~40 |
| Faux positifs identifiés à la clôture | ~10 (browser context partagé, mauvais nom de route, etc.) |

---

## Ce dossier vs `G:\agentdeck\procedures\`

Les deux sont **complémentaires** :

- `G:\agentdeck\procedures\` = **runbooks atomiques** déclenchables par `run_test_procedure` (smoke-login, rbac-probe, exhaustive-crud-test, etc.). Format YAML/Markdown court, exécutable.
- `G:\agentdeck\process\` (ce dossier) = **méthodologies & retex**, texte long, conceptuel. Inclut le « pourquoi », les pièges, les templates, le glossaire. Pour comprendre.

Si tu veux faire quelque chose : commence ici (`process/`), puis va exécuter les `procedures/`.

---

## Maintenance de ce dossier

À mettre à jour :
- Après chaque campagne de test majeure → ajouter les nouveaux apprentissages dans `08-apprentissages.md`.
- Quand un nouveau skill `crm-*` est ajouté → mettre à jour `02-tests-agents-metier.md` §inventaire.
- Quand un faux positif récurrent est identifié → ajouter dans `08-apprentissages.md` §anti-patterns.
- Quand un nouveau type de test apparaît (ex: tests de performance, tests de sécurité dédiés, fuzzing) → créer un nouveau document numéroté.

---

*README mis à jour le 2026-04-25.*
