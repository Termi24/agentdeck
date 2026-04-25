# 10 — Méthodologie unifiée de test exhaustif orchestré

> **Guide auto-portant**. Un agent IA qui découvre ce document sans contexte doit pouvoir exécuter la méthodologie de A à Z. Toutes les commandes, conventions, formats, gates et troubleshooting sont dans ce seul fichier. Les autres documents du dossier sont des **ressources d'approfondissement**, pas des pré-requis.
>
> **Rôle d'agentdeck.** agentdeck est l'outil **complémentaire d'exécution** recommandé. Il ne dicte pas la méthodologie — il en fournit les primitives (canal d'équipe, DM personnel, isolation browser context, claim validation, supervision live). Avec agentdeck, l'orchestrator est considérablement allégé : il délègue la **mécanique** de communication aux primitives natives (`post_to_channel`, `send_direct`, `wait_for_channel`, UI live) et se concentre sur la **logique** (mandats, gates, relances). Sans agentdeck, chaque primitive a un substitut documenté (§3.2) et la méthodologie reste 100 % applicable.
>
> **Règle d'or avant tout.** Un agent qui démarre cette méthodologie DOIT d'abord vérifier que son outillage est prêt (§3ter). Skipper = 2 h perdues garanties.
>
> Version 1.1 — 2026-04-25. Issue de la capitalisation des 6 méthodologies §00-§09 appliquées sur l'ERP eyeot (semaine IndusForge : 244+ irritants, 8 personas, 25 commits, 11 modules).

---

## Table des matières

