# 06 — Templates de prompts d'agents prêts à copier-coller

> Tous les briefs d'agents validés en production, prêts à copier-coller. Adapter les `<placeholders>` au cas d'usage. Tester d'abord sur un petit périmètre avant de lancer du 1h+.

---

## Table des matières

1. [Cartographier un module (Explore)](#1-cartographier-un-module-explore)
2. [Cartographier un concurrent open-source (Explore)](#2-cartographier-un-concurrent-open-source-explore)
3. [Test fonctionnel rapide d'un module (general-purpose + Playwright MCP)](#3-test-fonctionnel-rapide-dun-module)
4. [Test exhaustif d'un module en prod (general-purpose + Playwright MCP, ~1-2h)](#4-test-exhaustif-dun-module-en-prod)
5. [Test E2E ciblé sur un parcours](#5-test-e2e-ciblé-sur-un-parcours)
6. [Audit RBAC multi-personas](#6-audit-rbac-multi-personas)
7. [Briefer un skill métier `crm-*`](#7-briefer-un-skill-métier-crm-)
8. [Orchestration semaine IndusForge — kickoff jour 1](#8-orchestration-semaine-industrielle--kickoff-jour-1)
9. [Test cross-module via `crm-qa-orchestrator`](#9-test-cross-module-via-crm-qa-orchestrator)
10. [Re-test post-fix](#10-re-test-post-fix)

---

## 1. Cartographier un module (Explore)

```python
Agent({
  description: "Cartographie exhaustive module <X>",
  subagent_type: "Explore",
  prompt: """
Cartographie exhaustive du module <X> de l'ERP eyeot situé dans G:\\eyeot\\ERP\\.

Contexte : je prépare <objectif : analyse comparative / refonte / sprint>. J'ai besoin d'une cartographie COMPLÈTE et DÉTAILLÉE du périmètre <X> actuel.

**Zones à explorer (niveau très poussé) :**

1. **Backend — Models** (`backend/models/`) : tous les fichiers liés à <X>. Pour chaque modèle : nom de classe, nom de table, attributs principaux, relations, énumérations/statuts, contraintes, mixins utilisés.

2. **Backend — API routes** (`backend/api/v1/<X>/`) : lister TOUS les endpoints (méthode + URL + permission requise + schéma d'entrée/sortie succinct).

3. **Backend — Services** (`backend/services/`) : lister les services liés à <X> et logique métier.

4. **Frontend — Features** (`frontend/src/features/<X>/` + routes `frontend/src/routes/_authenticated/<X>/`) : lister les pages/vues, composants principaux, stores/hooks spécifiques, API clients.

5. **Cross-module** : comment ce module s'intègre avec les autres modules.

6. **État conformité <standard>** :
   <liste des capacités attendues du standard>

7. **Seeds/fixtures** : fichiers `backend/seeds/*<X>*.py`.

8. **Tests** : `backend/tests/test_<X>*.py` — couverture actuelle.

9. **Migrations** : toutes les migrations Alembic qui touchent au périmètre <X> (ordre chronologique + objet).

**Livrable attendu** : un rapport markdown structuré et détaillé (environ 800-1500 lignes) dans le message de retour, avec :
- Un executive summary (maturité globale du module sur 10)
- Une section par sous-domaine ci-dessus
- Listes exhaustives (pas de "etc." qui cachent du contenu)
- Chemins de fichiers avec line numbers pour les points clés
- Forces et lacunes identifiées (synthèse qualitative)

Lis aussi CARTOGRAPHY.md au préalable. Ne code rien, recherche seulement. Réponds en français.
  """
})
```

---

## 2. Cartographier un concurrent open-source (Explore)

```python
Agent({
  description: "Cartographie exhaustive <Concurrent>",
  subagent_type: "Explore",
  prompt: """
Cartographie exhaustive de <Concurrent> (<description courte du produit>) situé dans G:\\<projet>\\_external\\<repo>\\.

Contexte : je prépare une analyse comparative pro entre <Concurrent> et notre produit. <Concurrent> est <position marché>. J'ai besoin d'une cartographie COMPLÈTE pour mesurer l'écart.

**Méthode** : explore surtout `<dossier sources>`, `<dossier routes/pages>`, `<schéma DB>`, `<doc API>`, `<changelog>`, `<readme>`.

**Points à couvrir en profondeur :**

1. **Périmètre fonctionnel global** : modules/features majeurs regroupés par grande famille.

2. **<Module 1>** (cœur historique) : <détails attendus>

3. **<Module 2>** : <détails attendus>

...

**N. Architecture technique** : stack, modèle de données, API, auth, multi-tenant, RBAC, audit trail.

**N+1. Chiffres clés** : nombre d'entités métier, nombre de tables, volume code, version actuelle, date de la dernière release majeure.

**Livrable** : rapport markdown structuré (800-1500 lignes) en français, avec :
- Executive summary
- Une section par bloc
- Listes exhaustives des entités métier et features
- Chemins de fichiers <Concurrent> clés
- Mention des versions où telle feature a été introduite si pertinent
- Synthèse finale : forces distinctives + points faibles connus

Recherche seulement. Réponds en français.
  """
})
```

---

## 3. Test fonctionnel rapide d'un module

```python
Agent({
  description: "Test fonctionnel module <X>",
  subagent_type: "general-purpose",
  run_in_background: true,
  prompt: """
Tu es un IT Service Manager / commercial / RH / etc. qui évalue le module "<X>" de l'ERP eyeot en production sur https://erp.eyeot.fr.

**Identifiants** :
- Email : `<email>`
- Password : `<password>`
- Org active : `<org>`

**Outillage** : utilise les tools MCP Playwright (`mcp__plugin_playwright_playwright__browser_*`). Pour chaque écran important, prends une capture (`browser_take_screenshot`).

**Plan de test (parcours d'un <persona> en condition réelle)** :

1. **Login** sur https://erp.eyeot.fr/login
2. **Navigation** : trouver l'entrée <X> dans la nav, capture
3. **Dashboard <X>** : vérifier les KPI, capture
4. **<Sous-section 1>** :
   - Lister les <objets>
   - Créer un <objet> test (préfixe "TEST QA")
   - Tenter une transition / un workflow
   - Ajouter un commentaire / followup
5. **<Sous-section 2>** :
   - <Actions à tester>
6. **Cleanup** : supprimer ce qui a été créé (préfixe "TEST QA")

**Rapport attendu** (en français, markdown, 200-400 lignes max) :

\```
# Rapport test fonctionnel <X> — erp.eyeot.fr

## Date / environnement / compte testeur
## Résumé exécutif (3-5 lignes)
## Résultats par fonctionnalité (tableau)
| Fonction | OK / KO / partiel | Capture | Détail |
## Bugs / dysfonctionnements (TEST-XX-001, sévérité, page, repro)
## Frictions UX
## Manques fonctionnels visibles côté UI
## Captures d'écran organisées par section (chemins absolus)
## Conclusions et recommandations courtes (top 5)
\```

**Contraintes** :
- Travaille consciencieusement, qualité avant vitesse.
- Si une fonctionnalité est introuvable, marque KO avec note "non visible dans l'UI".
- Si page d'erreur 500, note URL et message exact.
- Aucune modification de code.

Réponds en français. Rapport dans : `G:\\<projet>\\_analysis\\06-test-fonctionnel-<X>.md`
  """
})
```

---

## 4. Test exhaustif d'un module en prod

(cf. `05-test-exhaustif-prod.md` §4 pour le brief complet — long ~3-5k tokens)

```python
Agent({
  description: "Test exhaustif module <X> eyeot",
  subagent_type: "general-purpose",
  run_in_background: true,
  prompt: """
Tu es <Persona>, <description>. Tu testes EXHAUSTIVEMENT le module <X> de l'ERP eyeot en production sur https://erp.eyeot.fr. Ce test va servir de base à un Sprint hotfix S0.

Ton mandat est EXHAUSTIF — qualité du test prime sur la vitesse. Prévois 1h-2h de session.

# Méthodologie
Tu utilises le MCP Playwright (mcp__plugin_playwright_playwright__browser_*).
Active browser_console_messages et browser_network_requests au début.
Captures à chaque écran significatif (target: 50-80).

# Compte testeur
[primary + fallback]

# Périmètre — Backend (N endpoints à couvrir)
[liste exhaustive depuis cartographie]

# Périmètre — Frontend (toutes les pages /<X>/*)
[liste pages]
Pour chaque page, tester :
1. Rendu, 2. filtres, 3. actions, 4. validation form, 5. feedback, 6. a11y, 7. perf, 8. responsive

# Parcours métier P1-P5
[5 scénarios métier complets]

# Cleanup obligatoire
[préfixe + suppression]

# Mode bug-hunter (5 questions à chaque écran)

# Livrable
Fichier : G:\\<projet>\\_analysis\\07-test-exhaustif-<X>.md
Structure : §0 synthèse / §1 matrice backend / §2 matrice frontend / §3 bugs / §4 frictions / §5 manques / §6 parcours / §7 console+network / §8 captures / §9 top 10

# Contraintes
[qualité prime, captures, no code]

Démarre maintenant.
  """
})
```

---

## 5. Test E2E ciblé sur un parcours

```python
Agent({
  description: "Test E2E parcours <X>",
  subagent_type: "general-purpose",
  run_in_background: true,
  prompt: """
Tu testes un parcours utilisateur précis sur https://erp.eyeot.fr.

**Compte** : <email> / <password>

**Outillage** : MCP Playwright

**Parcours à tester** :

1. <Étape 1>
2. <Étape 2>
...
N. <Étape N>

**À chaque étape**, vérifier :
- Le statut HTTP de la requête associée
- Le toast de succès/erreur
- Le DOM mis à jour
- La présence des données attendues

**Si une étape échoue** : noter status code + message UI exact, prendre capture, continuer si possible.

**Livrable** : rapport markdown 100-200 lignes. Structure : objectif / résultat global (✅/❌) / détail par étape (statut/observations/capture) / recommandations.

Aucune modification de code. Cleanup à la fin (préfixe "TEST E2E"). Réponds en français.
  """
})
```

---

## 6. Audit RBAC multi-personas

```python
Agent({
  description: "Audit RBAC <module>",
  subagent_type: "general-purpose",
  run_in_background: true,
  prompt: """
Tu vérifies les contrôles RBAC du module <X> en testant 6 rôles différents.

**Comptes** (org IndusForge SAS) :
- admin : admin@industest.fr / Indus2026!
- directeur : directeur@industest.fr / Indus2026!
- commercial : commercial@industest.fr / Indus2026!
- magasinier : magasinier@industest.fr / Indus2026!
- technicien : technicien@industest.fr / Indus2026!
- rh : rh@industest.fr / Indus2026!

**Pour chaque rôle**, tu te connectes (via Playwright MCP, **un seul login à la fois**, déconnexion entre chaque), tu navigues vers `/<X>` et tu :

1. Vérifies que tu as accès aux pages **autorisées** (statut 200, contenu rendu)
2. Vérifies que tu n'as PAS accès aux pages **interdites** (redirect login OU 403 OU notFound)
3. Pour chaque page autorisée, tu tentes une action d'écriture (POST/PUT/DELETE) :
   - Si le rôle a la permission, ça doit passer
   - Si le rôle n'a pas la permission, ça doit retourner 403

**Matrice attendue** :

| Rôle | <page>:read | <page>:write | <page>:delete | <page sensible> |
|---|---|---|---|---|
| admin | ✓ | ✓ | ✓ | ✓ |
| commercial | ✓ | ✗ | ✗ | ✗ |
| ...

**Faux positifs à éviter** : vérifier que l'agent ne se déconnecte pas entre 2 actions (browser context partagé). Si un rôle "voit" plus que prévu, vérifier d'abord que le cookie n'est pas resté du persona précédent.

**Livrable** : rapport markdown avec la matrice ci-dessus + détail des bugs RBAC trouvés.

Cleanup à la fin. Réponds en français.
  """
})
```

---

## 7. Briefer un skill métier `crm-*`

```python
Skill({
  skill: "crm-it-service",
  args: """
Tâches du jour J5 :
- Inventorier le parc physique : 18 PC industriels, 4 switches Cisco, 6 imprimantes, 3 NAS
- Créer 24 licences M365 + 5 Adobe + antivirus avec dates d'expiration variables
- Créer 3 contrats infogérance dans /it/contracts
- Traiter les 4 tickets que les autres agents t'ont ouvert pendant la semaine
- Rédiger 3 articles KB :
  1. "Comment réinitialiser son mot de passe"
  2. "Procédure d'onboarding IT nouvel arrivant"
  3. "Que faire en cas d'alerte IoT bloquante"
- Tester la recherche dans la KB + le marquage utile/pas utile

Avant de commencer :
1. Lis les 20 derniers messages de _team/channel.md
2. Vérifie shared-state.md pour les IDs déjà créés
3. Vérifie irritants.md pour ne pas redocumenter

Mode bug-hunter activé.
Format de rapport en fin de journée selon ton SKILL.md.
  """
})
```

---

## 8. Orchestration semaine IndusForge — kickoff jour 1

```python
Skill({
  skill: "crm-semaine-industrielle",
  args: """
Démarre la semaine IndusForge — Jour J1 (Lundi, Bootstrap).

Phase 0 : vérification environnement
- Vérifier que erp.eyeot.fr répond
- Vérifier que les seeds industest sont joués (login admin@industest.fr)
- Si seeds absents : ssh VPS + flask seed-industest

Phase 1 : J1 selon week-plan.md
Personas actifs aujourd'hui : Amandine (admin), Hugo (RH), Ghislaine (magasinier), Camille (chef-projet), Bernard (directeur).
Damien, Elodie, Fabien : first-login + repérage seulement.

Pour chaque persona dans l'ordre, déclencher son skill avec un brief précis du jour issu de week-plan.md.

Entre chaque persona : relire channel.md, vérifier handoffs, capturer 1-2 screenshots.

À la fin de J1 :
- Rapport stand-up dans daily-standup.md
- Synthèse irritants J1 dans irritants.md
- Décision : continuer J2 demain ou pause patch si > 5 bugs critiques
  """
})
```

---

## 9. Test cross-module via `crm-qa-orchestrator`

```python
Skill({
  skill: "crm-qa-orchestrator",
  args: """
Exécute le scénario S3 — Maintenance et intervention.

Étapes :
1. Technicien (Fabien) → déclare un équipement en panne, crée une intervention
2. Magasinier (Ghislaine) → vérifie la disponibilité des pièces détachées
3. Technicien → réalise l'intervention, rédige le rapport
4. Technicien → clôture l'intervention
5. Directeur (Bernard) → consulte le rapport de maintenance

Pour chaque étape :
- Annoncer quel agent prend la main et quelle action
- Exécuter via Playwright (login bon compte, naviguer, agir)
- Capturer screenshots aux étapes clés
- Vérifier cohérence des données (l'intervention créée par Fabien apparaît bien dans la vue Bernard)
- Reporter résultat ✅/⚠️/❌

À la fin : rapport structuré BUG-NNN, UX-NNN, recommandations.
  """
})
```

---

## 10. Re-test post-fix

```python
Agent({
  description: "Re-test post-fix Sprint S0",
  subagent_type: "general-purpose",
  run_in_background: true,
  prompt: """
Tu vérifies que les fixes Sprint S0 sont effectifs en prod.

**Compte** : <email> / <password>

**Outillage** : Playwright MCP

**Liste des fixes à vérifier** (cf. `_analysis/<dossier>/05-plan-action.md` §3.0 top 10) :

1. **BUG-IT-005** Bloquer install au-delà de total_seats
   - Repro : créer licence à 1 siège, installer sur 2 assets
   - Attendu : 2e install retourne 409 "Saturation licence"
   - Verdict : ✅/❌

2. **BUG-IT-008** Race condition 401
   - Repro : ouvrir une page IT, observer Network panel
   - Attendu : 0 erreur 401 au montage
   - Verdict : ✅/❌

[... continuer pour les 10 items]

**Livrable** : rapport `08-retest-post-fix.md`. Format :

\```
# Re-test Sprint S0 — <date>

## Résumé : N/M fixes confirmés effectifs

| # | Bug | Verdict | Détail |
| 1 | BUG-IT-005 | ✅ | Test repro : 1er install OK, 2e retourne 409. |
| 2 | BUG-IT-008 | ❌ | Toujours 12 erreurs 401 au mount de /it/tickets. |
...

## Bugs résiduels
[ceux qui ne sont pas fixés]

## Nouvelles régressions trouvées
[bugs qu'on n'avait pas avant]
\```

Cleanup à la fin. Réponds en français.
  """
})
```

---

## 11. Conseils transversaux pour rédiger un brief

### Toujours inclure
- **Persona** (1 paragraphe pour ancrer le ton)
- **Compte** (email + password + org)
- **Outillage** (`mcp__plugin_playwright_playwright__browser_*`)
- **Périmètre exhaustif** (liste, pas "etc.")
- **Livrable structuré** (template markdown)
- **Cleanup** (avec préfixe identifiable)
- **Contraintes** (qualité prime, captures, no code modif)
- **Langue** (français)

### Éviter
- Briefs vagues ("teste le module IT") → 50% du temps perdu en exploration
- Pas de format de rapport → output décousu
- Pas de cleanup → org polluée pour le prochain run
- "Etc." → l'agent saute des items
- Pas de captures → impossible de débriefer 1 semaine plus tard
- Brief trop long sans hiérarchie (5k+ tokens) → l'agent peut perdre le fil

### Calibrer la durée
- Test fonctionnel rapide : 30 min, 30-50 actions Playwright, 10-20 captures
- Test exhaustif : 1-2h, 200+ actions, 50-80 captures
- Orchestration semaine : 5-7 jours calendaires, multi-sessions

---

*Templates de prompts — 2026-04-25, v1.0.*
