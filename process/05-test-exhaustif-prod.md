# 05 — Test exhaustif d'un module en production (backend + frontend)

> Méthodologie pour cartographier **l'état réel d'un module** en condition prod, avant un Sprint S0 hotfix. Couvre 100% des endpoints API (via UI ou call direct) + 100% des pages frontend + 5 parcours métier représentatifs. Livrable : rapport exhaustif chiffré (~600 lignes) qui devient le brief du sprint.

---

## 1. Contexte d'usage

Cette méthodologie a été inventée et éprouvée lors de la session du **2026-04-24** sur le module IT d'eyeot, après qu'un premier test rapide eut révélé un bug 500 sur création de ticket. Plutôt que de fixer à l'aveugle, l'équipe a **commandé un test exhaustif** pour avoir une vue claire avant tout commit.

Résultat : **64/70 endpoints API testés (91%)**, **9/9 pages frontend**, **5/5 parcours métier**, **29 captures**, **16 bugs + 11 frictions UX + 12 manques fonctionnels** documentés, **top 10 fixes priorisé en 7-8 j-h dev**. Durée : 26 minutes via agent en background, 270k tokens.

Le rapport est `G:\eyeot\ERP\_analysis\glpi-vs-eyeot\07-test-exhaustif-it.md`.

---

## 2. Quand utiliser cette méthodologie

| Trigger | Effet |
|---|---|
| Avant un Sprint S0 hotfix | Liste de bugs précise et chiffrée → backlog prêt |
| Après un refactor majeur | Vérification que rien n'a régressé en prod |
| Avant un audit qualité externe | Cliché de stabilité documenté |
| Avant une démo client critique | Identification des frictions à masquer/préempter |
| Pour préparer une release | Décision go/no-go basée sur des chiffres |

---

## 3. Pré-requis

### 3.1 Cartographie du module à jour

Avant de tester exhaustivement, il faut **savoir ce qui existe**. La cartographie sert de checklist.

→ Cf. `04-test-comparatif-cartographie.md` §4 ou simplement lire `CARTOGRAPHY.md` du projet.

L'agent QA a besoin de :
- La **liste exhaustive des endpoints** API (méthode + URL)
- La **liste exhaustive des pages** frontend
- Les **énumérations** (statuts, types, priorités)
- Les **comptes testeurs** disponibles avec credentials

### 3.2 Compte testeur correctement seedé

⚠️ Piège : si l'org n'a pas eu les seeds de configuration (catégories, SLA, départements, …), beaucoup d'endpoints retourneront des listes vides voire des erreurs 500.

```bash
ssh -i ~/.ssh/amine-vps-deploy ubuntu@137.74.12.145 \
  "cd /opt/eyeot-erp && sudo docker compose exec -T flask-app flask seed-industest"
```

Si on teste sur l'org primaire (compte du dev), vérifier :
- `flask seed-config` exécuté
- `membership_roles` corrects
- Site par défaut existe

### 3.3 Outillage Playwright MCP fonctionnel

Vérifier que le MCP `mcp__plugin_playwright_playwright__browser_*` est dispo et qu'on peut prendre un screenshot.

---

## 4. Brief de l'agent — structure exacte

Voici le template du brief utilisé pour le test exhaustif IT. **À copier et adapter**.

### 4.1 En-tête persona

```
Tu es <Persona>, <description courte (rôle, expérience, certifs)>.
Tu testes EXHAUSTIVEMENT le module <X> de l'ERP eyeot en production sur https://erp.eyeot.fr.
Ce test va servir de base à un Sprint hotfix S0.

Ton mandat est EXHAUSTIF — qualité du test prime sur la vitesse. Prévois 1h-2h de session.
```

### 4.2 Méthodologie d'observation

```
Tu utilises le MCP Playwright (mcp__plugin_playwright_playwright__browser_*).
Tu actives browser_console_messages et browser_network_requests au début de la session
pour tout capturer. Tu prends des captures à chaque écran significatif (target: 50-80).
```

### 4.3 Compte testeur

```
Compte primaire (confirmé fonctionnel) :
- Email : <email>
- Password : <password>
- Org active : <org>

Si un compte secondaire est nécessaire :
- Email : <fallback>
- Password : <fallback>
(Si le login échoue, ignorer et continuer avec le compte primaire.)
```

### 4.4 Périmètre backend — couverture endpoint par endpoint

**Le plus important** : lister TOUS les endpoints à couvrir, regroupés par section. C'est ce qui force l'exhaustivité.

```
# Périmètre — Backend (N endpoints à couvrir)

Couvre chaque endpoint au moins une fois via UI, en notant le statut HTTP observé via
browser_network_requests :

## <Section 1> (X endpoints)
- GET /api/v1/.../...
- POST /api/v1/.../...
- ...

## <Section 2> (Y endpoints)
- ...
```