0. [Lecture en 2 minutes](#0-lecture-en-2-minutes)
1. [Pré-requis projet](#1-pré-requis-projet)
2. [Les 9 principes directeurs (non-négociables)](#2-les-9-principes-directeurs)
3. [Outillage : agentdeck idéal vs mode dégradé](#3-outillage)
3bis. [Communication inter-agents : chat d'équipe + DM](#3bis-communication-inter-agents)
3ter. [Pré-démarrage : vérification agentdeck par Claude](#3ter-pré-démarrage)
4. [Définir les personas pour CE projet](#4-définir-les-personas)
5. [Vue d'ensemble du pipeline](#5-vue-densemble-du-pipeline)
6. [Phase 0 — Préparation environnement](#6-phase-0--préparation-environnement)
7. [Phase 1 — Cartographie exhaustive](#7-phase-1--cartographie-exhaustive)
8. [Phase 2 — Smoke baseline](#8-phase-2--smoke-baseline)
9. [Phase 3 — Brief + spawn orchestrator](#9-phase-3--brief--spawn-orchestrator)
10. [Phase 4 — Campagne exhaustive multi-personas](#10-phase-4--campagne-exhaustive)
11. [Phase 5 — Tests cross-module (handoffs)](#11-phase-5--handoffs)
12. [Phase 6 — Triage via claim-validator](#12-phase-6--triage)
13. [Phase 7 — Consolidation Sprint S0](#13-phase-7--consolidation)
14. [Phase 8 — Sprint S0 (dev humain)](#14-phase-8--sprint-s0)
15. [Phase 9 — Re-test + capitalisation](#15-phase-9--re-test)
16. [Conventions transverses](#16-conventions-transverses)
17. [Templates de prompts](#17-templates-de-prompts)
18. [Anti-patterns à connaître](#18-anti-patterns)
19. [Troubleshooting catalogue](#19-troubleshooting)
20. [Métriques de succès](#20-métriques-de-succès)
21. [Adaptations par type de projet](#21-adaptations-par-type-de-projet)
22. [Glossaire auto-suffisant](#22-glossaire)
23. [Évolutions futures](#23-évolutions-futures)

---

## 0. Lecture en 2 minutes

**Ce que c'est.** Une méthodologie en **9 phases gate-lockées** pour tester exhaustivement une application full-stack multi-rôles. Chaque phase a des entrées, des sorties, et un critère de passage. Elle fusionne 6 approches historiques (pytest, script API, E2E, agents métier, orchestration multi-agents, cartographie comparative) en un seul pipeline orchestré.

**Quand l'utiliser.** Avant un Sprint S0 hotfix, avant une release majeure, avant un audit. Ou simplement pour savoir dans quel état est l'application. À **ne pas utiliser** pour un hotfix < 4 h ou un simple ajout de feature (§16 du glossaire).

**Ce qu'elle livre.**
1. Une cartographie exhaustive endpoints × pages
2. Un rapport par persona (9 sections standard)
3. Un triage BUG confirmé / UX / MISS / faux positif
4. Un top-10 chiffré prêt à devenir le brief dev d'un Sprint S0
5. Un re-test post-fix qui valide chaque item 1 par 1
6. Des apprentissages capitalisés pour la campagne suivante

**Budget temps** (hors dev humain Sprint S0) :
- Module isolé (~70 endpoints, 10 pages) : **~1 jour calendaire**
- Application complète (~10 modules) : **2-3 jours calendaires**
- Re-test post-fix : **1-2 heures**

**Promesse quantifiée** (mesurée sur IndusForge vs campagne ad hoc) :
- Taux de faux positifs : **< 2 %** (vs ~4 % sans méthode)
- Couverture endpoints : **≥ 95 %** garantie
- Couverture pages UI : **100 %** garantie
- Zéro bug critique "de découverte tardive" pendant Sprint S0

---

## 1. Pré-requis projet

Avant d'appliquer cette méthodologie, vérifier que le projet cible a :

| Pré-requis | Pourquoi | Si absent |
|---|---|---|
| **2 environnements** testables (staging + prod **OU** 2 orgs multi-tenant sur la même instance) | Distinguer bug de code vs bug d'état de données (§1.6 apprentissages) | Créer une 2e org de test avant de démarrer |
| **Comptes utilisateurs** pour chaque rôle métier distinct | 1 persona = 1 compte | Créer les comptes via UI admin ou fixture SQL |
| **Seeds de configuration** joués (catégories, statuts, rôles custom) | Sans seeds, 50 % des endpoints retournent 500 ou listes vides | Rejouer `<commande-de-seed>` avant Phase 0 |
| **Accès au code source** backend ET frontend | Cartographie Phase 1 impossible sinon | Sinon méthodologie en **mode black-box** (voir §3.4) |
| **URL de base stable** (pas un preview deploy qui change chaque push) | Les `validate_claim` et captures seraient invalides | Figer une URL staging pour la durée de la campagne |
| **Un espace disque** pour les livrables (~200 MB pour une campagne complète) | Rapports + captures + evidence | `mkdir <project>/_qa/` |

**Pré-requis optionnels mais recommandés** :
- Une CI verte sur `main` au moment du kickoff (sinon la baseline Phase 2 est cassée dès le départ)
- Un bug tracker (Linear, GitHub Issues…) pour ingérer le top-10 Phase 7
- Accès shell au serveur pour rejouer les seeds si besoin
- PostHog/Sentry/équivalent actif pour corréler les bugs rapportés avec la télémétrie serveur

---

## 2. Les 9 principes directeurs

Ces règles sont **non-négociables**. Violer une règle = réintroduire une classe de bug connue et ajouter des faux positifs. Si une règle ne peut pas être appliquée sur un projet, **documenter explicitement** pourquoi et l'impact avant de démarrer.

### Principe 1 — Un persona = un BrowserContext isolé

**Règle.** Chaque persona démarre sa session avec un `BrowserContext` neuf (cookies, localStorage, cache, service workers vides). Jamais 2 personas ne partagent un contexte.

**Pourquoi.** Lors de la semaine IndusForge, 3 sub-agents Playwright en parallèle partageaient les cookies HttpOnly `refresh_token` + localStorage Zustand. Résultat : après ~30 secondes, tous logués comme le même persona. **60 % des rapports sub-agents commençaient par "Identité ≠ attendue"**, générant des faux bugs en série.

**Comment (avec agentdeck).**
```
Premier appel de chaque persona :
mcp__agentdeck__browser_new_context({ reset: true })
```
Vérifier que la réponse contient `isolated: true`. Si non, STOP.

**Comment (sans agentdeck, mode dégradé).**
- Soit lancer 1 seul persona à la fois en séquentiel (perd le parallélisme mais 0 contamination)
- Soit utiliser des **profils Chromium distincts** via `--user-data-dir=/tmp/chromium-<persona>` (chaque sub-agent lance sa propre instance Chromium)
- Soit utiliser `playwright.chromium.launch({ ... })` avec `storageState` distinct par persona

**Violation typique.** Lancer 3 sub-agents Playwright MCP dans le même message sans spécifier de context. Ils **partagent** le contexte par défaut.

### Principe 2 — Cartographie avant test

**Règle.** Avant de tester un module, lister **exhaustivement** ses endpoints et ses pages. Pas d'exploration pendant le test lui-même.

**Pourquoi.** Sans cartographie, un agent qui teste "le module IT" va couvrir les pages évidentes et rater les endpoints cachés (escalate, suggest, helpful). L'exhaustivité est impossible si la cible n'est pas explicite. Gain observé : 1 h de cartographie économise 3 h de tâtonnements.

**Comment (avec agentdeck).** Utiliser `mcp__agentdeck__api_inventory` avec `selfCheck` (probe N GETs live pour détecter un parsing cassé avant de l'utiliser).

**Comment (sans agentdeck).** Sub-agent "Explore" qui grep les décorateurs de routes :
- Flask : `@<bp>.route`, `@app.route`
- FastAPI : `@router.get/post/put/delete`
- Express : `app.get/post/...`, `router.get/post/...`
- Fastify : `fastify.route`, `fastify.get/post/...`
- Spring : `@GetMapping/@PostMapping/...`

**Violation typique.** "Teste le module IT" sans liste d'endpoints → l'agent teste 30 % du module et rate 12 MISS.

### Principe 3 — Claim validation avant escalade

**Règle.** Aucun bug n'est "confirmé" sans re-validation **server-side** (fetch HTTP direct hors browser) avec les mêmes paramètres.

**Pourquoi.** Un agent Playwright peut rapporter "POST /tickets → 500" alors que la vraie cause est un rate-limit 429 retourné 2 appels plus tôt, un token expiré, ou un cookie contaminé par un autre persona. La re-validation isole le cœur du bug.

**Comment (avec agentdeck).** `mcp__agentdeck__validate_claim({ method, path, body, expectedStatus, maxRetries: 3 })` → retourne si le bug est reproductible.

**Comment (sans agentdeck).** Script Python `requests` dédié qui rejoue les N claims listés dans un fichier `claims.json`. Pattern :
```python
for claim in claims:
    session = requests.Session()
    session.headers["Authorization"] = get_token(claim["persona"])
    r = session.request(claim["method"], claim["url"], json=claim.get("body"))
    claim["reproduced"] = (r.status_code == claim["expectedStatus"])
    claim["observed"] = {"status": r.status_code, "body": r.text[:500]}
```

**Violation typique.** Prendre pour argent comptant les rapports des personas. Résultat : 10-20 % de faux positifs dans le Sprint S0.

### Principe 4 — 2 environnements/orgs minimum

**Règle.** Tout test se fait sur **au moins 2 cibles** : une "primaire" (compte dev) + une "seedée complète" (données de démo).

**Pourquoi.** Sur eyeot, un POST /tickets retournait 500 sur org A (compte dev avec seeds partiels) mais 201 sur org B (IndusForge avec seeds complets). Le diagnostic "code cassé" du test solo était **faux** — c'était un état d'org incomplet. Sans 2 cibles, impossible de distinguer.

**Comment.** Si l'app est multi-tenant : utiliser 2 orgs distinctes. Si l'app est single-tenant : staging + local, ou staging + une 2e instance avec seeds fresh.

**Règle de décision.** Un bug qui apparaît sur 1 cible mais pas l'autre est **probablement un bug d'état** (seeds, FK, RBAC), pas un bug de code. À tagger `STATE-BUG-XXX-NNN`, traité différemment.

**Violation typique.** Tester uniquement sur l'org dev du développeur. 30 % des "bugs" trouvés sont en fait des seeds manquants.

### Principe 5 — 3 buckets distincts : BUG / UX / MISS

**Règle.** Tout finding est classé dans UN SEUL des 3 buckets :
- **BUG-XX-NNN** : comportement incorrect observé (500, 409 silencieux, données corrompues, état incohérent)
- **UX-XX-NNN** : friction utilisable mais pénible (pas de toast, libellé ambigu, champs requis non signalés, cul-de-sac)
- **MISS-XX-NNN** : manque fonctionnel — l'API expose une capacité, l'UI ne l'appelle jamais

**Pourquoi.** Le triage dev est radicalement différent :
- BUG → hotfix urgent
- UX → sprint produit régulier
- MISS → intégration UI rapide, souvent quick-win (l'API existe déjà)

Sans distinction, tout finit dans le même tas, et les MISS (souvent 80 % de la valeur perçue utilisateur) sont ignorés parce que noyés.

**Comment.** Dans les rapports, **3 sections obligatoires distinctes**. Dans `report_test_result`, tag `type: "bug" | "ux" | "miss"`.

**Violation typique.** "Le drawer asset n'a pas d'onglet contrats" classé BUG. C'est un MISS.

### Principe 6 — Canal typé, pas markdown libre

**Règle.** La communication entre agents passe par un **canal structuré** avec schéma strict (timestamp, expéditeur, destinataire, type, payload). Pas un fichier markdown append-only libre.

**Pourquoi.** Sur IndusForge, ~20 % des messages `_team/channel.md` étaient hors-format (pas de timestamp, pas de destinataire). Conséquence : confusion, doublons d'irritants, handoffs ratés.

**Comment (avec agentdeck).** `mcp__agentdeck__post_to_channel` + `mcp__agentdeck__send_direct` — le schéma est imposé par zod.

**Comment (sans agentdeck).** Fichier `channel.jsonl` (JSON Lines) avec un schéma imposé :
```json
{"ts":"2026-04-25T14:32:00Z","from":"Amandine","to":"@Damien","type":"handoff","payload":{"ticketId":"..."}}
```
Le format JSONL force la structure. Un script de validation rejette les lignes non conformes.

**Violation typique.** "Cher Damien, j'ai créé le ticket TK-42, à toi" en markdown plat. Impossible à parser, perd l'ID.

### Principe 7 — Cleanup avec préfixe CAMPAIGN_ID

**Règle.** Chaque objet créé pendant la campagne est préfixé `TEST-QA-<CAMPAIGN_ID>-<description>`. À la fin, un script supprime tout ce qui matche le préfixe.

**Pourquoi.** Sans préfixe, impossible de distinguer les objets de test des vraies données. Résultat : soit l'org reste polluée (breaks les tests d'unicité du run suivant), soit on supprime des vraies données en panique.

**Comment.**
```python
CAMPAIGN_ID = uuid.uuid4().hex[:8]  # ex: "03f0b1f2"
# Stocké dans project_memory (agentdeck) ou ENV var
# Utilisé dans tous les noms :
title = f"TEST-QA-{CAMPAIGN_ID}-wifi-hs"
```
Script de cleanup en fin de campagne :
```bash
# Cleanup SQL de secours (si UI non permissive)
DELETE FROM tickets WHERE title LIKE 'TEST-QA-03f0b1f2-%';
```

**Violation typique.** Noms génériques ("Test ticket 1", "TEST QA"). Impossible à nettoyer proprement 3 campagnes plus tard.

### Principe 8 — Séquentiel avant parallèle

**Règle.** Les **2 premiers personas** d'une campagne sont lancés **séquentiellement** pour vérifier que l'isolation fonctionne vraiment (règle §1). Ensuite seulement, passage au parallèle contrôlé (max 3 en même temps).

**Pourquoi.** Principe §1 dit "ça doit être isolé". Principe §8 dit "vérifie-le empiriquement avant de faire confiance". C'est la ceinture **et** les bretelles.

**Comment.** Test de non-contamination :
1. Persona 1 se logue, crée l'objet A, note son identité (`/api/me`)
2. Persona 1 s'arrête proprement
3. Persona 2 démarre, crée l'objet B
4. Persona 2 lit l'identité : doit voir **son** identité, pas celle de Persona 1
5. Persona 2 lit ses objets créés : doit voir **seulement** B, pas A

Si la vérif échoue → stop, investiguer avant de paralléliser.

**Violation typique.** Lancer 6 personas en parallèle d'entrée de jeu parce que "c'est plus rapide". Découvrir le bug d'isolation après 3 heures d'exécution polluée.

### Principe 9 — Planning d'équipe ≥ 1 semaine

**Règle.** L'**équipe de personas** (l'ensemble des rôles fictifs qui forment l'entreprise simulée et qui vont collaborer pendant le test) doit avoir un **planning calendaire d'au moins 1 semaine ouvrée**, étendu à 2 ou 3 semaines si la complexité du domaine ou le nombre de handoffs cross-module l'exige. Une "journée type" isolée par persona ne suffit pas — c'est le planning **collectif sur la semaine** qui rend la collaboration testable.

**Pourquoi.** Trois raisons, observées sur la campagne IndusForge (8 personas, ERP eyeot) :
1. **Les bugs de handoff n'apparaissent qu'au J+2 / J+3.** Un ticket créé par Damien lundi matin doit attendre le triage IT de l'après-midi, l'escalade vers Amandine mardi, puis le retour au demandeur jeudi. Un planning d'1 jour aplatit tout en simultané et rate ~70 % des frictions de handoff (pas de relance, pas de SLA, pas d'état "en attente de").
2. **Les personas sans planning crédible deviennent des robots.** Sans rythme hebdomadaire (réunions du lundi, livrables du jeudi, reporting du vendredi), les agents IA dérivent vers du bug-hunting mécanique et ratent les frictions UX (cul-de-sac d'attente, notifications absentes, manque de vue d'équipe).
3. **L'amortissement de la cartographie n'a de sens qu'à l'échelle semaine.** 1 jour de Phase 0-1 (cartographie + smoke) pour 1 jour de Phase 4 (test) → ratio 1:1, peu rentable. Pour 5 jours de Phase 4 multi-personas → ratio 1:5, c'est là que la méthodologie paie.

**Comment.** Pour chaque campagne, produire un fichier `_qa/<date>/00-planning-équipe.md` qui contient :
- Une **grille J×N** : 5 colonnes (J1-Lundi à J5-Vendredi, +J6/J7 si extension), N lignes (1 par persona).
- Pour chaque cellule : 2-4 actions concrètes ancrées dans le métier (ex: "Damien — réception 12 tickets weekend, triage matin, 3 escalades IT").
- Une colonne dédiée **handoffs cross-personas** : qui passe quoi à qui, et à quel moment de la semaine.
- Un encart **réunions d'équipe** : standup lundi matin, point milieu jeudi, debrief vendredi (chacun = ≥ 3 messages canal).
- Un encart **livrables hebdomadaires** : ce que l'entreprise produit en sortie de semaine (rapport mensuel, reporting client, audit interne…).

**Comment (avec agentdeck).** Le planning peut être posté en tête de campagne dans `project_memory_write({key:'campaign-plan'})` puis chaque persona lit `project_memory_read` au démarrage de sa journée. Les handoffs deviennent des `send_direct` ciblés ; les réunions deviennent des séquences `post_to_channel`.

**Comment (sans agentdeck).** Fichier `_team/planning.md` partagé + une convention de pré-fixe `[J1-AM]`, `[J3-PM]` dans les messages markdown pour suivre le déroulé.

**Seuils.**
- **< 1 semaine planifiée** : campagne refusée — bascule en mode "test agent solo §02" qui ne prétend pas à la couverture multi-personas.
- **1 semaine** : minimum pour ERP / SaaS B2B / marketplace (≥ 4 personas avec handoffs).
- **2-3 semaines** : nécessaire pour app multi-département (≥ 8 personas), cycles trimestriels (clôture finance, paie, audit), ou vérification de processus longue durée (onboarding client, recouvrement).

**Violation typique.** Démarrer Phase 4 avec une simple liste de "8 personas et leurs pages" sans calendrier. Résultat : tous les agents tapent en parallèle au J0, créent des objets sans dépendance temporelle, et les bugs de séquencement (un objet créé tôt qui devrait bloquer une action tardive) restent invisibles. C'est exactement le manque qui a fait passer 12 MISS sous le radar lors de la première semaine eyeot.

---

## 3. Outillage

### 3.1 Pitch agentdeck (mode idéal)

**agentdeck** ([G:\agentdeck](G:\agentdeck)) est un orchestrateur local qui expose 31 primitives MCP dédiées à cette méthodologie. Il résout nativement les 3 principes les plus difficiles à implémenter à la main :

| Principe | Primitive agentdeck |
|---|---|
| §1 Context isolé | `browser_new_context({reset: true})` — BrowserContext par agent, isolation garantie au niveau Playwright |
| §3 Claim validation | `validate_claim` — fetch server-side avec retry 429 auto, `Retry-After` honoré |
| §6 Canal typé | `post_to_channel`, `send_direct`, `read_channel` — schéma zod imposé |

Bonus pratiques :
- `api_inventory` : grep auto Flask/FastAPI/Express/Fastify + selfCheck live
- `project_memory_*` : persistance inter-session (CAMPAIGN_ID, fixtures)
- `sandbox_*` : exec scripts dans `data/workspaces/<sessionId>/sandbox/` avec path-traversal refusé
- `secrets_*` : credentials AES-256-GCM pour ne pas les mettre en clair dans les briefs
- UI web `http://127.0.0.1:3000` : supervision live de tous les personas en un coup d'œil

**Setup en 3 commandes.**
```bash
cd G:\agentdeck
pnpm install
pnpm dev   # proxy + web + mcp — attendre "Listening on :3000"
```
Puis `install-claude.cmd` (Windows) pour brancher le MCP dans Claude CLI.

**Cas d'usage agentdeck optimal.** ERP ou SaaS multi-rôles complexe, campagne > 4 h, ≥ 3 personas en parallèle, besoin de superviser en live ce que font les sub-agents.

### 3.2 Mode dégradé (sans agentdeck)

La méthodologie reste **100 % applicable** sans agentdeck. Les 8 principes tiennent, seul l'outillage diffère. Tableau de substitution :

| Primitive agentdeck | Substitut sans agentdeck |
|---|---|
| `browser_new_context` | `chromium.launch({ args: ['--user-data-dir=/tmp/ctx-<persona>'] })` Playwright CLI |
| `validate_claim` | Script Python `requests` dédié (cf. §2.3) |
| `api_inventory` | Sub-agent Explore qui grep manuellement |
| `post_to_channel` | Fichier JSONL partagé `channel.jsonl` |
| `send_direct` | Fichier JSONL partagé `dm.jsonl` |
| `project_memory_*` | Fichier `state.json` dans le dossier de campagne |
| `sandbox_*` | `subprocess.run` direct dans un dossier `_qa/<date>/exec/` |
| `secrets_*` | Variables d'environnement `PERSONA_<X>_PASSWORD` |
| `report_test_result` | Entrée dans `findings.jsonl` |
| UI de supervision | `tail -f channel.jsonl` dans un terminal |

**Cas d'usage mode dégradé.** Projet petit (≤ 3 personas), campagne courte (≤ 4 h), machine sans Node, contexte CI sans droit d'installer un daemon local.

### 3.3 Tableau de décision

| Contexte | Choix recommandé |
|---|---|
| Test exhaustif pré-release ERP 10+ modules | **agentdeck fortement recommandé** |
| SaaS B2C 3 rôles, campagne 4 h | agentdeck ou dégradé, au choix |
| Hotfix module unique, 1 persona | Dégradé suffit (ou pas de méthodo) |
| CI / automation scheduled | Dégradé (pas de daemon local) |
| Investigation bug cross-module | **agentdeck** (supervision live critique) |
| Agent IA externe (Cursor, autre CLI) qui ne supporte pas les 31 MCP | Dégradé |

### 3.4 Mode black-box (sans accès code source)

Si le code source n'est pas accessible (SaaS concurrent, API tierce) :
- **Skipper Phase 1** (cartographie) ou la remplacer par une **cartographie Playwright** : un agent qui clique partout pendant 30 min et note les endpoints vus dans Network.
- Garder les 9 principes, mais couverture = ce qui a été découvert (pas "exhaustive", "découverte").
- Rapports mentionnent explicitement le mode black-box pour que le lecteur adapte ses attentes.

---

## 3bis. Communication inter-agents

Une campagne multi-personas est **une vraie équipe**. Sans canaux de communication formalisés, les agents travaillent en silo et ratent les opportunités de se débloquer mutuellement. La méthodologie impose **deux canaux distincts**, inspirés d'un vrai chat d'équipe :

### 3bis.1 Chat d'équipe — `#qa-general` (public, append-only)

**Qui lit / qui écrit.** Orchestrator + tous les personas + claim-validator + auditeur de couverture. Tout le monde voit tout.

**Usages typiques**

| Type de message | Exemple |
|---|---|
| `status` | "P2 terminé, couverture 45%, je passe au parcours P3" |
| `handoff` (public, ciblé @qqn) | "@magasinier dispo stock sur TK-42 à vérifier" |
| `blocker` | "bloqué par 429 répétés, besoin d'attendre 10 min" |
| `question_group` | "quelqu'un a déjà testé /crm/advanced/export ?" |
| `annonce_orchestrator` | "Phase 4A validée, on passe en parallèle x3" |
| `finding_public` | "POST /tickets → 500 reproductible, je l'ai passé au claim-validator" |

**Commandes (agentdeck)**
```ts
// Poster
await post_to_channel({
  channel: "qa-general",
  type: "status",
  payload: { persona: "amandine", progress: "P2 done", coverage: 0.45 }
})

// Lire les N derniers messages (pris en début de session par chaque persona)
await read_channel({ channel: "qa-general", limit: 20 })

// Bloquer en attente d'un message spécifique (ex: orchestrator attend qu'un
// persona publie son handoff avant de lancer le récepteur)
await wait_for_channel({
  channel: "qa-general",
  predicate: { type: "handoff", handoff: "H1" },
  timeoutMs: 600000
})
```

**Commandes (mode dégradé)**
```bash
# Poster
echo '{"ts":"2026-04-25T14:32Z","from":"amandine","to":"#qa-general","type":"status","payload":{...}}' >> _qa/<date>/channel.jsonl

# Lire les 20 derniers
tail -20 _qa/<date>/channel.jsonl | jq .

# Attendre : boucle polling
while ! grep -q '"handoff":"H1"' _qa/<date>/channel.jsonl; do sleep 5; done
```

### 3bis.2 Chat personnel — DM bilatéral

**Qui lit / qui écrit.** Deux agents spécifiques uniquement. Ne pollue pas le canal public. Les messages restent privés.

**Usages typiques**

| Type de message | Exemple |
|---|---|
| `question_ciblée` | Damien → Amandine : "tu te souviens de l'ID exact du ticket que tu as créé J1 pour tester l'escalade ?" |
| `coordination_mineure` | Claim-validator → Camille : "ton BUG-CRM-007 : tu as bien testé avec ou sans le token admin ?" |
| `debug` | Amandine → Hugo : "ma tentative d'invite sur ton employé E-42 retourne 409, c'est normal ?" |
| `question_off-record` | "j'hésite entre BUG et UX pour ça, ton avis ?" |

**Pourquoi séparer.**
- Canal public saturé = personne ne lit les vrais annonces
- Coordination bilatérale pénible en public (bruit pour les 6 autres)
- Questions "bêtes" n'ont pas à pollluer l'historique officiel
- Le DM force à rester factuel en public (tout ce qui a besoin de négociation → DM)

**Commandes (agentdeck)**
```ts
// Envoyer un DM de amandine → damien
await send_direct({
  from: "amandine",
  to: "damien",
  type: "question",
  payload: { text: "tu te souviens de l'ID exact du ticket J1 ?" }
})

// Lire ma boîte DM (à faire en début de session + toutes les N actions)
const dms = await read_direct({ as: "amandine", unreadOnly: true })
```

**Commandes (mode dégradé)**
```bash
# Envoyer
echo '{"ts":"...","from":"amandine","to":"damien","type":"question","payload":{...}}' >> _qa/<date>/dm.jsonl

# Lire les DM adressés à moi
grep '"to":"amandine"' _qa/<date>/dm.jsonl | jq .
```

### 3bis.3 Matrice "canal vs DM"

| Situation | Canal | DM |
|---|---|---|
| Annoncer un status / progression | ✅ | ❌ |
| Handoff d'une ressource créée | ✅ (public, + tag @récepteur) | ❌ |
| Demander une clarification rapide à 1 agent | ❌ | ✅ |
| Signaler un blocker qui concerne l'équipe | ✅ | ❌ |
| Négocier qui prend quoi | ❌ | ✅ |
| Annoncer qu'on a fini sa session | ✅ | ❌ |
| Demander à l'orchestrator une décision | ✅ (en ciblant @orchestrator) | ✅ aussi accepté |
| Se coordonner pour éviter un double-test | ❌ | ✅ |
| Pousser une décision au vote (jamais — c'est l'orchestrator qui tranche) | N/A | N/A |

**Règle synthétique.** *Si ça intéresse plus de 2 agents → canal. Si c'est bilatéral et technique → DM.*

### 3bis.4 Discipline et étiquette

**Formats obligatoires.**
- Chaque message canal : `{ts, from, to, type, payload}` minimum (JSONL strict)
- Mention explicite `@persona` dans le payload text quand le message est ciblé
- Jamais de markdown prose libre ("Salut Damien, ...") — tout structuré

**Règles de latence.**
- Un persona lit le canal en début de session ET toutes les ~10 actions significatives
- Un persona lit sa boîte DM en début de session ET après chaque handoff reçu
- Un DM sans réponse après **10 min** → relancer sur le canal public

**Règles de volume.**
- Max 5 allers-retours DM sur un sujet ; au-delà → retour canal (indice que ça concerne l'équipe)
- Max 1 message canal "status" par persona toutes les 10 min (évite le spam)
- Max 3 questions ouvertes simultanées sur le canal (sinon personne ne répond à rien)

**Qui répond aux questions non-adressées.**
- Question `@orchestrator` → orchestrator obligatoire
- Question `@<persona>` → ce persona obligatoire
- Question sans @ → premier persona dispo qui a la réponse, sinon orchestrator

### 3bis.5 Exemples de conversations réalistes

**Sur le canal #qa-general :**
```jsonl
{"ts":"14:02:01Z","from":"orchestrator","to":"#qa-general","type":"phase_start","payload":{"phase":"4B","personas":["amandine","damien","hugo"]}}
{"ts":"14:04:13Z","from":"amandine","to":"#qa-general","type":"status","payload":{"progress":"isolation OK","next":"P1 /admin/users"}}
{"ts":"14:18:44Z","from":"damien","to":"#qa-general","type":"handoff","handoff":"H1","payload":{"quoteId":"Q-42","to":"ghislaine","expects":"dispo stock"}}
{"ts":"14:22:10Z","from":"amandine","to":"#qa-general","type":"finding_public","payload":{"id":"BUG-ADMIN-003","severity":"P1","page":"/admin/roles","note":"passed to claim-validator"}}
{"ts":"14:31:55Z","from":"hugo","to":"#qa-general","type":"blocker","payload":{"reason":"429 sur /rh/leaves depuis 3 min","waited":"120s"}}
{"ts":"14:32:05Z","from":"orchestrator","to":"#qa-general","type":"annonce","payload":{"text":"@hugo pause 5 min, relance ensuite"}}
```

**En DM :**
```jsonl
{"ts":"14:15:03Z","from":"damien","to":"amandine","type":"question","payload":{"text":"tu as créé le client ACME avec quel siret ? Le mien refuse en duplicate."}}
{"ts":"14:15:48Z","from":"amandine","to":"damien","type":"answer","payload":{"text":"12345678900011. Prends un suffixe TEST-QA-<CID>-acme-2 pour éviter la collision."}}
{"ts":"14:16:12Z","from":"damien","to":"amandine","type":"thanks","payload":{"text":"ok merci"}}
```

### 3bis.6 Rôle de l'orchestrator dans les canaux

L'orchestrator est **le régulateur**, pas un simple participant :
- Lit le canal toutes les 2 min (plus souvent en Phase 4B)
- Répond aux `@orchestrator` dans la minute
- Tranche sur les ambiguïtés (ex: "BUG ou MISS ?")
- Déclenche le **kill switch** (§10.4) si 2 anomalies convergent dans le canal
- Clôt les phases avec une annonce canal

Mais il ne micromanage pas : si un persona gère son P1 de manière autonome et poste un status propre, l'orchestrator ne fait que liker (pas de réponse nécessaire).

---

## 3ter. Pré-démarrage

### 3ter.1 Règle obligatoire

**Avant de lancer la Phase 0, Claude (ou l'agent orchestrateur) DOIT vérifier que son outillage est fonctionnel.** Skipper cette vérification = risquer de perdre 3 heures avant de découvrir qu'agentdeck n'est pas démarré ou qu'un MCP manque.

Cette vérification se fait **une seule fois** au tout début de la campagne, avant toute autre action.

### 3ter.2 Checklist de vérification (mode agentdeck)

À exécuter dans l'ordre :

**1. Le proxy agentdeck répond**
```bash
curl -sS http://127.0.0.1:3000/health 2>/dev/null || echo "AGENTDECK DOWN"
```
Doit retourner un JSON `{status: "ok"}` ou équivalent. Sinon :
```bash
cd G:\agentdeck && pnpm dev
# Attendre "Listening on :3000"
```

**2. Le MCP est installé côté Claude**
Vérifier dans `%USERPROFILE%\.claude\settings.json` (Windows) ou `~/.claude/settings.json` (Unix) que `mcpServers.agentdeck` existe. Si non :
```bash
cd G:\agentdeck && install-claude.cmd   # Windows
# ou
node scripts/install-claude.mjs         # Cross-platform
```

**3. Les 31 primitives sont disponibles**
Lister les tools `mcp__agentdeck__*` dans la session Claude en cours. Il doit y avoir :
- `browser_*` (9+ tools)
- `post_to_channel`, `read_channel`, `wait_for_channel`, `send_direct`, `read_direct`
- `project_memory_read`, `project_memory_write`
- `sandbox_read`, `sandbox_write`, `sandbox_exec`
- `secrets_get`
- `validate_claim`, `api_inventory`
- `report_test_result`
- `await_user_input`, `request_agent_cancel`, `check_cancellation`
- `run_test_procedure`, `list_procedures`
- `publish_doc`, `diff_exec`

Si < 25 tools visibles : réinstaller le MCP, redémarrer Claude.

**4. Chromium est installé**
```bash
pnpm --filter @agentdeck/proxy exec playwright install chromium
```
Sinon `browser_navigate` échouera avec "chromium not found".

**5. Une session test peut être créée**
Faire un smoke call :
```ts
const s = await mcp__agentdeck__list_procedures()
// doit retourner au moins [] (pas d'erreur)
```

**6. L'UI web est joignable**
Ouvrir `http://127.0.0.1:3000` dans un navigateur. La page dashboard doit charger. Sinon `pnpm dev` n'a pas lancé Next.

**7. DB accessible**
```bash
ls G:\agentdeck\data\agentdeck.db 2>/dev/null && echo OK || echo "DB MISSING"
```
Si missing : `pnpm db:migrate`.

### 3ter.3 Checklist de vérification (mode dégradé)

Si la campagne tourne sans agentdeck :

**1. Playwright CLI installé**
```bash
npx playwright --version
```

**2. Chromium installé**
```bash
npx playwright install chromium
```

**3. Python dispo (pour `validate_claim` manuel et smoke-api)**
```bash
python --version   # >= 3.10
pip show requests  # doit exister
```

**4. Dossier de campagne écrivable**
```bash
mkdir -p _qa/test-access-check && rmdir _qa/test-access-check
```

**5. Accès réseau à la cible**
```bash
curl -I <baseUrl>
```

### 3ter.4 Si un item de la checklist échoue

**Ne PAS démarrer la Phase 0.** À la place :
1. Documenter l'échec dans `_qa/00-prerequisites-failed.md`
2. Si agentdeck cassé → suggérer mode dégradé OU fixer l'install
3. Si accès réseau cassé → ne démarrer qu'une fois la cible joignable
4. Si le user est présent : `await_user_input` avec le blocker
5. Si autonomous : attendre (pas de try-again silencieux)

### 3ter.5 Pourquoi cette vérification existe

**Historique** : sur les 3 premières campagnes IndusForge, 2 ont perdu entre 45 min et 2 h à cause de :
- agentdeck pas démarré → `mcp__agentdeck__browser_new_context` échoue silencieusement (retourne undefined) → les personas testent sans isolation → faux positifs en cascade
- Chromium pas installé → 6 personas échouent au 1er `browser_navigate`
- DB pas migrée → `session_create` retourne 500 non géré → orchestrator crashe

→ **5 min de vérification économisent 1-2 h de diagnostic erratique.**

---

## 4. Définir les personas pour CE projet

**Le point crucial** : les personas sont **spécifiques au projet**. IndusForge a 8 personas ERP (Amandine, Damien, etc.). Une marketplace en aura 3 (acheteur, vendeur, support). Une API DevTool en aura 2 (admin, intégrateur). Un SaaS analytics en aura 4 (viewer, analyst, owner, billing-admin).

### 4.1 Les 4 questions à se poser

Avant de définir les personas, répondre :

1. **Combien de rôles utilisateur distincts** ont des **workflows différents** dans l'app ?
   - Pas "combien de permissions" (un rôle peut avoir 50 permissions).
   - Mais "combien de journées-type distinctes" un utilisateur peut avoir.
   - Règle du pouce : **1 persona par workflow distinct**, pas 1 par permission.

2. **Quels rôles partagent des pages mais diffèrent sur les actions** ?
   - Ceux-là peuvent parfois être **fusionnés en un persona polyvalent** si la charge de test est faible.

3. **Quels rôles ont des handoffs entre eux** (cross-module) ?
   - Ceux-là DOIVENT être des personas distincts — on ne peut pas tester un handoff avec un seul personnage.

4. **Quels rôles existent au catalogue mais sont peu utilisés en prod** ?
   - Les exclure de la campagne initiale, les ajouter en Phase 9 si le re-test les trouve nécessaires.

### 4.2 Règle du pouce : N personas

| Type d'app | Nombre cible de personas |
|---|---|
| Outil solo / note-taking | 1-2 (user + admin) |
| SaaS B2B simple | 2-4 (user, admin, billing-owner, éventuellement viewer) |
| Marketplace | 3-5 (acheteur, vendeur, modérateur, support, éventuellement admin plateforme) |
| ERP / application métier | 6-10 (1 par département : commercial, achats, RH, finance, IT, direction) |
| Plateforme développeur / API | 2-4 (intégrateur, admin, viewer, éventuellement org-owner) |
| Application mobile consumer | 2-3 (guest, logged-in, power user) |

**Seuils durs** :
- **< 2 personas** : pas besoin de cette méthodologie, un test agent solo (§02 du repo) suffit.
- **> 10 personas** : redécouper en sous-campagnes par domaine fonctionnel, sinon ingérable.

### 4.3 Anatomie d'un persona

Un persona est défini par **6 éléments individuels**. Chacun est obligatoire — si l'un manque, l'agent redevient un robot et rate les frictions UX. La "journée type" décrite ici est ensuite **compilée dans le planning d'équipe hebdomadaire** (§4.8) qui matérialise le Principe 9 — sans cette montée d'échelle, les handoffs cross-personas restent invisibles.

```markdown
## Persona : <Prénom> <Nom> — <Rôle>

### 1. Identité et expertise
Tu incarnes <Prénom>, <rôle> chez <entreprise fictive plausible>.
Expérience : <N années> dans <domaine>.
Certifications / formations : <si pertinent>.
Style : <3 adjectifs> (ex: ordonnée, documentation-first, attentive aux détails).

### 2. KPIs surveillés (ce qui oriente tes décisions)
- KPI 1 : <mesure + cible>
- KPI 2 : ...
- KPI 3 : ...

### 3. Connexion
- URL : <baseUrl>
- Email : <email>
- Password : <password ou ref secrets_get>
- Organisation active (si multi-tenant) : <org>
- Rôle / permissions : <liste brève>

### 4. Pages maîtrisées (périmètre de ton test)
- /<page1>
- /<page2>
- ...

### 5. Journée type (scénario qui chaîne tes actions)
Le matin :
- Ouvrir le dashboard, consulter <KPI>
- Traiter <N> items dans <module>
- ...

L'après-midi :
- Préparer <livrable>
- Répondre aux <handoffs> des collègues
- ...

### 6. Mode bug-hunter (5 questions à chaque écran)
1. Y a-t-il une confirmation visuelle après une action critique ?
2. Les messages d'erreur sont-ils actionnables ?
3. Les champs obligatoires sont-ils signalés AVANT de valider ?
4. Y a-t-il un undo sur les actions destructives ?
5. La recherche retourne-t-elle des résultats pertinents en < 1 s ?
Si "non" → irritant IRR-NNN.
```

### 4.4 Template concret : persona "Acheteur Pro" pour une marketplace B2B

```markdown
## Persona : Camille Rousseau — Acheteuse B2B

### 1. Identité
Camille, 34 ans, acheteuse pour une PME industrielle (50 employés).
6 ans d'expérience, sensible aux prix, attentive aux délais de livraison.
Style : pragmatique, comparaison systématique, n'aime pas les popups.

### 2. KPIs surveillés
- Délai moyen entre commande et livraison
- Taux de commandes avec litige
- Économie annuelle vs catalogue direct fournisseur

### 3. Connexion
- URL : https://marketplace.example.com
- Email : camille@pme-test.fr / password : <secrets_get>
- Rôle : buyer + team_lead

### 4. Pages maîtrisées
- /search, /product/<id>, /cart, /checkout
- /orders, /order/<id>, /order/<id>/dispute
- /account, /account/addresses, /account/billing
- /team (voir les commandes des collègues)

### 5. Journée type
- Recherche 3 produits catégorie "outillage industriel"
- Compare les 5 premiers résultats sur chaque, prend captures
- Ajoute 2 produits au panier, configure options
- Checkout avec adresse pro enregistrée
- Le lendemain : ouvre litige sur un produit non conforme
- Consulte l'historique commandes de l'équipe

### 6. Bug-hunter activé sur tout le parcours.
```

### 4.5 Quand fusionner 2 rôles en 1 persona

- Les 2 rôles ont **> 80 %** de pages communes
- Les actions qui diffèrent sont **marginales** (< 5 actions distinctes)
- **Exemple** : "user standard" + "user premium" d'un SaaS B2C. Les pages sont les mêmes, seule la limite de quota diffère. → 1 persona qui active/désactive le premium au milieu du test.

### 4.6 Quand diviser 1 rôle en 2 personas

- Un même rôle a **2 journées-type radicalement différentes**
- **Exemple** : "Admin" d'un ERP peut être "Admin IT" (parc, licences) OU "Admin système" (users, RGPD, billing). Chez eyeot, c'est 2 skills distincts (`crm-admin` + `crm-it-service`) joués par la même personne fictive (Amandine) mais avec 2 briefs séparés.

### 4.7 Output Phase 4 (§4 de cette section)

Pour chaque projet, écrire un fichier `_qa/<date>/00-personas.md` qui liste :
- Les N personas retenus
- Leur anatomie complète (§4.3)
- La matrice "persona × module principal × modules secondaires"
- La matrice des handoffs entre personas

Ce fichier est l'**input structurant** des Phases 3-5. Il est **complété** (pas remplacé) par le planning d'équipe `00-planning-équipe.md` décrit ci-dessous.

### 4.8 Planning d'équipe hebdomadaire (matérialisation du Principe 9)

Là où §4.3 décrit la *journée* d'un persona isolé, ce livrable décrit la *semaine* de l'équipe entière. Sans lui, les handoffs cross-personas restent simultanés et invisibles. Format imposé : grille J×N avec une ligne par persona, une colonne par demi-journée ouvrée, et **deux encarts transverses** (réunions, livrables).

Fichier : `_qa/<date>/00-planning-équipe.md`

```markdown
# Planning d'équipe — semaine du <date_lundi>

## Grille J×N (demi-journées)

|              | Lun AM | Lun PM | Mar AM | Mar PM | Mer AM | Mer PM | Jeu AM | Jeu PM | Ven AM | Ven PM |
|--------------|--------|--------|--------|--------|--------|--------|--------|--------|--------|--------|
| Amandine     | …      | …      | …      | …      | …      | …      | …      | …      | …      | …      |
| Damien       | …      | …      | …      | …      | …      | …      | …      | …      | …      | …      |
| <persona N>  | …      | …      | …      | …      | …      | …      | …      | …      | …      | …      |

Chaque cellule = 2-4 actions concrètes ancrées dans le métier (pages visitées, items créés / modifiés / consultés).

## Handoffs prévus (qui passe quoi à qui, à quel moment)

| De     | Vers     | Quand     | Contenu                                            |
|--------|----------|-----------|----------------------------------------------------|
| Damien | Amandine | Lun PM    | Escalade ticket TK-42 (panne Wifi salle 3)         |
| …      | …        | …         | …                                                  |

## Réunions d'équipe

- **Lun 09:00 — Standup hebdomadaire** : tour de table 3 phrases (≥ 3 messages canal par persona, format `[STANDUP]`)
- **Jeu 14:00 — Point milieu** : revue blocages et risques (canal, format `[MILIEU]`)
- **Ven 16:00 — Debrief + handover weekend** : ce qui est livré, ce qui reste (canal, format `[DEBRIEF]`)

## Livrables hebdomadaires

- <Livrable 1> — owner : <persona>, deadline : <Jour PM>
- <Livrable 2> — …
```

**Extension au-delà d'1 semaine** : si la cible a des cycles métier > 5 jours (clôture mensuelle finance, paie, audit trimestriel, onboarding client long), dupliquer la grille sur S+1 et S+2 et marquer explicitement les **transitions inter-semaines** (objets reportés, décisions reprises, KPIs ré-évalués).

**Anti-pattern**. Ne JAMAIS générer un planning qui aplatit toutes les actions au J0 ou qui se contente d'une journée type "moyenne" — c'est exactement la violation Principe 9 que ce livrable existe pour empêcher.

---

## 5. Vue d'ensemble du pipeline

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  Phase 0 · Préparation environnement                          30 min    │
│  Entrées : 2 orgs, comptes, seeds, accès code                           │
│  Sortie : CAMPAIGN_ID, dossier _qa/<date>/, session agentdeck           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Phase 1 · Cartographie exhaustive                             1 h      │
│  Entrées : code source backend + frontend                               │
│  Sortie : 01-cartographie.md (endpoints × pages × MISS candidats)       │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Phase 2 · Smoke baseline                                      20 min   │
│  Entrées : cartographie + comptes                                       │
│  Sortie : pytest vert + 02-smoke-api.json (> 90% succès)                │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Phase 3 · Brief + spawn orchestrator                         15 min    │
│  Entrées : 00-personas.md + cartographie + smoke                        │
│  Sortie : orchestrator lancé, brief commun publié                       │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Phase 4 · Campagne exhaustive multi-personas                 4-6 h     │
│    4A — 2 personas séquentiels (vérif isolation)                        │
│    4B — parallèle contrôlé (max 3 simultanés)                           │
│    4C — auditeur de couverture + relance des gaps                       │
│  Entrées : briefs + cartographie                                        │
│  Sortie : reports/04-<persona>.md × N + 04-campagne.md                  │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Phase 5 · Tests cross-module (handoffs)                      1-2 h     │
│  Entrées : matrice handoffs du fichier personas                         │
│  Sortie : 05-handoffs.md (matrice × ✅/⚠️/❌)                            │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Phase 6 · Triage via claim-validator                       30-60 min   │
│  Entrées : tous les BUG rapportés                                       │
│  Sortie : 06-triage.md (confirmé / faux positif / investiguer)          │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Phase 7 · Consolidation Sprint S0                            30 min    │
│  Entrées : triage consolidé                                             │
│  Sortie : 07-executive.md + 07-sprint-s0.md + 07-backlog.md             │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Phase 8 · Sprint S0 (dev humain — hors méthodologie)         2-5 j     │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Phase 9 · Re-test post-fix + capitalisation                  1-2 h     │
│  Entrées : fixes Sprint S0 déployés                                     │
│  Sortie : 09-retest.md + mise à jour 08-apprentissages.md               │
└─────────────────────────────────────────────────────────────────────────┘
```

**Budget total hors Phase 8** : 9 h pour un module moyen, 18-24 h pour une application complète (typiquement distribué sur 2-3 jours calendaires avec pauses).

---

## 6. Phase 0 — Préparation environnement

### 6.1 Objectif

Garantir que les conditions techniques sont réunies avant de dépenser 6 heures de sub-agents. **Skipper cette phase = payer le coût en friction au milieu de la Phase 4.**

### 6.2 Entrées requises

- Spécification écrite (1 page) : "quel(s) module(s) tester, dans quel but, pour quelle deadline"
- URL de base de l'app
- Accès en lecture au code source (sauf mode black-box)
- Liste des comptes-personas disponibles (emails + passwords ou accès `secrets_get`)

### 6.3 Étapes pas-à-pas

**Étape 0 — VÉRIFIER QUE L'OUTILLAGE EST PRÊT** (obligatoire, bloquant)

Ne commence surtout pas la campagne sans cette étape. Voir §3ter complet.

Version courte — checklist minimale si agentdeck :
```bash
# 1. Proxy
curl -sS http://127.0.0.1:3000/health | grep -q ok || { echo "agentdeck DOWN"; exit 1; }

# 2. Chromium
cd G:\agentdeck && pnpm --filter @agentdeck/proxy exec playwright install chromium

# 3. DB migrée
ls G:\agentdeck\data\agentdeck.db >/dev/null 2>&1 || pnpm --dir G:\agentdeck db:migrate

# 4. Tools MCP visibles dans la session Claude
# → tester un appel innocuous :
#   mcp__agentdeck__list_procedures()
#   doit retourner sans erreur
```

Si mode dégradé :
```bash
npx playwright --version && python --version
```

**Si une vérification échoue**, `await_user_input` (ou stopper si autonome) au lieu de continuer. L'expérience montre que 2 h sont systématiquement perdues quand on skip cette étape (§3ter.5).

**Étape 1 — Générer le CAMPAIGN_ID**
```bash
# Version shell portable
CAMPAIGN_ID=$(python -c "import uuid; print(uuid.uuid4().hex[:8])")
echo $CAMPAIGN_ID > _qa/CAMPAIGN_ID.txt
```
Ou avec agentdeck :
```
mcp__agentdeck__project_memory_write({
  key: "campaign:current",
  value: { id: "<généré>", startedAt: "<ISO>", projectCible: "<nom>" }
})
```

**Étape 2 — Créer l'arborescence de livrables**
```bash
DATE=$(date +%Y-%m-%d)
mkdir -p _qa/$DATE/{reports,screenshots,evidence,irritants,exec}
touch _qa/$DATE/README.md   # sera mis à jour en live par l'orchestrator
```

**Étape 3 — Vérifier la cible**
```bash
curl -I <baseUrl> | head -3          # doit retourner 200
curl -I <baseUrl>/api/v1/health       # si endpoint de health existe
```

**Étape 4 — Identifier les 2 cibles (orgs ou envs)**
Documenter dans `_qa/<date>/00-targets.md` :
```markdown
| Tag | URL | Compte admin | Nature | Seeds confirmés |
|---|---|---|---|---|
| A | https://staging.app/org-a | admin@a.com | Primaire (compte dev) | oui |
| B | https://staging.app/org-b | admin@b.com | Seedée complète (IndusForge-like) | oui |
```

**Étape 5 — Smoke login 1 compte par persona**
Pour chaque persona identifié §4 :
```bash
curl -X POST <baseUrl>/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<email>","password":"<password>"}' \
  | jq -r '.accessToken' | head -c 20
```
Doit retourner un JWT non vide. Si 429 → attendre 60 s avant de continuer (cf. §1.4 apprentissages).

**Étape 6 — Rejouer les seeds si nécessaire**
Chaque projet a sa commande. Exemples :
- Flask : `flask seed-config`, `flask seed-rbac`, `flask seed-<projet>`
- Django : `python manage.py loaddata seeds.json`
- Rails : `bundle exec rails db:seed`
- Node + Prisma : `npx prisma db seed`

**Étape 7 — Définir les personas (si pas déjà fait)**
Voir §4. Produire `_qa/<date>/00-personas.md`.

**Étape 8 — Préparer le canal**

Avec agentdeck :
```
mcp__agentdeck__post_to_channel({
  channel: "qa-general",
  type: "campaign_start",
  payload: { campaignId: "...", startedBy: "orchestrator" }
})
```

Sans agentdeck :
```bash
touch _qa/$DATE/channel.jsonl
touch _qa/$DATE/dm.jsonl
echo "{\"ts\":\"$(date -Iseconds)\",\"from\":\"orchestrator\",\"type\":\"campaign_start\",\"payload\":{\"id\":\"$CAMPAIGN_ID\"}}" >> _qa/$DATE/channel.jsonl
```

**Étape 9 — Publier le brief commun**

Voir §17.1 pour le template complet. Stocker :
- Avec agentdeck : `project_memory_write({key: "qa-briefing-common", value: "..."})`
- Sans : fichier `_qa/<date>/00-briefing-common.md` lu par chaque persona en début de session

### 6.4 Sorties produites

| Fichier | Contenu | Consommé par |
|---|---|---|
| `_qa/<date>/CAMPAIGN_ID.txt` | UUID court | Toutes phases |
| `_qa/<date>/00-targets.md` | 2 orgs cibles documentées | Phase 2, 4, 6 |
| `_qa/<date>/00-personas.md` | Liste des personas + anatomie | Phase 3, 4, 5 |
| `_qa/<date>/00-briefing-common.md` | Brief règles communes à tous personas | Phase 4 |
| `_qa/<date>/channel.jsonl` (ou canal agentdeck) | Log des messages inter-agents | Phase 4, 5, 9 |

### 6.5 Gate de sortie Phase 0

- [ ] CAMPAIGN_ID généré et stocké
- [ ] Cible A et B répondent 200
- [ ] Smoke login OK pour TOUS les comptes-personas
- [ ] Seeds confirmés sur les 2 cibles
- [ ] Personas définis et documentés
- [ ] Brief commun publié
- [ ] Canal ouvert et écrivable

**Si un item échoue : STOP.** Ne pas démarrer Phase 1. Documenter le blocage dans `_qa/<date>/00-blockers.md` et résoudre avant de continuer.

### 6.6 Anti-patterns Phase 0

- ❌ Skipper l'étape 5 (smoke login) → on découvre en Phase 4 qu'un compte est désactivé, perte 2 h
- ❌ Utiliser le compte dev principal pour tester les suppressions → risque de supprimer des vraies données
- ❌ Réutiliser le CAMPAIGN_ID d'une campagne précédente → mélange les cleanups

### 6.7 Troubleshooting Phase 0

| Symptôme | Cause probable | Fix |
|---|---|---|
| `curl <baseUrl>` → 502 | App down | Relancer le serveur, vérifier les logs |
| Login 429 sur 3 comptes/5 | Rate-limit bucket global | `sleep 60` entre chaque login, ou admin bump rate-limit pour test IPs |
| `flask seed-*` échoue sur migration | Schema drift | `flask db upgrade` d'abord |
| Seeds passent mais comptes persona inexistants | Le script de seed ne crée pas les users | Ajouter manuellement, ou étendre le seed |
| Org B inexistante en multi-tenant | Pas créée | Utiliser `provisioning_service` ou endpoint admin pour la créer |

---

## 7. Phase 1 — Cartographie exhaustive

### 7.1 Objectif

Produire la **liste exhaustive** de ce qui existe à tester. Sans cette liste, impossible de mesurer la couverture (%endpoints, %pages) ni de détecter les MISS.

### 7.2 Entrées requises

- Sortie Phase 0 validée
- Accès en lecture au code source backend ET frontend
- Convention de framework connue (Flask? FastAPI? Express? Next? React? Vue?)

### 7.3 Étapes pas-à-pas

**Étape 1 — Cartographier le backend (endpoints)**

Avec agentdeck :
```
mcp__agentdeck__api_inventory({
  projectRoot: "<path-to-backend>",
  framework: "auto",           # ou "flask" | "fastapi" | "express" | "fastify"
  selfCheck: {
    baseUrl: "<baseUrl>",
    sampleSize: 30,
    threshold: 0.3             # >30% suspicious → suspectedParsingIssue
  }
})
```

Sans agentdeck, lancer un sub-agent Explore :
```
Agent({
  subagent_type: "Explore",
  description: "Cartographie backend endpoints <module>",
  prompt: """
    Cartographie exhaustive des endpoints du backend <path>.

    Pour chaque fichier sous <backend/routes|api|controllers> :
    1. Extraire method, path, handler function name
    2. Identifier permission required (décorateurs @require_permission, @jwt_required, ...)
    3. Identifier schema d'entrée (Marshmallow, Pydantic, zod)
    4. Noter blueprint prefix (Flask) ou router prefix (FastAPI/Express)

    Livrable : tableau markdown avec colonnes
    | Method | Path complet | Handler | Permission | Schema input | Fichier:ligne |

    Viser l'exhaustivité. Aucun "etc.".
  """
})
```

**Vérification post-inventory.** Si le projet a 70 endpoints documentés côté dev mais que l'inventaire en trouve 20, c'est qu'un pattern de routes n'a pas été détecté (ex: blueprint imbriqué, router lazy-loaded). Re-lancer en précisant le framework, ou compléter manuellement.

**Étape 2 — Cartographier le frontend (pages + appels API)**

En parallèle (même message) :
```
Agent({
  subagent_type: "Explore",
  description: "Cartographie frontend <module>",
  prompt: """
    Cartographie exhaustive du frontend <path>.

    Pour chaque route React (react-router, Next.js, TanStack Router) :
    - Path URL
    - Composant principal
    - Hooks data (useQuery, useSWR, etc.) avec les endpoints qu'ils appellent

    Pour chaque page :
    - Formulaires présents (champs, validation)
    - Actions exposées (boutons, menus)
    - Appels mutations (POST/PUT/DELETE)

    Croise avec la liste d'endpoints (input : voir étape 1).
    Produit 3 sections :
    a) Endpoints appelés par au moins une page
    b) Endpoints orphelins (API sans UI) → candidats MISS
    c) Pages sans appel API évident → bugs front ou pages légères
  """
})
```

**Étape 3 — Fusionner en un seul fichier**

L'orchestrator consolide les 2 sorties dans `_qa/<date>/01-cartographie.md` :

```markdown
# Cartographie — Campagne <CAMPAIGN_ID>

## 1. Endpoints backend (N au total)

### 1.1 Module <X> (M endpoints)
| Method | Path | Permission | Page UI associée | Persona attendu |
|---|---|---|---|---|
| GET | /api/v1/.../... | auth | /.../... | ... |
| POST | /api/v1/.../... | it:write | /.../... | ... |
...

## 2. Pages frontend (P au total)

### 2.1 Module <X> (Q pages)
| Path | Composant | Endpoints appelés | Persona cible |
|---|---|---|---|
| /tickets | TicketsList | GET /api/v1/tickets | it-service |
...

## 3. Endpoints orphelins (API sans UI) — candidats MISS

| Endpoint | Handler | Raison probable de non-usage UI |
|---|---|---|
| POST /api/v1/it/kb/suggest | suggest_kb() | Feature pas encore branchée dans le drawer création ticket |
...

## 4. Pages sans API évidente

| Page | Probable | À vérifier en Phase 4 |
|---|---|---|
| /settings/about | statique | Bug si appels cachés |

## 5. Endpoints à prioriser en test

Top 10 endpoints critiques (à tester en priorité) :
1. POST /api/v1/auth/login (chemin d'entrée)
2. POST /api/v1/<module>/create (cœur métier)
3. DELETE /api/v1/<module>/<id> (destructif, RBAC critique)
...
```

### 7.4 Sorties produites

| Fichier | Contenu | Taille typique |
|---|---|---|
| `_qa/<date>/01-cartographie.md` | Inventaire exhaustif endpoints + pages + MISS candidats | 800-1500 lignes |
| `_qa/<date>/01-cartographie.json` (optionnel) | Version machine-readable | ... |

### 7.5 Gate de sortie Phase 1

- [ ] `api_inventory.selfCheck.suspectedParsingIssue === false` (si agentdeck) OU l'inventaire manuel a été contrôlé contre un échantillon de routes connues
- [ ] Chaque page a au moins 1 endpoint identifié OU est marquée "statique/bug à vérifier"
- [ ] Au moins 3 candidats MISS identifiés (si 0 → cartographie frontend superficielle)
- [ ] Chaque endpoint est assigné à un persona attendu

**Si < 95 % d'endpoints matchés à une page ET < 95 % de pages matchées à un endpoint** : la cartographie est incomplète, re-lancer.

### 7.6 Anti-patterns Phase 1

- ❌ Se contenter de `ls backend/api/` → manque les routes dynamiques et les décorateurs custom
- ❌ Cartographier que le backend (pas le frontend) → rate les MISS
- ❌ Ne pas croiser backend × frontend → impossible de distinguer "API sans UI" (MISS) de "UI sans API" (bug front)
- ❌ Accepter "etc." dans le rapport → l'agent a sauté des items

### 7.7 Troubleshooting Phase 1

| Symptôme | Cause | Fix |
|---|---|---|
| `selfCheck` retourne 70% suspicious | Parsing cassé (blueprint mal résolu, ou BASE_URL incorrecte) | Forcer `framework` explicite, vérifier baseUrl |
| Explore livre 200 lignes au lieu de 1000 | Brief pas assez insistant sur l'exhaustivité | Re-prompter avec "EXHAUSTIF, zéro 'etc.', chemins de fichier avec line numbers" |
| Endpoints détectés ≠ endpoints réels (en + ou en -) | Routes générées dynamiquement (ex: Flask-RESTful, APIRouter lazy) | Cartographie live via `http <url>/api/docs` si Swagger, sinon grep des generators |

---

## 8. Phase 2 — Smoke baseline

### 8.1 Objectif

Vérifier que la base technique est **saine** avant de lancer 6 personas qui vont rapporter des 500 partout. Un test automatisé rapide (< 20 min) qui :
1. Confirme que les tests automatisés préexistants passent (pytest/jest/vitest)
2. Confirme que les endpoints CRUD basiques fonctionnent pour chaque persona

### 8.2 Entrées requises

- Sortie Phase 1 : liste d'endpoints
- Comptes-personas smoke-loggés (Phase 0)

### 8.3 Étapes pas-à-pas

**Étape 1 — Lancer les tests automatisés du projet**

```bash
# Backend Python
pytest tests/ -x --timeout=30 -q

# Ou Node
npm test -- --bail

# Ou Go
go test -short ./...
```

Si **échecs** : ne pas continuer. La baseline doit être verte. Fixer, puis relancer Phase 2.

**Étape 2 — Script API direct multi-personas**

Créer `_qa/<date>/exec/smoke-api.py` adapté au projet :

```python
#!/usr/bin/env python3
"""Smoke API multi-personas — Campagne <CAMPAIGN_ID>."""
import os, uuid, time, json, requests
from dataclasses import dataclass, asdict
from datetime import datetime

BASE = os.environ["BASE_URL"]
CAMPAIGN_ID = os.environ["CAMPAIGN_ID"]

PERSONAS = {
    # À adapter par projet (voir §4 et _qa/<date>/00-personas.md)
    "admin":       {"email": "admin@test.com",      "pwd": os.environ["ADMIN_PWD"]},
    "user":        {"email": "user@test.com",       "pwd": os.environ["USER_PWD"]},
    # ...
}

@dataclass
class TestCase:
    name: str
    method: str
    path: str
    persona: str
    body: dict | None = None
    expected: int = 200
    saves_as: str | None = None
    needs: list[str] | None = None

def login(session, persona_key):
    creds = PERSONAS[persona_key]
    for attempt in range(5):
        r = session.post(f"{BASE}/api/auth/login",
                         json={"email": creds["email"], "password": creds["pwd"]},
                         timeout=10)
        if r.status_code == 429:
            wait = float(r.headers.get("Retry-After", 15 * (attempt + 1)))
            time.sleep(wait)
            continue
        return r.json()["accessToken"]
    raise RuntimeError(f"Login failed for {persona_key}")

def run_case(session, tokens, fixtures, case: TestCase):
    # Substituer les fixtures dans le path
    path = case.path
    for fx_name, fx_val in fixtures.items():
        path = path.replace(f"{{{fx_name}}}", str(fx_val))
    url = f"{BASE}{path}"
    headers = {"Authorization": f"Bearer {tokens[case.persona]}"}
    start = time.time()
    r = session.request(case.method, url, headers=headers,
                       json=case.body, timeout=15)
    elapsed = int((time.time() - start) * 1000)
    ok = (r.status_code == case.expected)
    if ok and case.saves_as:
        try:
            fixtures[case.saves_as] = r.json()["data"]["id"]
        except Exception:
            pass
    return {
        "name": case.name, "persona": case.persona, "method": case.method,
        "path": path, "status": r.status_code, "elapsed_ms": elapsed,
        "ok": ok, "expected": case.expected,
        "response_preview": r.text[:300]
    }

def main():
    suffix = CAMPAIGN_ID
    cases = [
        # Happy path : login chaque persona → liste ressource de base
        TestCase("list_users_as_admin", "GET", "/api/v1/users", "admin"),
        # ...à compléter selon cartographie
        # Chaîne CRUD : create → read → update → delete
        TestCase("create_client", "POST", "/api/v1/clients", "admin",
                 body={"name": f"TEST-QA-{suffix}-client1"},
                 expected=201, saves_as="client_id"),
        TestCase("get_client", "GET", "/api/v1/clients/{client_id}", "admin"),
        TestCase("patch_client", "PATCH", "/api/v1/clients/{client_id}", "admin",
                 body={"phone": "0102030405"}),
        TestCase("delete_client", "DELETE", "/api/v1/clients/{client_id}", "admin"),
        # ...
    ]

    session = requests.Session()
    tokens = {p: login(session, p) for p in PERSONAS}
    fixtures = {}
    results = [run_case(session, tokens, fixtures, c) for c in cases]

    report = {
        "campaignId": CAMPAIGN_ID,
        "ranAt": datetime.utcnow().isoformat() + "Z",
        "baseUrl": BASE,
        "total": len(results),
        "ok": sum(1 for r in results if r["ok"]),
        "ko": sum(1 for r in results if not r["ok"]),
        "results": results,
    }
    with open(f"_qa/{os.environ['DATE']}/02-smoke-api.json", "w") as f:
        json.dump(report, f, indent=2)

    print(f"✅ {report['ok']}/{report['total']} ({100*report['ok']//report['total']}%)")

if __name__ == "__main__":
    main()
```

Exécution :
```bash
BASE_URL=https://staging.app \
CAMPAIGN_ID=$(cat _qa/<date>/CAMPAIGN_ID.txt) \
DATE=<date> \
ADMIN_PWD=$(pass show qa/admin) \
USER_PWD=$(pass show qa/user) \
python _qa/<date>/exec/smoke-api.py
```

**Étape 3 — Analyser le rapport**

Ouvrir `02-smoke-api.json`. Métriques cibles :
- `ok / total` ≥ 90 %
- Aucun 5xx inattendu
- Aucun 429 résiduel (tous retryés avec succès)

### 8.4 Sorties produites

| Fichier | Contenu |
|---|---|
| `02-smoke-api.json` | Rapport brut machine-readable |
| `02-smoke-api.md` (rendu optionnel) | Table markdown human-readable |
| pytest output | Console, + fichier si `--junitxml=_qa/<date>/02-pytest.xml` |

### 8.5 Gate de sortie Phase 2

- [ ] pytest : 0 échec
- [ ] smoke-api : `ok/total` ≥ 90 %
- [ ] Aucun 5xx dans les endpoints GET de base
- [ ] Tous les personas réussissent leur login

**Si < 90 % :** soit les seeds sont incomplets, soit un refactor est cassé. **Fixer avant de lancer 6 personas** sinon ils rapporteront tous le même 5xx × 8 → 48 faux irritants d'un coup.

### 8.6 Anti-patterns Phase 2

- ❌ Ignorer 1 échec pytest parce que "c'est un test flaky connu" → le Sprint S0 hérite du flaky
- ❌ Lancer le smoke sans retry 429 → faux positifs garantis sur rate-limit
- ❌ Tester uniquement le happy path → rate les bugs de RBAC et de validation

### 8.7 Troubleshooting Phase 2

| Symptôme | Cause | Fix |
|---|---|---|
| 429 en cascade malgré retry | Rate-limit agressif sur le bucket de login | Augmenter `wait`, ou demander au backend d'exempter l'IP de test |
| pytest échoue sur un test qui passe en local | Env var manquante en CI | Lister `pytest -vv --env-check` dans le CI |
| Tous les POST retournent 400 "validation" | Schéma changé, les fixtures du script sont obsolètes | Re-générer les fixtures depuis la cartographie Phase 1 |

---

## 9. Phase 3 — Brief + spawn orchestrator

### 9.1 Objectif

Préparer et lancer l'**orchestrator**, qui est le sub-agent chef qui coordonne les personas et tranche sur les décisions de gate. Avec agentdeck, l'orchestrator est **allégé** : il ne gère plus la mécanique de communication (faite nativement par le canal + DM + UI live) mais garde la **logique** de la campagne.

### 9.1bis Ce qu'agentdeck automatise (→ retiré du rôle orchestrator)

| Mécanique | Primitive qui la prend en charge | Conséquence pour l'orchestrator |
|---|---|---|
| Diffuser un status périodique | UI web `http://127.0.0.1:3000` montre tout live | Pas besoin d'instruire "publie status toutes les 5 min" |
| Relayer un message entre 2 agents | `post_to_channel` / `send_direct` sont directs | Pas besoin de forwarder |
| Attendre un événement spécifique | `wait_for_channel({predicate})` | Pas de polling manuel à coder dans l'orchestrator |
| Détecter qu'un persona est crashé | Heartbeat agentdeck + `agent.stopped` | Pas besoin de timeout manuel |
| Agréger les findings | `report_test_result` + query REST | Pas besoin de parser N fichiers markdown |
| Superviser la charge | UI live + métriques session | Pas besoin de dashboard custom |

### 9.1ter Ce que l'orchestrator fait encore (→ sa raison d'être)

1. **Lire la cartographie** et distribuer les mandats aux personas (1 brief personnalisé par persona)
2. **Décider des gates** entre phases : 4A→4B (isolation vérifiée), 4B→4C (1er tour terminé), 4C→5 (couverture ≥ 95 %), 5→6 (handoffs exécutés), 6→7 (triage validé)
3. **Relancer les gaps** identifiés par l'auditeur Phase 4C
4. **Déclencher le kill switch** si 2 anomalies convergent (§10.4) — logique, pas mécanique
5. **`await_user_input`** sur les blockers humains (taux faux positifs > 10 %, décision PO, etc.)
6. **Clore les phases** avec une annonce dans le canal

→ Le template §17.1 allège explicitement les instructions sur les mécaniques automatisées.

### 9.2 Entrées requises

- `00-personas.md`
- `01-cartographie.md`
- `02-smoke-api.json` validé
- Brief commun rédigé

### 9.3 Étapes pas-à-pas

**Étape 1 — Rédiger le brief commun** (si pas déjà fait Phase 0)

Voir §17.2 pour le template complet. Il doit contenir :
- Règles §2 (les 9 principes), en texte explicite que l'agent doit obéir
- CAMPAIGN_ID et préfixe à utiliser
- Format de rapport attendu
- Outillage à utiliser (avec ou sans agentdeck)
- Ce qui ne doit PAS être fait

**Étape 2 — Rédiger le brief spécifique de chaque persona**

Pour chaque persona identifié §4 :
```markdown
# Brief persona <Prénom> — Campagne <CAMPAIGN_ID>

(Copier les 6 sections §4.3 : identité, KPIs, connexion, pages, journée type, bug-hunter.)

## Mandat du jour
- Périmètre principal : <module>
- Endpoints à couvrir (extraits de 01-cartographie.md) : <liste>
- Pages à couvrir : <liste>
- 5 parcours métier P1-P5 : <décrits>

## Handoffs prévus
- Tu reçois un handoff de @<autre-persona> quand il poste `type: handoff` dans le canal #qa-general avec ciblage sur toi.
- Tu émets un handoff vers @<autre-persona> après <action>.

## Livrable
Fichier : `_qa/<date>/reports/04-<persona>.md` en 9 sections (voir format §16).
```

**Étape 3 — Lancer l'orchestrator**

Avec agentdeck :
```python
# L'orchestrator est le sub-agent "général" qui va spawn les autres
Agent({
  description: "QA Orchestrator - campagne <CAMPAIGN_ID>",
  subagent_type: "general-purpose",
  run_in_background: true,
  prompt: <template §17.3>
})
```

Sans agentdeck :
Même lancement, mais l'orchestrator utilise Playwright CLI + fichiers partagés au lieu des primitives MCP.

**Étape 4 — Vérifier que l'orchestrator démarre**

L'orchestrator doit publier dans le canal dans les 60 secondes :
```json
{"ts":"...","from":"orchestrator","type":"status","payload":{"phase":3,"status":"ready","nextAction":"spawn persona 1"}}
```

### 9.4 Sorties produites

| Fichier | Contenu |
|---|---|
| `03-briefs/common.md` | Brief commun |
| `03-briefs/persona-<name>.md` | Brief par persona |
| Orchestrator en cours d'exécution (background) |

### 9.5 Gate de sortie Phase 3

- [ ] Brief commun rédigé et publié
- [ ] Un brief par persona, avec mandat spécifique du jour
- [ ] Orchestrator lancé et "ready" dans le canal
- [ ] Orchestrator a confirmé avoir lu : `00-personas.md`, `01-cartographie.md`, `02-smoke-api.json`

### 9.6 Anti-patterns Phase 3

- ❌ Brief commun trop court (< 500 mots) → règles oubliées par les agents
- ❌ Brief commun trop long (> 3000 mots) → l'agent ne l'ancre pas en mémoire
- ❌ Ne pas briefer l'orchestrator sur comment réagir aux blockers → il freeze au 1er problème
- ❌ Laisser les briefs persona identiques (copier-coller) → pas de spécialisation, chacun teste tout et rien

### 9.7 Troubleshooting Phase 3

| Symptôme | Cause | Fix |
|---|---|---|
| Orchestrator ne publie rien dans le canal | Pas d'instruction de publier | Ajouter explicitement "post un status toutes les 5 min" |
| Orchestrator commence sans lire la carto | Brief ne force pas l'ordre | Numéroter les étapes dans le brief : "Étape 1 : lis X. Étape 2 : ..." |

---

## 10. Phase 4 — Campagne exhaustive

### 10.1 Objectif

**Exécuter la couverture exhaustive** endpoints × pages × parcours métier, via N personas travaillant en parallèle contrôlé dans des contextes browser isolés.

### 10.2 Entrées requises

- Orchestrator lancé et ready (Phase 3)
- Briefs personas prêts
- Cartographie Phase 1

### 10.3 Sous-phase 4A — Vérification isolation (séquentiel)

**Objectif** : valider empiriquement que `browser_new_context` isole vraiment avant de paralléliser.

Protocol :
1. Spawn Persona 1. Premier appel : `browser_new_context({reset: true})` → vérifier `isolated: true` dans la réponse.
2. Persona 1 se logue, crée 1 objet visible (ex: un ticket avec titre `TEST-QA-<ID>-p1-check`), note son identité via `GET /api/me`. Poste dans canal `{type: "iso-check-1", identity: "<email>", objectId: "<id>"}`.
3. Persona 1 termine (agent.stopped).
4. Spawn Persona 2 (persona différent). Premier appel : `browser_new_context({reset: true})`.
5. Persona 2 se logue, lit `GET /api/me` → doit retourner son propre email, **pas** celui de Persona 1.
6. Persona 2 liste les objets qu'il a créé → doit être vide, **pas** contenir celui de Persona 1.
7. Persona 2 poste dans canal `{type: "iso-check-2", identity: "<email>", sees_p1_object: false}`.

Si l'une des vérifications échoue :
- **STOP** toute la campagne.
- Investiguer : browser context partagé, cookies résiduels, ou bug agentdeck.
- Mitigation : revenir en séquentiel 100% jusqu'à ce que le bug d'isolation soit corrigé.

### 10.4 Sous-phase 4B — Parallèle contrôlé

**Objectif** : maximiser le débit sans réintroduire la contamination.

Règles :
- **Max 3 personas simultanés.**
- Chaque persona a son brief spécifique + son `browser_new_context`.
- Le canal est surveillé en temps réel par l'orchestrator.

Lancement :
```python
# Dans le même message orchestrator (parallèle)
spawn_agent(Persona3, brief=briefs["persona3"])
spawn_agent(Persona4, brief=briefs["persona4"])
spawn_agent(Persona5, brief=briefs["persona5"])
# Attendre qu'au moins 1 finisse pour en lancer un nouveau
```

**Kill switch orchestrator**. Dès que l'orchestrator détecte un des symptômes suivants, il KILL les 3 personas en cours et investigue :
- Même anomalie (même path + même status code) rapportée par 2 personas en < 1 minute
- Un persona rapporte "ma session s'est déconnectée" ou "je suis logué comme X alors que je suis Y"
- 429 concentrés sur un persona alors que les autres n'ont rien
- Taux de succès qui chute > 20 % en < 5 min

### 10.5 Sous-phase 4C — Auditeur de couverture + relance

Après le 1er tour (tous personas ont terminé leur mandat initial), un sub-agent **auditeur** est lancé :

```
Agent({
  description: "Audit couverture Phase 4",
  subagent_type: "general-purpose",
  prompt: """
    Input :
    - _qa/<date>/01-cartographie.md (endpoints + pages attendus)
    - _qa/<date>/reports/04-*.md (ce qui a été couvert)
    - _qa/<date>/channel.jsonl (les handoffs et status)

    Produis _qa/<date>/04c-gaps.md :
    - Endpoints jamais touchés par aucun persona
    - Pages jamais chargées
    - Parcours métier non joués
    - Handoffs non exécutés

    Recommandation par gap :
    - Quel persona doit le couvrir (relance spécifique)
    - Effort estimé (5 min / 15 min / 30 min)
    - Priorité (P0/P1/P2)
  """
})
```

L'orchestrator **relance les personas sur les gaps P0** jusqu'à ce que `04c-gaps.md` ne contienne plus que des P2 acceptés.

Critères d'arrêt :
- Couverture endpoints ≥ 95 %
- Couverture pages = 100 %
- Tous les parcours P1-P5 joués par au moins 1 persona

### 10.6 Pendant la Phase 4 — rôle de chaque persona

Routine de chaque persona (dans l'ordre) :

1. **Init** : `browser_new_context({reset: true})`, vérifier isolation.
2. **Lecture** : channel récent (20 derniers messages), mémoire projet (fixtures créées).
3. **Login** : avec les credentials du brief, via UI (préférable pour voir les frictions login) ou via API direct si UI est flaky.
4. **Cartographie perso** : parcourir toutes les pages du périmètre une fois pour "voir le terrain", prendre captures.
5. **Parcours métier P1-P5** : exécuter chaque parcours, noter frictions/bugs/MISS.
6. **Exhaustivité résiduelle** : pour chaque endpoint de la carto non encore touché, faire un test minimal (via UI si le bouton existe, via `fetch()` depuis la console sinon).
7. **Handoffs** : quand un autre persona attend une donnée, la créer et `post_to_channel` avec `type: "handoff"`.
8. **Cleanup** : supprimer tous les `TEST-QA-<ID>-*` créés.
9. **Rapport final** : écrire `reports/04-<persona>.md` en 9 sections (§16).
10. **`report_test_result`** pour chaque BUG/UX/MISS (si agentdeck) OU append dans `findings.jsonl` (mode dégradé).

### 10.7 Astuce gain de temps : "bearer token reuse"

Dans le mandat de chaque persona, ajouter :

```markdown
## Astuce performance

Pour les endpoints purement API (qui ne nécessitent pas l'UI), après login UI :
1. Ouvre DevTools > Application > Cookies, note le access_token
2. Utilise `fetch()` depuis la console :
   ```js
   const token = "eyJhbGc...";
   const r = await fetch('/api/v1/.../...', {
     headers: { 'Authorization': `Bearer ${token}` }
   });
   console.log(r.status, await r.json());
   ```
Cela te permet de couvrir 50+ endpoints en 15 min au lieu de 1 h via UI seule.

Mais : tout endpoint qui a un formulaire UI doit aussi être testé via UI
(pour capter les frictions front-end que `fetch()` ne voit pas).
```

### 10.8 Sorties produites

| Fichier | Contenu |
|---|---|
| `reports/04-<persona>.md` × N | 1 rapport structuré par persona |
| `04-campagne.md` | Synthèse orchestrator (consolidation) |
| `04c-gaps.md` | Gaps identifiés + relances effectuées |
| `screenshots/<persona>-<NN>-<description>.png` × 50-80 par persona |
| `channel.jsonl` | Trace complète des handoffs |
| `findings.jsonl` (mode dégradé) OU `report_test_result` calls | Tous les BUG/UX/MISS |

### 10.9 Gate de sortie Phase 4

- [ ] Isolation vérifiée empiriquement (Sous-phase 4A passée)
- [ ] Couverture endpoints ≥ 95 %
- [ ] Couverture pages = 100 %
- [ ] P1-P5 joués pour chaque persona
- [ ] Tous personas ont fait leur cleanup
- [ ] Kill switch pas déclenché plus de 1 fois (si 2+ : méthodologie cassée, investiguer)

### 10.10 Anti-patterns Phase 4

- ❌ Sauter la Sous-phase 4A "parce que c'est du temps perdu" → découvrir 4 h plus tard que tout était contaminé
- ❌ Pousser à 6 personas en parallèle → le kill switch se déclenche, relance tout
- ❌ Brief persona = 10 lignes génériques → rapport creux, non exploitable
- ❌ Laisser les personas "explorer librement" → pas d'exhaustivité garantie
- ❌ Ne pas faire la Sous-phase 4C (auditeur) → croire qu'on a tout couvert alors que 30 % manque

### 10.11 Troubleshooting Phase 4

| Symptôme | Cause | Fix |
|---|---|---|
| Persona rapporte "identité ≠ attendue" | Browser context partagé | Stop, vérif isolation, retour 4A |
| Persona se bloque sur un rate-limit 429 | Bucket partagé avec les autres personas | Augmenter le délai entre logins, ou rate-limit exempt IP de test |
| 2 personas rapportent la même anomalie | Probable contamination OU vrai bug | `validate_claim` → si reproduit hors browser = vrai bug, sinon contamination |
| Orchestrator ne relance jamais les gaps | Brief orchestrator incomplet | Ajouter "après que tous aient fini, lance l'auditeur et relance les P0" |
| Taux de succès > 95 % mais zéro bug rapporté | Agents pas en mode bug-hunter | Re-prompt avec les 5 questions explicites |

---

## 11. Phase 5 — Handoffs

### 11.1 Objectif

Capter les **bugs cross-module** : ceux qui n'apparaissent que lorsque 2 personas coopèrent (ex: commercial crée devis → magasinier doit voir la dispo stock).

### 11.2 Entrées requises

- Fin de Phase 4
- Matrice de handoffs définie dans `00-personas.md`

### 11.3 Matrice de handoffs — exemples

| # | Déclencheur | Action | Récepteur | Assertion attendue |
|---|---|---|---|---|
| H1 | Commercial | Crée devis DEV-X | Magasinier | Dispo stock reflète la réserve |
| H2 | RH | Crée employé E-X | Admin | Bouton "Inviter" visible sur E-X dans /admin/users |
| H3 | Technicien | Escalade ticket T-X vers maintenance | Maintenance | Intervention I-X créée auto avec lien ticket |
| H4 | Chef projet | Alloue tâche à ressource R-X | RH | Allocation apparaît dans /rh/ressources/R-X |
| H5 | Magasinier | Réception livraison L-X | Finance | Engagement comptable se solde |

À adapter complètement selon le domaine métier du projet.

### 11.4 Pattern d'exécution d'un handoff

```python
# Étape 1 : Persona A déclencheur
spawn_agent(PersonaA, brief=f"""
  Ta mission unique :
  1. browser_new_context reset
  2. Login
  3. Crée l'objet <X> avec préfixe TEST-QA-<CID>-handoff-H1
  4. Poste dans canal:
     {{type: "handoff", handoff: "H1", from: "A", to: "B",
       payload: {{objectId: "<id>", expectsCheck: "dispo stock à jour"}}}}
  5. Stop.
""")
# Attendre agent.stopped ET le handoff dans le canal

# Étape 2 : Persona B récepteur (nouveau BrowserContext)
spawn_agent(PersonaB, brief=f"""
  Ta mission unique :
  1. browser_new_context reset
  2. Login (tu es bien PersonaB, pas PersonaA)
  3. Lis le canal, trouve le handoff H1 ciblé vers toi
  4. Vérifie l'assertion : <extraite du handoff>
  5. Verdict ✅/⚠️/❌ avec preuve (capture + network log)
  6. Poste dans canal:
     {{type: "handoff_result", handoff: "H1", verdict: "✅"|"⚠️"|"❌",
       evidence: {{screenshot: "...", networkLog: "..."}}}}
""")
```

### 11.5 Sorties produites

| Fichier | Contenu |
|---|---|
| `05-handoffs.md` | Matrice H1..Hn × ✅/⚠️/❌ × détail |
| Captures dédiées par handoff | screenshots/handoff-H<N>-<persona>.png |

### 11.6 Gate de sortie Phase 5

- [ ] Chaque handoff défini a été exécuté OU marqué N/A avec raison
- [ ] Chaque ❌ a une preuve (capture + network + hypothèse de cause)
- [ ] Les ⚠️ sont documentés (partiel = pourquoi)

### 11.7 Anti-patterns Phase 5

- ❌ Tester un handoff avec le même persona qui joue les 2 rôles → manque la validation de vision croisée
- ❌ Ne pas isoler les browser contexts → A et B partagent les cookies → B voit tout parce qu'il est resté logué comme A
- ❌ Oublier de cleanup l'objet créé par A → pollue les tests suivants

### 11.8 Troubleshooting Phase 5

| Symptôme | Cause | Fix |
|---|---|---|
| B ne voit pas l'objet créé par A | Délai de cache / async (SSE, background job) | Attendre 30 s, réessayer, documenter le délai comme UX-* |
| B voit l'objet mais champs incomplets | Modèle FK partielle | BUG cross-module, `validate_claim` côté B |
| A ne poste pas son handoff | Brief A pas explicite sur le format | Re-prompter A avec le JSON schema du canal |

---

## 12. Phase 6 — Triage

### 12.1 Objectif

Passer **chaque finding** par `validate_claim` pour distinguer :
- **BUG confirmé** : reproduit server-side, hors browser
- **Faux positif** : ne se reproduit pas, analyse de cause
- **À investiguer** : résultats non déterministes (race conditions, rate-limit, état transitoire)

Cette phase fait passer le taux de faux positifs de ~4 % à < 2 %.

### 12.2 Entrées requises

- Fin des Phases 4 et 5
- Tous les findings dans `report_test_result` (agentdeck) ou `findings.jsonl`

### 12.3 Le claim-validator sub-agent

Un sub-agent dédié, **lancé en parallèle de la Phase 4** ou juste après :

```
Agent({
  description: "Claim Validator - Campagne <CID>",
  subagent_type: "general-purpose",
  prompt: """
    Tu es le Claim Validator. Tu ne testes rien toi-même. Tu valides les findings.

    Pour chaque entrée dans _qa/<date>/findings.jsonl (OU report_test_result) :

    SI type == "bug":
      1. Extraire {method, path, body, persona, expectedStatus, observedStatus}
      2. Appeler validate_claim({
           method, path, body,
           asPersona: <persona>,
           expectedStatus: observedStatus,  # on veut reproduire ce qui a été VU
           maxRetries: 3,
           maxBackoffMs: 60000
         })
      3. Comparer :
         - result.status == observedStatus → CONFIRMED
         - result.status == expectedStatus → FALSE_POSITIVE (bug disparaît server-side)
         - result retourne 429 après 3 retry → TO_INVESTIGATE
         - result throws → TO_INVESTIGATE

    SI type == "ux":
      Dédupliquer : 2 UX avec même page + titre similaire (Levenshtein > 80%) = doublon.
      Garder le plus complet, référencer l'autre.

    SI type == "miss":
      Confirmer :
      - L'endpoint existe et répond (validate_claim sur un GET de la ressource)
      - L'UI ne l'appelle effectivement pas (grep dans frontend/src)

    Livrable : _qa/<date>/06-triage.md

    Colonnes :
    | ID | type | module | statut triage | reproduit server | cause probable faux positif | verdict final |

    En fin de document, une section "Causes de faux positifs" qui groupe par type :
    - Browser context partagé
    - Rate-limit
    - État d'org incomplet
    - Refresh token expiré
    - Autre
  """
})
```

### 12.4 Règles de déduplication

Deux findings sont **le même** si :
1. Même page OU endpoint
2. Même nature d'assertion cassée (status, message, élément DOM)
3. Rapportés à < 5 min d'intervalle OU par 2 personas qui se sont relayés sur la même zone

→ Garder celui du persona principal du module. Référencer l'autre en annexe.

### 12.5 Output Phase 6

Structure stricte du `06-triage.md` :

```markdown
# Triage — Campagne <CID>

## Synthèse
- Total findings : N
  - BUG : NB (confirmés : NBc / faux positifs : NBf / à investiguer : NBi)
  - UX : NU (uniques après dédup : NUd)
  - MISS : NM

## Taux de faux positifs
= NBf / (NBc + NBf) = X%
Cible < 2%. Statut : ✅ / ⚠️ / ❌

## BUG confirmés (à traiter)
| ID | Module | Sévérité | Page/Endpoint | Evidence validate_claim |
| BUG-IT-005 | IT | P0 | POST /it/assets/<id>/software | status 201 reproduit, used_seats=2>total=1 |
...

## Faux positifs identifiés (clôturés)
| ID | Cause | Leçon |
| BUG-CRM-042 | Cookie resté d'un autre persona | Renforcer §1 |
...

## À investiguer (triage manuel requis)
| ID | Raison |
| BUG-ST-017 | 3x 429 server-side, ne peut pas reproduire hors rate-limit |
...

## UX (après dédup)
| ID | Page | Nature |
...

## MISS (confirmés)
| ID | Endpoint | Page qui devrait l'appeler |
...

## Causes de faux positifs (apprentissages)
Ajouts à proposer pour 08-apprentissages.md :
- ...
```

### 12.6 Gate de sortie Phase 6

- [ ] 100 % des BUG passés par `validate_claim`
- [ ] Déduplication UX effectuée
- [ ] Vérification MISS (endpoint existe + UI ne l'appelle pas)
- [ ] Taux de faux positifs < 4 % (si > 4 % : méthodologie cassée, investiguer)

### 12.7 Anti-patterns Phase 6

- ❌ Croire tous les BUG sans validation → 10-20 % de faux positifs dans Sprint S0
- ❌ Dédupliquer UX avec seuil de similarité trop strict (> 95 %) → garde 20 doublons
- ❌ Classer "à investiguer" tout ce qui n'est pas reproductible immédiatement → surcharge Sprint S0

### 12.8 Troubleshooting Phase 6

| Symptôme | Cause | Fix |
|---|---|---|
| `validate_claim` retourne 401 systématique | Le token du persona n'est pas fourni ou expiré | Re-générer tokens via login silencieux dans le validator |
| Taux de faux positifs > 10 % | Règle §1 ou §4 violée en Phase 4 | Investiguer, remédier, relancer Phase 4 partielle |
| Beaucoup de "TO_INVESTIGATE" (rate-limit) | Test fait pendant un vrai trafic | Relancer la validation hors heures de pointe OU avec un rate-limit bump |

---

## 13. Phase 7 — Consolidation

### 13.1 Objectif

Transformer le triage en **3 livrables** prêts à être présentés au PO et exécutés par l'équipe dev.

### 13.2 Entrées requises

- `06-triage.md` validé
- Effort estimé pour chaque bug confirmé (par l'orchestrator ou un tech lead)

### 13.3 Livrable 1 — 07-executive.md (1 page PO)

```markdown
# Rapport exécutif — Campagne <CID> — <date>

## TL;DR (1 phrase)
Module <X> présente <N> bugs dont <K> bloquants, <M> frictions UX, <P> manques fonctionnels.
Recommandation : Sprint S0 de <E> j-h.

## Score global
- Couverture endpoints : 95%
- Couverture pages : 100%
- Taux de faux positifs : 1.8%

## Top 5 forces du module
- <Force 1>
- ...

## Top 10 bugs confirmés (priorisés)
(voir 07-sprint-s0.md pour détail)

## 3 options Sprint S0 au choix
- **Option A** : complet (top-10, ~8 j-h) — recommandé
- **Option B** : bloquants seulement (top-4, ~3 j-h)
- **Option C** : report, traite hors sprint

## Risques si non traité
- <Risque 1 - quantifié si possible>
- ...

## Documents joints
- 07-sprint-s0.md (brief dev)
- 07-backlog.md (items P1/P2)
- reports/04-*.md (détail par persona)
```

### 13.4 Livrable 2 — 07-sprint-s0.md (brief dev exécutable)

Format (§05 §7.6 repo) :
```markdown
# Sprint S0 — Campagne <CID>

## Contexte
<1 paragraphe>

## Items à traiter (top-10 priorisés)

### Item 1 — BUG-IT-005 : bloquer install au-delà du total_seats

**Priorité** : P0 backend
**Effort** : 1 j-h
**Impact** : conformité (risque audit Microsoft/Adobe)

**Repro** :
1. POST /api/v1/it/licenses { total_seats: 1 }
2. POST /api/v1/it/assets/<id1>/software avec cette licence
3. POST /api/v1/it/assets/<id2>/software avec la même licence
4. Observé : 201 (alors que devrait être 409)

**Fix suggéré** :
```python
def install_software(license_id, asset_id):
    with db.session.begin_nested():
        license = SoftwareLicense.query.with_for_update().get(license_id)
        if license.used_seats >= license.total_seats:
            raise ConflictError("Saturation licence")
        license.used_seats += 1
        ...
```

**Test de non-régression** :
```python
def test_install_blocked_when_saturated(client, admin_headers):
    license = LicenseFactory(total_seats=1)
    # 1er install OK
    r1 = client.post(f"/.../{license.id}", ...)
    assert r1.status_code == 201
    # 2e install bloqué
    r2 = client.post(f"/.../{license.id}", ...)
    assert r2.status_code == 409
```

**Validation** : re-test Phase 9 avec `validate_claim` sur même payload.

---

### Item 2 — ...
(même structure)
```

### 13.5 Livrable 3 — 07-backlog.md (items P1/P2)

Items hors top-10, triés par module et sévérité. Feed le backlog produit.

### 13.6 Gate de sortie Phase 7

- [ ] Top-10 validé par un humain (senior dev ou tech lead)
- [ ] Effort estimé sur chaque item
- [ ] 3 options présentées au PO
- [ ] PO a choisi une option (si synchrone) OU a reçu la demande (si async)

### 13.7 Anti-patterns Phase 7

- ❌ Top-10 sans effort chiffré → PO ne peut pas décider
- ❌ "Option A uniquement" → PO perd le choix, risque de rejet
- ❌ Mélanger BUG et MISS dans le top-10 → MISS n'est pas un hotfix

### 13.8 Troubleshooting Phase 7

| Symptôme | Cause | Fix |
|---|---|---|
| Top-10 contient 20 items | Pas assez de priorisation | Demander au tech lead de trancher |
| PO rejette les 3 options | Effort trop élevé pour la fenêtre | Proposer Option D : 3 bloquants seulement, 1 j |

---

## 14. Phase 8 — Sprint S0

### 14.1 Objectif

Dev humain exécute le brief de Phase 7. **Hors méthodologie**, mais 2 règles pour que la Phase 9 fonctionne :

1. Chaque PR référence le `BUG-XX-NNN` en titre ou description.
2. Chaque PR inclut le test de non-régression suggéré (ou équivalent).

### 14.2 Durée

2-5 jours selon l'effort total. Ce n'est pas à la méthodologie de le borner.

---

## 15. Phase 9 — Re-test

### 15.1 Objectif

Vérifier, **item par item**, que les fixes du Sprint S0 sont effectifs, ET qu'aucune régression nouvelle n'est apparue.

### 15.2 Entrées requises

- Sprint S0 déployé sur la cible de test
- `07-sprint-s0.md` avec chaque item traçable

### 15.3 Étapes pas-à-pas

**Étape 1 — Re-validation item par item**

Sub-agent :
```
Agent({
  description: "Re-test Sprint S0",
  subagent_type: "general-purpose",
  prompt: """
    Input : _qa/<date>/07-sprint-s0.md

    Pour chaque item :
    1. Relire la section Repro
    2. Appeler validate_claim avec les MÊMES paramètres
    3. Verdict :
       - Status observé == status attendu après fix → ✅
       - Partiellement OK (amélioration mais pas fix total) → ⚠️
       - Status identique au bug d'origine → ❌
    4. Pour ⚠️ et ❌, screenshot + détail

    Livrable : _qa/<date>/09-retest.md
    Table : | # | BUG | Avant (status d'origine) | Après | Verdict | Détail |
  """
})
```

**Étape 2 — Non-régression**

Rejouer les 5 parcours métier P1-P5 d'un des personas principaux :
```
Agent({
  description: "Non-régression P1-P5",
  subagent_type: "general-purpose",
  prompt: """
    browser_new_context reset.
    Login comme <persona>.
    Rejoue P1, P2, P3, P4, P5 tels que décrits dans reports/04-<persona>.md.
    Tag chaque étape ✅ si identique, ⚠️ si différent mais fonctionnel, ❌ si cassé.

    Livrable : _qa/<date>/09-non-regression.md
  """
})
```

**Étape 3 — Rétrospective de l'orchestrator** (OBLIGATOIRE — bloquant)

Avant la clôture, l'orchestrator soumet sa rétrospective via le tool dédié.
**agentdeck refuse `end_campaign` sans rétrospective** — c'est un gate dur,
pas une recommandation. Le but : éviter qu'une campagne soit close à la
hâte sans extraire les apprentissages, et alimenter le benchmark inter-campagnes.

```
mcp__agentdeck__submit_campaign_retrospective({
  campaignId: "<id de start_qa_campaign>",
  whatWentWell: "<2-5 paragraphes : ce qui a fonctionné>",
  whatWentBadly: "<2-5 paragraphes : frictions, blocages, ratés>",
  keyLearnings: "<3-7 leçons concrètes>",
  toolingFeedback: "<retour critique sur agentdeck : primitives utiles, manquantes, bugs rencontrés>",
  recommendations: "<3-5 recommandations pour la prochaine campagne>"
})
```

Conseils pour rédiger chaque section :
- **whatWentWell** : citer des exemples spécifiques (un persona qui a brillé, un handoff fluide).
  Ne pas se contenter de "bon dans l'ensemble".
- **whatWentBadly** : nommer les choses. "Le persona magasinier a mis 40 min à comprendre
  qu'il devait utiliser browser_new_context — son brief n'était pas assez explicite."
- **keyLearnings** : leçons applicables à un autre projet, pas juste à celui-ci.
- **toolingFeedback** : ce que tu aurais aimé qu'agentdeck fasse mieux. Cette section
  guide les évolutions agentdeck — sois sincère et précis.
- **recommendations** : actions concrètes pour la campagne suivante (ex: "ajouter
  un sub-agent dédié au monitoring du canal pendant Phase 4B").

**Étape 4 — Clôture campagne**

```
mcp__agentdeck__end_campaign({ campaignId, status: "completed" | "aborted" | "failed" })
```

**Étape 5 — Capitalisation**

Mettre à jour `08-apprentissages.md` :
- Nouvelles causes de faux positifs identifiées (§3)
- Nouveaux anti-patterns si observés (§2)
- Nouveaux patterns qui ont bien fonctionné (§4)
- Chiffres de la campagne (§6)

Et pousser les métriques numériques au tracker agentdeck (au fil de l'eau pendant
la campagne, pas seulement à la fin) :
```
mcp__agentdeck__record_campaign_metric({ campaignId, name: "coverage_endpoints", value: 0.97 })
mcp__agentdeck__record_campaign_metric({ campaignId, name: "coverage_pages", value: 1.0 })
mcp__agentdeck__record_campaign_metric({ campaignId, name: "bugs_confirmed", value: 14 })
mcp__agentdeck__record_campaign_metric({ campaignId, name: "bugs_false_positive", value: 2 })
mcp__agentdeck__record_campaign_metric({ campaignId, name: "ux_unique", value: 9 })
mcp__agentdeck__record_campaign_metric({ campaignId, name: "miss_confirmed", value: 11 })
mcp__agentdeck__record_campaign_metric({ campaignId, name: "duration_hours", value: 9.5 })
```

Visualiser l'historique des campagnes : http://127.0.0.1:3000/campaigns
(toutes les campagnes, tous CLIs confondus — Claude Code, autres CLIs MCP-compat,
script externe via REST `/campaigns`).

### 15.4 Sorties produites

| Fichier | Contenu |
|---|---|
| `09-retest.md` | Verdict item par item |
| `09-non-regression.md` | P1-P5 rejoués |
| Mise à jour `08-apprentissages.md` | Nouveaux apprentissages |

### 15.5 Gate de sortie Phase 9 (= fin de campagne)

- [ ] Chaque item Sprint S0 a un verdict ✅/⚠️/❌
- [ ] P1-P5 rejoués sans ❌ nouveau
- [ ] Apprentissages ajoutés à `08-apprentissages.md`
- [ ] Métriques stockées

### 15.6 Anti-patterns Phase 9

- ❌ Sauter le re-test parce que "les devs ont fait le job" → 20 % des fixes sont partiels
- ❌ Ne pas capitaliser → la prochaine campagne refait les mêmes erreurs

---

## 16. Conventions transverses

### 16.1 Nommage CAMPAIGN_ID

Format : `uuid4().hex[:8]` (8 caractères hex, ex: `03f0b1f2`).
Stocké dans :
- `_qa/<date>/CAMPAIGN_ID.txt` (fallback)
- `project_memory` sous `campaign:current` (agentdeck)

### 16.2 Nommage des objets de test

`TEST-QA-<CAMPAIGN_ID>-<description-courte-avec-tirets>`

Exemples :
- `TEST-QA-03f0b1f2-wifi-salle-reunion`
- `TEST-QA-03f0b1f2-client-acme`

### 16.3 Numérotation des findings

| Type | Pattern | Exemple |
|---|---|---|
| Bug | `BUG-<MODULE>-NNN` | `BUG-IT-005` |
| Friction UX | `UX-<MODULE>-NNN` | `UX-IT-001` |
| Manque fonctionnel | `MISS-<MODULE>-NNN` | `MISS-IT-002` |
| Bug d'état (pas de code) | `STATE-BUG-<MODULE>-NNN` | `STATE-BUG-CRM-001` |

Numérotation incrémentale par module, reset à chaque campagne. Pour traçabilité inter-campagne, préfixer le CAMPAIGN_ID : `<CID>-BUG-IT-005`.

### 16.4 Convention de capture d'écran

Format : `<module>-<type>-<NN>-<description-courte>.png`

Exemples :
- `it-page-03-tickets-list.png`
- `it-flow-12-create-ticket-no-toast.png`
- `handoff-H1-magasinier-dispo-stock.png`

### 16.5 Structure standard d'un rapport persona (9 sections)

```markdown
# Rapport — <Persona> — Campagne <CID> — <date>

## 0. Synthèse exécutive
- Couverture endpoints : N/M
- Couverture pages : N/M
- Findings par sévérité (P0/P1/P2)
- Verdict : ✅ OK / ⚠️ à surveiller / ❌ critique

## 1. Couverture backend (matrice)
| Endpoint | Method | Status observé | Verdict | Détail |

## 2. Couverture frontend (matrice)
| Page | Action | Verdict | Capture | Détail |

## 3. Bugs détectés
### BUG-XX-NNN — titre
- Sévérité, page/endpoint, repro, attendu, observé, capture, hypothèse cause

## 4. Frictions UX
### UX-XX-NNN — titre

## 5. Manques fonctionnels
### MISS-XX-NNN — titre

## 6. Parcours métier P1-P5
### P1 — <nom>
| Étape | Statut | Détail |

## 7. Console errors & network
(extrait browser_console_messages + browser_network_requests)

## 8. Captures (chemins absolus)

## 9. Recommandations top-N
```

### 16.6 Format canal JSONL

```json
{"ts":"2026-04-25T14:32:15Z","from":"amandine","to":"@damien","type":"handoff","handoffId":"H1","payload":{"ticketId":"TK-42","action":"please_assign"}}
{"ts":"2026-04-25T14:35:00Z","from":"damien","to":"#qa-general","type":"status","payload":{"progress":"P1 complete","coverage":0.45}}
{"ts":"2026-04-25T14:40:22Z","from":"orchestrator","to":"#qa-general","type":"blocker","payload":{"reason":"2 personas same 429","action":"kill_all"}}
```

Types reconnus : `campaign_start`, `status`, `handoff`, `handoff_result`, `finding`, `blocker`, `question`, `answer`, `iso-check-1`, `iso-check-2`.

### 16.7 Format findings JSONL (mode dégradé)

```json
{"id":"BUG-IT-001","type":"bug","module":"it","persona":"amandine","severity":"P1","page":"/it/tickets","endpoint":"POST /api/v1/it/tickets","expected":201,"observed":500,"body":{...},"evidence":{"screenshot":"screenshots/it-flow-05-500.png","networkLog":"..."}}
{"id":"UX-IT-001","type":"ux","module":"it","persona":"amandine","page":"/it/tickets","title":"Pas de toast après création"}
{"id":"MISS-IT-001","type":"miss","module":"it","endpoint":"POST /api/v1/it/kb/suggest","expectedUiPage":"/it/tickets drawer création"}
```

---

## 17. Templates de prompts

### 17.1 Template orchestrator (version allégée avec agentdeck)

```
Tu es le QA Orchestrator pour la campagne <CAMPAIGN_ID>.

Ton rôle : piloter la logique de la campagne (mandats, gates, relances,
décisions). La mécanique de communication (canal, DM, supervision live)
est gérée nativement par agentdeck — ne duplique pas ce travail.

État de départ :
- Phase 0 validée (lire _qa/<date>/00-*.md via sandbox_read)
- Cartographie à lancer : Phase 1
- Personas définis : voir _qa/<date>/00-personas.md

ÉTAPE 0 OBLIGATOIRE — Vérifier agentdeck (cf. §3ter.2)
Si un item échoue → await_user_input immédiat, ne démarre RIEN.

Puis les phases, dans l'ordre :

1. Phase 1 : api_inventory + 2 sub-agents Explore (backend + frontend)
   en parallèle. Consolide dans 01-cartographie.md. Gate : selfCheck OK +
   couverture mutuelle ≥ 95 %.

2. Phase 2 : exécute smoke-api.py. Gate : succès > 90 %.
   Sinon await_user_input.

3. Phase 3 : écris un brief par persona (§17.4), stocke le brief commun
   dans project_memory_write({key: "qa-briefing-common"}).
   Publie {type: "phase_ready", phase: 3} dans le canal.

4. Phase 4A : spawn Persona 1 séquentiel, wait_for_channel type="iso-check-1".
   Spawn Persona 2, wait_for_channel type="iso-check-2".
   Vérifie empiriquement l'isolation (Persona 2 ne voit pas les objets de 1).
   Gate : isolation confirmée → passer 4B. Sinon STOP.

5. Phase 4B : parallèle × 3 personas max. Lance-les dans le même tool call.
   Surveille le canal en lisant toutes les 2 min (read_channel limit=30).
   KILL SWITCH (logique à toi) : si 2 findings avec (même page + même
   status code) arrivent en < 60 s, request_agent_cancel sur tous les
   personas en cours ET await_user_input avec contexte.

6. Phase 4C : quand tous ont émis agent.stopped, lance l'auditeur §17.6.
   Lis 04c-gaps.md. Relance les personas sur les gaps P0 (un par un,
   brief ciblé). Répète jusqu'à couverture endpoints ≥ 95 %, pages = 100 %.

7. Phase 5 : pour chaque handoff de 00-personas.md, pattern §11.4.
   Tu peux lancer le claim-validator §17.5 en parallèle dès Phase 4B
   (il consomme report_test_result au fil de l'eau).

8. Phase 6 (si pas déjà fini) : attend que le claim-validator termine.
   Lis 06-triage.md. Gate : taux faux positifs < 4 %.
   Si > 4 % → await_user_input (méthodologie cassée, règle §1 ou §4 violée).

9. Phase 7 : consolide top-10 (effort chiffré), 3 options PO.
   publish_doc les 3 livrables (executive, sprint-s0, backlog).
   await_user_input : décision PO sur options A/B/C.

10. [Phase 8 = dev humain, hors ton scope. Tu attends le signal.]

11. Phase 9 : await_user_input "Sprint S0 déployé ?". Quand reçu,
    lance re-test §17.7. Mets à jour 08-apprentissages.md.
    project_memory_write les métriques finales.

Ce que tu NE fais PAS (agentdeck le fait déjà) :
- Publier un status toutes les 5 min → l'UI http://127.0.0.1:3000 montre
  tout live, les humains peuvent voir par eux-mêmes
- Relayer un message entre 2 personas → le canal est direct
- Forward les findings → report_test_result est lu par le validator
- Polling d'un événement → utilise wait_for_channel avec predicate
- Détecter les crashs → le heartbeat agentdeck + agent.stopped suffisent

Ce que tu FAIS seul (logique) :
- Distribution des mandats (1 brief personnalisé par persona)
- Décisions de gate entre phases
- Relance des gaps Phase 4C
- Kill switch (logique de détection, pas mécanique)
- await_user_input sur blockers humains
- Annonces de transition de phase dans le canal

Format canal (JSONL strict) : §16.6 de la méthodologie.

Démarre par Étape 0 maintenant.
```

### 17.2 Template brief commun (pour tous personas)

```
Brief commun — Campagne <CAMPAIGN_ID>

Tu es un persona QA incarné. Ton identité, ta journée type et ton périmètre
sont dans ton brief spécifique (section ci-dessous). Ce document couvre les
règles communes que TOUS les personas doivent suivre.

## Règles non-négociables

### 1. Ton premier appel obligatoire
Appel 1 : browser_new_context({reset: true})
→ Vérifier que la réponse contient isolated: true.
→ Si isolated != true : STOP, post dans canal {type:"blocker", reason:"no isolation"}

### 2. Préfixe de tous tes objets créés
TEST-QA-<CAMPAIGN_ID>-<description-courte>
Exemples : TEST-QA-03f0b1f2-ticket-wifi, TEST-QA-03f0b1f2-client-acme

### 3. Bug-hunter mode activé à CHAQUE écran
5 questions :
1. Confirmation visuelle après action critique ?
2. Messages d'erreur actionnables ?
3. Champs obligatoires signalés AVANT de valider ?
4. Undo sur actions destructives ?
5. Recherche retourne résultats pertinents < 1s ?
Si "non" → irritant numéroté (UX-<MODULE>-NNN).

### 4. Les 3 buckets distincts
- BUG-<MODULE>-NNN : comportement incorrect (500, 409 silencieux, ...)
- UX-<MODULE>-NNN : friction (pas de toast, libellé ambigu, ...)
- MISS-<MODULE>-NNN : API a la feature, UI ne l'expose pas

NE JAMAIS mettre un MISS dans le bucket BUG.

### 5. Chaque BUG doit inclure la preuve reproductible
Format obligatoire :
{
  "id": "BUG-XX-NNN",
  "method": "POST",
  "path": "/api/v1/...",
  "body": {...},
  "expectedStatus": 200,
  "observedStatus": 500,
  "asPersona": "<ton-rôle>",
  "screenshot": "screenshots/....png",
  "networkLog": "..." // optionnel mais recommandé
}
Cette structure permet au Claim Validator de re-tester server-side.

### 6. Canal
- post_to_channel pour handoffs publics (@autre-persona)
- send_direct pour demandes privées
- Ne JAMAIS écrire dans un fichier markdown partagé (canal agentdeck =
  source de vérité)
- Format JSONL imposé (cf. §16.6 de la méthodologie)

### 7. Cleanup obligatoire en fin de session
Avant de t'arrêter, supprime tous les TEST-QA-<CAMPAIGN_ID>-* que tu as créés.
Liste dans ton rapport ce qui n'a pas pu être supprimé via UI
(→ candidat MISS "pas de bouton delete").

### 8. Astuce performance bearer token
Pour les endpoints API pures (sans formulaire UI), utilise fetch() depuis
la console après login UI :
```js
const token = /* copié depuis DevTools > Application > Cookies */;
const r = await fetch('/api/v1/...', {
  headers: { 'Authorization': `Bearer ${token}` }
});
```
Mais : les endpoints avec formulaire UI doivent aussi passer par UI
(pour capter les frictions).

### 9. Format de rapport
Écris ton rapport final dans _qa/<date>/reports/04-<persona>.md
en 9 sections (voir §16.5 de la méthodologie).

### 10. Ce que tu ne dois PAS faire
- Appeler browser_new_context une 2e fois (tu perds ton état)
- Toucher aux objets créés par un autre persona (collision)
- Ignorer un 429 : honore Retry-After
- Reproduire un bug > 2 fois (consomme rate-limit, enrichis ton rapport
  avec 2 reproductions suffisantes)
- Exploser la couverture dans des zones hors-périmètre
- Freiner sur un bug bloquant : signale dans canal, contourne, continue

## Ton brief spécifique

(... section injectée par l'orchestrator ...)
```

### 17.3 Template brief orchestrator (version résumée pour invocation)

```python
Agent({
  description: f"QA Orchestrator - {CAMPAIGN_ID}",
  subagent_type: "general-purpose",
  run_in_background: True,
  prompt: open("_qa/<date>/03-briefs/orchestrator.md").read()
})
```
Le fichier `orchestrator.md` est exactement §17.1 personnalisé avec le CAMPAIGN_ID et les chemins absolus.

### 17.4 Template brief persona

```
# Brief persona <Prénom> — Campagne <CID>

## Identité
(Copier-coller les 6 sections §4.3 du fichier 00-personas.md)

## Brief commun
(Lire _qa/<date>/00-briefing-common.md — obligatoire avant de commencer)

## Mandat du jour

### Périmètre principal
Module : <X>

### Endpoints à couvrir
(Extraits de 01-cartographie.md, liste exhaustive)
- GET /api/v1/.../...
- POST /api/v1/.../...
- ...

### Pages à couvrir
(Idem)
- /<page>
- ...

### 5 parcours métier P1-P5
**P1** : <Scénario complet pas-à-pas>
**P2** : ...
**P3** : ...
**P4** : <Cas limite / erreur attendue>
**P5** : ...

### Handoffs attendus
- Tu RECEVRAS un handoff de @<autre> quand <condition>. Action : <quoi faire>.
- Tu EMETTRAS un handoff vers @<autre> après <action>. Format : <payload attendu>.

### Cleanup
Avant de t'arrêter :
1. Supprime tous tes TEST-QA-<CID>-* via UI
2. Liste dans ton rapport ceux qui n'ont pas pu être supprimés

### Livrable
Fichier : _qa/<date>/reports/04-<persona>.md en 9 sections (cf. §16.5).

## Outillage
- mcp__agentdeck__browser_new_context (1er appel, reset:true)
- mcp__agentdeck__browser_* (navigation, click, type, screenshot)
- mcp__agentdeck__post_to_channel (handoffs publics)
- mcp__agentdeck__report_test_result (chaque BUG/UX/MISS)
- mcp__agentdeck__sandbox_write (ton rapport)

OU en mode dégradé :
- playwright Playwright MCP classique
- Fichiers _qa/<date>/channel.jsonl et findings.jsonl

## Durée cible
60-120 min. Si > 120 min, demande une pause dans le canal.

Démarre.
```

### 17.5 Template claim-validator

```python
Agent({
  description: f"Claim Validator - {CAMPAIGN_ID}",
  subagent_type: "general-purpose",
  prompt: """
Tu es le Claim Validator. Tu ne testes rien toi-même.

Ton travail : valider les findings remontés par les personas pendant Phase 4.

## Inputs
- _qa/<date>/findings.jsonl (OU appels report_test_result via agentdeck)
- Comptes-personas dispo (tu peux t'authentifier avec chacun)

## Procédure par type

### type == "bug"
1. Parser le finding : {method, path, body, persona, observedStatus}
2. Si agentdeck :
   validate_claim({method, path, body, asPersona: persona,
                   expectedStatus: observedStatus,
                   maxRetries: 3, maxBackoffMs: 60000})
   Sinon :
   token = login(persona)
   r = requests.request(method, base+path, headers={"Auth": f"Bearer {token}"}, json=body)
3. Verdict :
   - r.status == observedStatus → CONFIRMED
   - r.status == expectedStatus (200 ou 201 "normal") → FALSE_POSITIVE
   - 429 persistant → TO_INVESTIGATE (note retry count)
   - erreur connexion → TO_INVESTIGATE

### type == "ux"
Pas de validation automatique, mais :
- Vérifie que la capture existe
- Dédupliquer : 2 UX sont le même si :
  - même page
  - titre similaire (Levenshtein > 80%)
  Garder celui du persona principal du module.

### type == "miss"
1. Vérifier que l'endpoint existe : validate_claim(method=GET, path=endpoint).
   Si 404 : le MISS est faux (endpoint inexistant) → FALSE_POSITIVE.
2. Vérifier que l'UI ne l'appelle pas : grep dans frontend/src pour
   l'endpoint OU son handler. Si trouvé : FALSE_POSITIVE (l'UI l'appelle
   déjà).
3. Sinon : CONFIRMED.

## Livrable
_qa/<date>/06-triage.md, structure stricte (cf. §12.5).

## Règles
- Jamais tu ne crées de nouvel objet : tu lis, tu valides, tu écris le rapport
- En cas de 429, honore Retry-After, max 3 retries
- Pour chaque FALSE_POSITIVE, analyse la cause probable (§19)

Démarre dès que findings.jsonl contient ≥ 5 entrées.
"""
})
```

### 17.6 Template auditeur de couverture (Phase 4C)

```
Tu es l'Auditeur de Couverture de la campagne <CID>.

Inputs :
- _qa/<date>/01-cartographie.md (ce qui existe)
- _qa/<date>/reports/04-*.md (ce qui a été testé)
- _qa/<date>/channel.jsonl (interactions)
- _qa/<date>/findings.jsonl (ce qui a été trouvé)

Tâches :
1. Pour chaque endpoint de 01-cartographie, vérifier qu'au moins 1 rapport
   persona le mentionne dans §1 (couverture backend) avec un status.
2. Pour chaque page de 01-cartographie, vérifier §2 (couverture frontend).
3. Pour chaque handoff défini dans 00-personas.md, vérifier présence dans
   channel.jsonl avec type:"handoff" + handoff_result.
4. Pour chaque parcours P1-P5 de chaque persona, vérifier §6 du rapport.

Livrable : _qa/<date>/04c-gaps.md

Structure :
# Gaps de couverture — Campagne <CID>

## Endpoints non couverts (sur N total)
| Endpoint | Module | Persona attendu | Priorité relance |

## Pages non couvertes
| Page | Persona attendu | Priorité relance |

## Handoffs non exécutés
...

## P1-P5 non joués
...

## Recommandations de relance
- @amandine : relance sur endpoints [liste], 15 min estimé
- @damien : relance sur page /crm/advanced, 5 min estimé

## Couverture globale
- Endpoints : X/N (X%)
- Pages : X/N (X%)
- Handoffs : X/N
- Parcours : X/N
```

### 17.7 Template re-test Phase 9

```python
Agent({
  description: f"Re-test Sprint S0 - {CAMPAIGN_ID}",
  subagent_type: "general-purpose",
  run_in_background: True,
  prompt: """
Inputs :
- _qa/<date>/07-sprint-s0.md (items du Sprint S0)
- Cible où le Sprint S0 a été déployé : <URL>

Pour chaque item du Sprint S0 :
1. Relis la section Repro
2. Exécute la même séquence (validate_claim si possible, sinon Playwright)
3. Note le status avant et après
4. Verdict ✅ (fix complet) / ⚠️ (partiel) / ❌ (pas fixé)

Puis : rejoue P1-P5 d'un persona principal, tag chaque étape ✅/⚠️/❌.

Livrables :
- _qa/<date>/09-retest.md : table par item
- _qa/<date>/09-non-regression.md : P1-P5 verdict

Mets à jour _qa/<date>/README.md avec le bilan final :
- N/M items fixés
- X régressions nouvelles identifiées
- Verdict global campagne ✅/⚠️/❌
"""
})
```

### 17.8 Template : snippet DM bilatéral (à inclure dans chaque brief persona)

Ce snippet est à copier dans chaque brief persona pour que les agents sachent exactement comment utiliser le DM. Il n'est pas un prompt complet, mais un fragment d'instruction.

```
## Tu peux parler en privé à un autre persona (DM)

Utilise le DM quand :
- Tu as besoin d'une info précise d'UN autre persona (ID créé, détail technique)
- Tu veux te coordonner bilatéralement ("je prends tickets, tu prends KB ?")
- Ta question n'intéresse pas les 4 autres agents actifs

Format (agentdeck) :
  await send_direct({
    from: "<ton-nom>",
    to: "<destinataire>",
    type: "question" | "answer" | "coordination" | "thanks",
    payload: { text: "<court, factuel>", refs: { ... } }
  })

Format (mode dégradé) :
  echo '{"ts":"<ISO>","from":"<toi>","to":"<destinataire>","type":"question","payload":{"text":"..."}}' >> _qa/<date>/dm.jsonl

Règles :
- Lis ta boîte DM en début de session ET après chaque handoff reçu :
    await read_direct({ as: "<ton-nom>", unreadOnly: true })
- Réponds à tout DM adressé à toi dans la minute (sauf si tu es au
  milieu d'un parcours critique, alors dans les 5 min)
- Si un DM mérite d'être public (ça concerne l'équipe) → refer au canal :
    "Cette question vaut pour tout le monde, je relaie sur #qa-general"
- Max 5 allers-retours sur un sujet, sinon retour au canal
- Si pas de réponse après 10 min, relance sur le canal public

Exemples concrets :

Tu es Damien (commercial), tu te demandes si Amandine a déjà créé
un client test "ACME" :
  send_direct({ from: "damien", to: "amandine", type: "question",
                payload: { text: "tu as créé un client ACME ? Si oui,
                quel siret ?" } })

Amandine te répond :
  send_direct({ from: "amandine", to: "damien", type: "answer",
                payload: { text: "oui, TEST-QA-<CID>-acme, siret
                12345678900011. Prends suffixe -2 si duplicate." } })

Tu confirmes :
  send_direct({ from: "damien", to: "amandine", type: "thanks",
                payload: { text: "ok merci" } })
```

### 17.9 Template : snippet chat d'équipe (à inclure dans chaque brief persona)

```
## Tu fais partie d'une équipe — canal #qa-general

Utilise le canal quand :
- Tu annonces un status (début/fin de parcours, couverture atteinte)
- Tu émets un handoff vers un autre persona (avec @mention)
- Tu es bloqué et ça concerne l'équipe (429 prolongé, seeds manquants)
- Tu as une question qui peut intéresser plus de 2 personnes

Format (agentdeck) :
  await post_to_channel({
    channel: "qa-general",
    type: "status" | "handoff" | "blocker" | "question_group" | "finding_public",
    payload: { ... } // voir §16.6
  })

Routine obligatoire :
- En début de session : read_channel({ limit: 30 }) pour te caler
- Toutes les 10 actions significatives : re-read le canal (quelqu'un t'a
  peut-être mentionné)
- Après chaque parcours P1-P5 : post un status

Règles anti-spam :
- Max 1 "status" par persona toutes les 10 min (pas de spam)
- Jamais de conversation bilatérale sur le canal (→ DM)
- Pas de markdown prose dans le payload, JSON structuré

Mention obligatoire @persona quand un message lui est adressé :
  { type: "handoff", payload: { to: "magasinier",
                                text: "@magasinier dispo stock TK-42 à vérifier" } }
```

---

## 18. Anti-patterns

Les 10 anti-patterns à **absolument éviter** (extraits de `08-apprentissages.md`) :

### AP-1. Tester en parallèle sans vérifier l'isolation
**Conséquence** : 60 % des rapports faux. Toujours Sous-phase 4A avant 4B.

### AP-2. Lancer le test sans cartographie
**Conséquence** : 30 % du module raté. Phase 1 obligatoire.

### AP-3. Croire tous les bugs sans validation
**Conséquence** : 10-20 % de faux positifs dans Sprint S0. Phase 6 obligatoire.

### AP-4. Mocker la DB dans les tests unitaires
**Conséquence** : tests passent, prod casse. Utiliser SQLite in-memory.

### AP-5. Sélecteurs Playwright sur classes Tailwind
**Conséquence** : tests cassent à chaque refonte UI. Utiliser `getByRole`, `getByText`, `data-testid`.

### AP-6. `setTimeout` au lieu de `waitFor`
**Conséquence** : tests flaky et lents. Utiliser `waitFor({state:"visible"})`.

### AP-7. Tester sur 1 seule org
**Conséquence** : 30 % des "bugs" sont des bugs d'état. Règle §4 obligatoire.

### AP-8. Skipper le cleanup
**Conséquence** : org polluée, tests d'unicité cassent à la campagne suivante.

### AP-9. "Tout couvrir en E2E"
**Conséquence** : 30 min de CI + maintenance lourde. Garder E2E pour 5-10 golden paths.

### AP-10. Confondre bug et manque fonctionnel
**Conséquence** : MISS ignorés dans Sprint S0. 3 buckets distincts obligatoires.

---

## 19. Troubleshooting

Catalogue **symptôme → cause → fix**. À utiliser comme référence rapide en cas de blocage.

### 19.1 Problèmes d'authentification

| Symptôme | Cause probable | Fix |
|---|---|---|
| 429 sur tous les logins | Rate-limit bucket partagé login | `sleep 60` entre chaque, ou bump côté backend pour test IPs |
| Login OK, mais 401 sur appels API suivants | Token pas injecté dans headers | Vérifier intercepteur axios, ou rehydrate Zustand token (§1.8.5) |
| Token expire en cours de session | TTL trop court | Prolonger TTL pour tests, ou rafraîchir via /auth/refresh |
| Compte refuse de se connecter | Compte désactivé ou mauvais mot de passe | Re-vérifier `00-targets.md` credentials, ou reset password |

### 19.2 Problèmes d'isolation

| Symptôme | Cause probable | Fix |
|---|---|---|
| Persona 2 voit les objets de Persona 1 | BrowserContext partagé | Vérifier `browser_new_context({reset:true})` bien appelé, sinon §3.1 mode dégradé |
| Persona se déconnecte aléatoirement | Cookies HttpOnly du persona précédent | Nettoyer explicitement cookies + localStorage avant login |
| Identité mélangée après 30s | Autofill Chromium | Désactiver autofill dans le profil de test |

### 19.3 Problèmes de couverture

| Symptôme | Cause probable | Fix |
|---|---|---|
| 50 % des endpoints non touchés | Brief trop étroit | Phase 4C auditeur + relance ciblée |
| 0 MISS identifié | Cartographie frontend superficielle | Re-lancer Explore frontend avec insistance sur les hooks API |
| Pages chargées mais aucune action testée | Brief pas assez explicite sur les actions | Ajouter "pour chaque bouton, clique-le au moins 1 fois" |

### 19.4 Problèmes de faux positifs

| Symptôme | Cause probable | Fix |
|---|---|---|
| > 10 % de faux positifs en Phase 6 | Principe §1 ou §4 violé | Investiguer : logs des browser contexts, check 2 orgs |
| Même bug rapporté par 3 personas | Vrai bug (si `validate_claim` confirme) OU contamination (si pas) | Phase 6 tranche |
| Bug reproduit localement mais pas server-side | Rate-limit ou état transitoire | Classer TO_INVESTIGATE, passer en manuel |

### 19.5 Problèmes de performance campagne

| Symptôme | Cause probable | Fix |
|---|---|---|
| Campagne prend > 24 h sur module moyen | Trop de séquentiel | Passer 4B (3 parallèle) dès que 4A validé |
| Agents timeout à 30 min | Brief trop long | Splitter en 2 sessions persona |
| Rapport final impossible à lire (2000 lignes) | Pas de synthèse exécutive | Phase 7 obligatoire, 07-executive.md max 1 page |

### 19.6 Problèmes d'outillage

| Symptôme | Cause probable | Fix |
|---|---|---|
| agentdeck UI ne montre aucun persona | Session non créée ou mauvais projectId | Vérifier `mcp__agentdeck__*` en prod, `POST /sessions` OK |
| Playwright MCP ne trouve pas le sélecteur | DOM async pas encore peuplé | `waitFor({state:"visible"})` avant click |
| SSE empêche `waitForLoadState('networkidle')` | Connexion SSE ouverte permanent | Ne pas utiliser `networkidle`, attendre selector concret |
| Cookie banner RGPD bloque les clics | Overlay avant dismiss | `beforeEach` dismiss banner |

### 19.7 Problèmes de reporting

| Symptôme | Cause probable | Fix |
|---|---|---|
| Rapport mélange BUG et MISS | Principe §5 ignoré | Re-brief agent + séparer en 3 sections distinctes |
| Captures sans noms parlants | Convention §16.4 pas appliquée | Re-brief convention dès début |
| Findings sans evidence reproductible | Brief pas explicite sur format claim | §17.2 "chaque BUG doit inclure..." |

---

## 20. Métriques de succès

Mesurées à la fin de chaque campagne, stockées dans `project_memory` sous `campaign:<CID>:metrics` :

| Métrique | Cible | Alerte si |
|---|---|---|
| Couverture endpoints | ≥ 95 % | < 85 % → cartographie ratée |
| Couverture pages UI | 100 % | < 100 % → brief trop étroit |
| Couverture parcours métier P1-P5 | 100 % | < 80 % → personas à re-briefer |
| Couverture handoffs | 100 % des définis | < 100 % → Phase 5 incomplète |
| Taux faux positifs (Phase 6) | < 2 % | > 4 % → principe §1 ou §4 violé |
| BUG confirmés / total BUG | > 80 % | < 70 % → agents peu disciplinés |
| Ratio MISS / BUG | 0,5 – 1,5 | > 2 → API très en avance sur UI (sprint intégration) |
| Durée phases 0-7 | 1 j (module) / 3 j (app complète) | > 2×cible → parallélisme sous-utilisé |
| % items Sprint S0 fixés au re-test | ≥ 90 % | < 70 % → Sprint S0 trop ambitieux |
| Effort dev S0 / effort campagne | 5–10× | < 3× → campagne trop courte |
| Régressions nouvelles post-S0 | 0 | ≥ 1 → dev Sprint S0 insuffisamment testé |

**Règle méta** : si 3+ métriques sont en alerte, la campagne suivante doit **d'abord** corriger le processus avant de tester quoi que ce soit.

---

## 21. Adaptations par type de projet

### 21.1 ERP / application métier multi-rôles

Configuration type IndusForge.
- **Personas** : 6-10 (1 par département)
- **Phases** : toutes (0-9)
- **Handoffs** : matrice complète cross-module (5-15 handoffs)
- **Durée cible** : 2-3 j
- **agentdeck** : fortement recommandé

### 21.2 SaaS B2B (CRM, outil collab, …)

- **Personas** : 3-5 (user standard, admin org, billing-owner, viewer, éventuellement integrator)
- **Phases** : toutes
- **Handoffs** : 2-5 (ex: admin invite user → user voit l'invitation)
- **Durée cible** : 1 j
- **agentdeck** : recommandé si multi-user parallèle

### 21.3 Marketplace

- **Personas** : 3-5 (acheteur, vendeur, modérateur, support, plateforme-admin)
- **Phases** : toutes + focus Phase 5 (handoffs acheteur↔vendeur critiques)
- **Handoffs** : achat, litige, remboursement
- **Durée cible** : 1-2 j
- **agentdeck** : recommandé

### 21.4 Plateforme développeur / API-first

- **Personas** : 2-4 (intégrateur, admin org, viewer, éventuellement owner)
- **Phases** : Phase 4 focalisée sur **API direct** (pas beaucoup d'UI)
- Phase 1 : cartographie SDK + docs + endpoints
- **Durée cible** : 0,5-1 j
- **agentdeck** : mode dégradé souvent suffisant

### 21.5 Outil interne / DevOps

- **Personas** : 2-3 (dev, SRE, éventuellement admin)
- **Phases** : focus 1-2-4 (cartographie + smoke + exhaustif), Phase 5 souvent skip
- **Durée cible** : 0,5 j
- **agentdeck** : mode dégradé suffit

### 21.6 Application mobile

- **Personas** : 2-3 (guest, logged, power)
- **Phases** : toutes, mais Phase 4 utilise Appium ou Playwright mobile au lieu de Chromium
- Attention : `browser_new_context` devient `device_reset` (profils Android/iOS)
- **Durée cible** : 1-2 j
- **agentdeck** : limité (pas de support mobile natif, mode dégradé requis)

### 21.7 Application consumer B2C simple

- **Personas** : 2 (guest + user logged)
- **Phases** : 0, 1, 2, 4, 6, 7, 9 (skip 5 si pas de handoffs inter-user)
- **Durée cible** : 0,5 j
- **agentdeck** : dégradé suffit

---

## 22. Glossaire

| Terme | Définition |
|---|---|
| **agentdeck** | Orchestrateur local qui expose 31 primitives MCP dédiées à cette méthodologie. [G:\agentdeck](G:\agentdeck). Optionnel mais idéal. |
| **Agent sub-agent** | Invocation d'un LLM autonome via le tool `Agent` de Claude Code, avec son propre contexte isolé. |
| **Auditeur de couverture** | Sub-agent Phase 4C qui croise cartographie × rapports personas pour détecter les gaps. |
| **Bridge session** | Session agentdeck créée par un process externe (CLI Claude, script) au lieu d'une SDK query. Heartbeat 30s. |
| **BrowserContext** | Unité d'isolation Playwright (cookies, localStorage, cache). 1 persona = 1 context. |
| **Bug-hunter mode** | 5 questions systématiques à chaque écran (confirmation, erreur actionnable, champ requis, undo, recherche). |
| **BUG-XX-NNN** | Numérotation d'un bug confirmé. XX = code module, NNN = séquentiel. |
| **CAMPAIGN_ID** | UUIDv4 court (8 hex) identifiant une campagne. Préfixe de tous les objets créés. |
| **Claim** | Assertion formalisée qu'un bug existe. Structure : method, path, body, expectedStatus, observedStatus. |
| **Claim-validator** | Sub-agent Phase 6 qui re-valide chaque claim via fetch server-side. |
| **Cleanup** | Suppression des objets TEST-QA-* en fin de session. Obligatoire. |
| **Gate** | Critère de passage d'une phase à la suivante. Non satisfait = stop. |
| **Handoff** | Passage de relai entre 2 personas (ex: commercial → magasinier). Format JSON dans canal. |
| **IRR-NNN** | Numérotation d'irritant dans `_team/irritants.md` (legacy markdown). Remplacé par BUG/UX/MISS. |
| **Kill switch** | Règle orchestrator : si 2 personas rapportent la même anomalie < 1 min, KILL tous les personas en cours. |
| **MISS-XX-NNN** | Manque fonctionnel : l'API expose une capacité, l'UI ne l'utilise pas. |
| **MCP** (Model Context Protocol) | Protocole Anthropic pour étendre Claude Code avec des tools natifs. |
| **Orchestrator** | Sub-agent chef d'orchestre qui coordonne les personas et surveille le canal. |
| **Persona** | Rôle métier incarné par un sub-agent (identité + KPIs + pages + journée type). |
| **Playwright** | Framework de test E2E Microsoft. Disponible en CLI (specs .ts) et en MCP (pilotage par agent). |
| **Sprint S0** | Sprint dev hotfix qui consomme le top-10 de Phase 7. |
| **TEST-QA-<CID>-** | Préfixe obligatoire de tout objet créé en campagne. Traçabilité cleanup. |
| **UX-XX-NNN** | Friction UX (utilisable mais pénible). Différent d'un bug. |
| **validate_claim** | Primitive agentdeck qui re-teste un claim server-side. Honore Retry-After 429. |

---

## 23. Évolutions futures

### v1.1 (court terme, à activer dès disponible)

- **`browser_parallel_safe` flag** (agentdeck) — certifie que N contextes peuvent courir en parallèle sans collision. Remplace la vérification manuelle Sous-phase 4A.
- **`claim_batch_validate`** — API pour valider 50 claims en 1 appel. Phase 6 passe de 30-60 min à 5 min.
- **`mcp__agentdeck__spawn_agent`** (actuellement deferred, cf. CLAUDE.md) — remplace `POST /sessions/:id/agents` direct.
- **Coverage tracker live** — plutôt qu'un auditeur Phase 4C, un agent-monitor qui voit `api_inventory` + les `validate_claim` exécutés et marque les endpoints en temps réel.

### v2.0 (moyen terme)

- **Parcours métier auto-générés** — à partir de cartographie + handoffs, générer les P1-P5 plutôt qu'à la main.
- **Personas auto-proposés** — analyse RBAC du projet + pages pour proposer N personas.
- **Intégration CI** — la méthodologie exécutée en mode "smoke" (Phase 2 + 4B 1 persona) à chaque PR critique.
- **Méthodologie mobile native** — équivalent `browser_new_context` pour Appium/Playwright mobile.

### v3.0 (long terme)

- **Méthodologie inversée** : depuis un bug rapporté en prod, générer automatiquement la campagne ciblée qui aurait dû le trouver, + l'ajouter au corpus des procédures.
- **Apprentissage inter-campagne** : un agent "méta" analyse les `project_memory:campaign:*:metrics` sur N campagnes et propose des optimisations de briefs.

---

## Annexe A — Checklist exhaustive (rassemblée)

### Avant de commencer
- [ ] **Étape 0 bloquante : outillage vérifié (§3ter)**
  - [ ] Proxy agentdeck répond (ou mode dégradé validé)
  - [ ] Chromium installé
  - [ ] DB migrée
  - [ ] Les 31 tools MCP visibles (ou playwright/python OK en dégradé)
  - [ ] UI web joignable http://127.0.0.1:3000
- [ ] Pré-requis projet §1 validés
- [ ] 2 orgs / envs cibles identifiés et testés
- [ ] Comptes-personas prêts et smoke-loggés
- [ ] Seeds joués sur les 2 cibles
- [ ] CAMPAIGN_ID généré
- [ ] Dossier `_qa/<date>/` créé
- [ ] Session agentdeck OU mode dégradé préparé
- [ ] Personas définis et documentés dans `00-personas.md`
- [ ] Brief commun rédigé et publié
- [ ] Canal `#qa-general` ouvert et DM testé entre 2 agents pilotes

### Phase 1
- [ ] api_inventory (ou Explore backend) lancé
- [ ] Explore frontend en parallèle
- [ ] selfCheck OK (pas de parsing issue)
- [ ] `01-cartographie.md` exhaustif
- [ ] Chaque endpoint → persona attendu assigné
- [ ] Au moins 3 candidats MISS identifiés

### Phase 2
- [ ] pytest vert
- [ ] smoke-api.py : > 90 % succès
- [ ] `02-smoke-api.json` écrit

### Phase 3
- [ ] Brief commun en project_memory
- [ ] Brief spécifique par persona
- [ ] Orchestrator lancé et "ready" dans canal

### Phase 4
- [ ] 4A : 2 personas séquentiels, isolation vérifiée
- [ ] 4B : max 3 parallèles, kill switch armé
- [ ] 4C : auditeur lancé, gaps P0 relancés
- [ ] Couverture endpoints ≥ 95 %
- [ ] Couverture pages = 100 %
- [ ] Chaque persona a un `reports/04-<name>.md`

### Phase 5
- [ ] Matrice handoffs exécutée
- [ ] Chaque handoff ✅/⚠️/❌ avec preuve
- [ ] `05-handoffs.md` écrit

### Phase 6
- [ ] 100 % des BUG passés par `validate_claim`
- [ ] Déduplication UX (Levenshtein > 80 %)
- [ ] Vérification MISS (endpoint existe + UI ne l'appelle pas)
- [ ] `06-triage.md` écrit
- [ ] Taux faux positifs < 4 %

### Phase 7
- [ ] Top-10 chiffré
- [ ] 3 options présentées au PO
- [ ] `07-executive.md`, `07-sprint-s0.md`, `07-backlog.md` écrits

### Phase 9
- [ ] Re-test item par item via `validate_claim`
- [ ] P1-P5 rejoués (non-régression)
- [ ] `09-retest.md` et `09-non-regression.md` écrits
- [ ] `08-apprentissages.md` mis à jour
- [ ] Métriques stockées dans `project_memory`
- [ ] Bilan final dans `_qa/<date>/README.md`

---

## Annexe B — Ressources

- Ce fichier : `G:\agentdeck\process\10-methodologie-unifiee.md`
- Les 9 documents sources : `G:\agentdeck\process\00-*.md` à `09-*.md`
- Procédures atomiques réutilisables : `G:\agentdeck\procedures\`
- agentdeck : [G:\agentdeck](G:\agentdeck) (optionnel mais recommandé)
- Templates et exemples IndusForge : `G:\eyeot\ERP\_team\` et `G:\eyeot\ERP\.claude\skills\crm-*`

---

*Méthodologie unifiée v1.0 — 2026-04-25.*
*Auto-portant : un agent IA découvrant ce document peut l'appliquer de bout en bout.*
*agentdeck recommandé mais optionnel — tous les patterns ont une version dégradée.*
*À maintenir : chaque nouvelle campagne met à jour §20 (métriques) et §18 (anti-patterns).*