→ Coller la liste depuis la cartographie. L'agent transforme ça en matrice de couverture dans le rapport final.

### 4.5 Périmètre frontend — toutes les pages

```
# Périmètre — Frontend (toutes les pages /<module>/*)

Pour chaque page, tu testes :
1. Rendu initial (vide / seedé / populé)
2. Tous les filtres et combobox (vérifier que les options s'affichent)
3. Toutes les actions exposées (boutons, menus, raccourcis)
4. Validation de formulaire (champs requis, messages d'erreur, longueurs max, formats)
5. Feedback utilisateur (toast succès/erreur, modale confirmation, état chargement)
6. Accessibilité basique (focus, tabbing, labels)
7. Performance (note tout chargement > 2s)
8. Responsive (1 fois en 1024px puis 1440px)

Pages à couvrir :
- /<module>
- /<module>/...
- ...
```

### 4.6 Parcours métier (le cœur du test)

C'est ce qui transforme le test "matrice de couverture" en test "réel". 5 parcours suffisent :

```
# Parcours métier (P1-P5)

P1 — <Scénario complet réaliste>
<Description pas-à-pas>

P2 — <Scénario lié au précédent>
<Description>

...

P5 — <Cas limite ou erreur>
<Description : tester ce qui doit casser, vérifier que ça casse proprement>
```

**Exemple parcours P1 IT** : "Login → /it/tickets → Nouveau ticket Incident Haute → assigner technicien → followup public + privé → transitions EN_COURS → EN_ATTENTE → EN_COURS → RESOLU → satisfaction 4/5 → CLOS → vérifier dashboard."

### 4.7 Cleanup obligatoire

```
# Cleanup

À la fin, supprime tout ce que tu as créé pour le test :
- <objets> avec préfixe "TEST QA"
Note tout ce qui n'a pas pu être supprimé (pas de bouton UI, etc.).
```

⚠️ **Ne jamais sauter le cleanup**. Sinon les prochains tests trouveront un état pollué.

### 4.8 Mode bug-hunter

```
# Mode bug-hunter (5 questions à se poser à chaque écran)

1. Y a-t-il une confirmation visuelle après une action critique ?
2. Les messages d'erreur sont-ils actionnables (vs "une erreur est survenue") ?
3. Les champs obligatoires sont-ils signalés AVANT de valider ?
4. Y a-t-il un undo sur les actions destructives ?
5. La recherche retourne-t-elle des résultats pertinents en < 1s ?
```

### 4.9 Livrable attendu — structure exacte

C'est crucial. Si on ne précise pas la structure, le rapport sera décousu.

```
# Livrables attendus

Fichier : G:\<projet>\_analysis\07-test-exhaustif-<module>.md (en français, markdown).

Structure :

\```
# Test exhaustif module <X> — eyeot ERP — <Persona>

## 0. Synthèse exécutive
- Couverture endpoints API : N/M testés
- Couverture pages frontend : N/M
- Bugs détectés par sévérité
- Verdict global

## 1. Couverture backend (matrice exhaustive)
| Endpoint | Méthode | Status HTTP observé | Verdict | Détail |

## 2. Couverture frontend (matrice exhaustive)
| Page | Action | Verdict | Capture | Détail |

## 3. Bugs détectés (numérotés BUG-XX-001, 002, ...)
Pour chaque bug : sévérité, page/endpoint, repro, attendu, observé, capture, hypothèse cause backend.

## 4. Frictions UX (numérotées UX-XX-001, ...)

## 5. Manques fonctionnels visibles côté UI

## 6. Parcours métier P1-P5 — résultats détaillés

## 7. Console errors et erreurs réseau capturées

## 8. Captures d'écran (chemins absolus)

## 9. Recommandations top 10 ordonnées
\```
```

### 4.10 Contraintes critiques

```
# Contraintes critiques

- Travaille consciencieusement, prends ton temps.
- Si une action retourne 500, ne la retente pas plus de 2 fois — note et continue.
- Si une page est cassée, navigue ailleurs et reviens — note la criticité.
- Captures d'écran : nomme-les <module>-deep-NN-description.png.
- Aucune modif de code, uniquement test via UI/observations réseau.
- Réponds en français.
```

---

## 5. Lancement

```python
Agent({
  description: "Test exhaustif module <X> eyeot",
  subagent_type: "general-purpose",
  run_in_background: true,         # essentiel : tourne 30 min - 2h
  prompt: <brief complet ci-dessus, ~3-5k tokens>,
})
```

→ L'agent tourne en background, on est libéré pour préparer le sprint en parallèle.

---

## 6. Stratégie d'exécution côté agent

L'agent qui a fait le test exhaustif IT a utilisé une **astuce gain de temps** :

> Au lieu de tester chaque endpoint via l'UI (lent), il a **capturé le bearer token** dans le Network panel après login UI, puis fait des **fetch directs** depuis la console du navigateur pour tester les endpoints en lot rapide. L'UI restait l'environnement (cookies, CSRF, tenant header), mais les tests d'endpoints purs étaient en `fetch()` JSON.

Pseudo-code dans le prompt agent :

```javascript
// Après login UI réussi
const token = <copié depuis Network panel>;

// Tester un endpoint rapidement
const r = await fetch('/api/v1/it/sla-policies', {
  headers: { 'Authorization': `Bearer ${token}` }
});
console.log(r.status, await r.json());
```

→ permet de couvrir 70 endpoints en 30 min au lieu de 2-3 h.

---

## 7. Format du rapport — détail d'une matrice

### 7.1 Matrice backend type

```markdown
### 1.1 Tickets manage

| Endpoint | Méthode | Status observé | Verdict | Détail |
|---|---|---|---|---|
| `/api/v1/it/tickets` | GET | 200 | ✅ | Liste paginée cursor-based, filtres confirmés. |
| `/api/v1/it/tickets/<id>/transition` | POST | 200/409 | ✅ | State machine cohérente : transitions invalides → 409 avec message clair. |
| `/api/v1/it/tickets/<id>/escalate` | POST | 400 | ❌ | **BUG-IT-002** : 400 "Ce ticket n'est pas lié à un équipement — escalade impossible". Pas documenté. |
```

Légende :
- ✅ OK
- ⚠️ comportement à vérifier
- ❌ bug
- 🔒 rate-limit observé
- ➖ non testé

### 7.2 Matrice frontend type

```markdown
| Page | Action | Verdict | Capture | Détail |
|---|---|---|---|---|
| `/it/tickets` | Render liste | ✅ | `it-deep-03-tickets-list.png` | 6 tickets seedés. |
| `/it/tickets` | Filtre Type | ❌ | — | Manquant côté UI alors que l'API filtre. |
| `/it/tickets` Drawer création | Toast succès | ❌ | `it-deep-09-ticket-cree.png` | UX-IT-001 : aucun toast après POST 201. |
```

### 7.3 Format d'un bug

```markdown
### 🔴 BUG-IT-005 — Critique : dépassement licence non bloqué (perte conformité)

- **Sévérité** : Critique métier (audit Microsoft/Adobe = sanctions)
- **Page/Endpoint** : `POST /api/v1/it/assets/<id>/software`
- **Repro** : licence avec `total_seats=1` → installer le logiciel sur 2 assets différents
- **Attendu** : 409 "Saturation licence — sièges insuffisants"
- **Observé** : 201 sur les deux installs ; `used_seats=2 > total_seats=1`
- **Capture** : voir §6 P3
- **Hypothèse cause backend** : le service `it_fleet_service.install_software()` ne fait pas de
  `if license.used_seats >= license.total_seats: raise ConflictError()`. Doit être ajouté avec lock.
```

### 7.4 Format d'une friction UX

```markdown
### 🔵 UX-IT-001 — Aucun toast après création ticket
- Sur ticket créé, drawer se ferme silencieusement, pas de toast Sonner. L'utilisateur
  ne sait pas si la création a fonctionné — il doit chercher le ticket dans la liste.
```

### 7.5 Format d'un manque fonctionnel

```markdown
### ⚪ MISS-IT-001 — Suggestions KB pendant la création de ticket
- L'endpoint `/api/v1/it/kb/suggest?title=...` existe et fonctionne (testé OK), mais le drawer
  "Nouveau ticket" ne l'appelle jamais. Quick-win pour Sprint S0.
```

### 7.6 Format des recommandations top 10 (le livrable le plus utile)

```markdown
| # | Item | Type | Effort | Impact | Justification |
|---|---|---|---|---|---|
| 1 | **BUG-IT-005** Bloquer install au-delà du `total_seats` | 🔴 P0 backend | 1 j | Critique conformité | Risque audit Microsoft/Adobe = amende potentielle |
| 2 | **BUG-IT-008** Fixer race condition 401 (guard `enabled` React Query) | 🔴 P0 frontend | 0,5 j | Quality + observability | 12 erreurs/page polluent les logs |
| 3 | **MISS-IT-001** Brancher `/kb/suggest` dans création ticket | 🟠 P0 frontend | 1 j | UX/Selfservice | API prête, vrai différenciateur |
...
```

→ **C'est cette table qui devient le brief du Sprint S0.**

---

## 8. Quoi faire avec le rapport

### 8.1 Re-prioriser le sprint

Le top 10 du rapport remplace ou complète le sprint planifié. Effort total typique : 5-8 j.

### 8.2 Mettre à jour la roadmap globale

Les bugs hors top 10 sont **distribués** dans les sprints suivants (S1, S2…) selon leur sévérité.

### 8.3 Mettre à jour le rapport exécutif

Section "🚨 État du module en prod" actualisée avec les 4-5 bugs majeurs.

### 8.4 Communiquer avec le PO

Le rapport est lisible. Le PO peut décider :
- "On fait le S0 cette semaine" (recommandation)
- "On reporte parce qu'il faut sortir feature X d'abord"
- "On supprime les manques MISS-IT-* parce qu'on assume le scope réduit"

---

## 9. Pièges spécifiques de cette méthodologie

### 9.1 Tester sur la mauvaise org

Si l'org testée n'a pas les seeds, beaucoup d'endpoints retournent des listes vides → l'agent rapporte des "manques" qui sont en fait des "données absentes". **Vérifier les seeds avant.**

### 9.2 Couvrir 100% des endpoints au détriment des parcours

Si l'agent passe 100% du temps sur la matrice et 0% sur les parcours métier, on rate les **bugs cross-action** (ex: créer ticket → assigner → résoudre fait planter à la résolution). **Forcer 5 parcours métier dans le brief.**

### 9.3 Cleanup oublié

Si l'agent crée 50 objets de test et oublie de les supprimer, l'org est polluée pour le prochain run. **Cleanup obligatoire dans le brief.**

### 9.4 Préfixe TEST QA non utilisé

Si les objets créés ne sont pas préfixés clairement, on ne peut pas les distinguer des vrais en cas de panique → impossible de cleanup en SQL direct. **"Préfixe TEST QA <suffix>" obligatoire.**

### 9.5 Trop de captures, pas de description

50 captures sans noms parlants = inutilisables 1 semaine plus tard. Convention :
```
<module>-deep-<NN>-<description-courte>.png
ex: it-deep-12-en-cours.png
ex: it-deep-29-kb-suggestions-on-create.png
```

### 9.6 Faux 500 dus à un état d'org incorrect

Le test #1 du module IT a vu un 500 sur POST /tickets. Le test #2 sur une autre org n'a vu **aucun** 500. Conclusion : le bug n'était pas dans le code mais dans l'état de seeds. **Toujours faire le test sur 2 orgs minimum** pour distinguer bug code vs bug état.

---

## 10. Comparaison avec d'autres méthodologies

| Méthodo | Effort | Profondeur | Trouve quoi | Cible |
|---|---|---|---|---|
| pytest (§01) | 1-5 j | Endpoint, service | Régressions code, contrats API | Dev |
| Script API direct (§01) | 0,5 j | Toutes routes API | Permission gaps, fixtures, 5xx massifs | Smoke release |
| E2E Playwright (§01) | 1-3 j | Parcours UI scriptés | Régressions UI | CI |
| Agent métier MCP (§02) | 0,5 j | Module entier UI | Frictions UX, manques | Avant release |
| **Test exhaustif prod (§05)** | **0,5 j** | **Module entier API+UI exhaustivement** | **Tous bugs/frictions/manques chiffrés** | **Avant Sprint S0** |
| Orchestration (§03) | 5-7 j | Cross-module | Bugs collaboration | Avant gros jalon |
| Test comparatif (§04) | 2-5 j | Stratégique | Manques structurels | Décision produit |

→ Le test exhaustif (§05) est **le plus efficace en ratio temps/output** : 30 min - 2h pour un brief de sprint complet.

---

## 11. Cas concret — le rapport `07-test-exhaustif-it.md`

Lire le rapport en entier (`G:\eyeot\ERP\_analysis\glpi-vs-eyeot\07-test-exhaustif-it.md`) pour voir la méthodo en application.

Quelques highlights :
- **Découverte critique** : bug de conformité licence (BUG-IT-005) — non couvert par les tests pytest existants (il n'y en a pas), non couvert par le test #1 (test parcours pas exhaustif), captée seulement par le parcours P3 du test exhaustif.
- **12 manques fonctionnels** documentés (l'API a la fonctionnalité, l'UI ne l'expose pas) → ces 12 items sont "gratuits" à fix, pure intégration UI.
- **Etat machine excellent** côté API : "Transition invalide: NOUVEAU -> RESOLU. Transitions possibles: EN_COURS, ANNULE" — modèle à reprendre dans d'autres modules.

---

*Test exhaustif d'un module en production — 2026-04-25, v1.0.*
