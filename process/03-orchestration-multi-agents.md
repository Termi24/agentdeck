# 03 — Orchestration multi-agents (semaine IndusForge + canal `_team/`)

> Méthodologie où **plusieurs agents-métier coopèrent** dans la même organisation, sur plusieurs jours, en s'échangeant des messages via un canal markdown partagé. Ils découvrent les bugs cross-module impossibles à voir en isolation.

---

## 1. Pourquoi orchestrer

Un agent métier seul (méthodo §02) ne voit que **son module**. Mais l'ERP eyeot fait 11 modules **interconnectés** :

```
RH crée employé → Admin doit pouvoir l'inviter en 1 clic
Commercial crée devis → Magasinier voit dispo stock
Magasinier crée ordre achat → Comptable voit l'engagement
Technicien escalade ticket IT → Maintenance crée Intervention
Chef projet planifie tâche → RH voit l'allocation des ressources
```

Ces handoffs sont **les bugs les plus coûteux** parce qu'ils ne ressortent qu'en condition réelle de collaboration. Aucun pytest, aucun E2E, aucun agent solo ne les capte.

---

## 2. Les 2 niveaux d'orchestration

### Niveau A — `crm-qa-orchestrator` (scénarios courts)

Cf. `G:\eyeot\ERP\.claude\skills\crm-qa-orchestrator\SKILL.md`.

| Caractéristique | Valeur |
|---|---|
| Durée | 1-3 heures |
| Nombre de scénarios | 7 (S1-S7) prédéfinis + COMPLET |
| Coordination | Synchrone : 6 onglets Playwright, 1 par persona, l'orchestrateur passe la main |
| Cible | Test ad hoc avant un jalon, pas une simulation complète |

**Scénarios disponibles** :
- **S1** : Cycle commercial complet (commercial → directeur → magasinier → finance)
- **S2** : Cycle d'achat (magasinier → directeur → magasinier → directeur)
- **S3** : Maintenance & intervention (technicien → magasinier → technicien → directeur)
- **S4** : Cycle RH onboarding (RH → admin → magasinier → RH → directeur)
- **S5** : Administration & RGPD (admin × 5 actions)
- **S6** : GED transverse (commercial → technicien → RH → admin)
- **S7** : RBAC complet (chaque rôle × autorisé/refusé)

### Niveau B — `crm-semaine-industrielle` (simulation complète J1-J7)

Cf. `G:\eyeot\ERP\.claude\skills\crm-semaine-industrielle\SKILL.md`.

| Caractéristique | Valeur |
|---|---|
| Durée | 5-7 jours calendaires (en réalité ~2 semaines compressées) |
| Personas | 8 (Amandine, Bernard, Camille, Damien, Elodie, Fabien, Ghislaine, Hugo) |
| Org | `IndusForge SAS` (slug `industest`), seedée par `flask seed-industest` |
| Coordination | **Asynchrone** via canal markdown `_team/channel.md` |
| Projet support | "Modernisation parc IT usine Lyon" (240 K€, 6 semaines) |
| Cible | Avant un jalon majeur (release v1.0, audit complet) |

---

## 3. Le projet support — IndusForge SAS

C'est un **terrain de jeu commun** plutôt qu'un test :

> **IndusForge SAS** — PME industrielle française (fonderie + usinage de précision pour l'aéronautique), 48 employés, 2 sites (Siège Paris + Usine Lyon), CA 9,2 M€. Elle vient de déployer l'ERP eyeot et teste la solution sur une semaine de production normale.

Et un **projet industriel** structurant :

> **« Modernisation parc IT – usine Lyon »** — chef : Camille Rouvier
> - Remplacement de 18 PC de production par des industrial-grade
> - Déploiement de 4 switches Cisco Catalyst 9300
> - IoT télémétrie sur 6 presses hydrauliques
> - Formation 12 opérateurs
> - Budget : 240 K€

Pourquoi ce projet ? Parce qu'il **touche tous les modules** : achats, stock, projets, GED, RH (formation), IT (fleet), maintenance (équipements), finance (suivi budget).

---

## 4. Le canal `_team/` — coordination asynchrone

C'est **la clé de voûte** de l'orchestration. Sans ce canal, les agents ne peuvent pas se coordonner.

### 4.1 Fichiers du canal

```
G:\eyeot\ERP\_team\
├── README.md                    Règles du canal, format des messages
├── channel.md                   Canal #général (chronologique, append-only)
├── shared-state.md              IDs créés (table : alias → uuid)
├── irritants.md                 Friction UX numérotées IRR-NNN
├── daily-standup.md             Stand-up quotidien (J1, J2, ..., J7)
├── week-plan.md                 Plan macro J1→J7 et matrice de couverture
├── final-report.md              Rapport de clôture
├── retest-report.md             Vérification post-fix
├── inventory-backend.md         Cliché du backend
├── screenshots/                 Captures organisées par persona × jour
└── (autres rapports ad hoc)
```

### 4.2 Format de message dans `channel.md`

```markdown
### [J3 · 14:32] 💼 Bernard (directeur) → @Damien
Le devis #DEV-20260424-007 (120 K€) a été validé. Tu peux l'envoyer
au client. Note : l'opportunité associée doit passer en "Closed Won"
quand tu reçois le bon de commande.

---

### [J3 · 14:45] 🛒 Damien (commercial) → #général
@Bernard ack. Je viens de l'envoyer (par /crm/contacts → "Envoyer
devis"). L'opportunité est passée auto en "Sent". Je passerai en
"Closed Won" dès retour client.

**Ticket #001 ouvert** : le bouton "Envoyer devis" n'a pas de toast,
j'ai dû reload pour vérifier que ça avait marché. → IRR-027.
```

### 4.3 Format de `shared-state.md`

```markdown
# État partagé IndusForge — IDs créés (chronologique)

## J1
- admin.user_id : `12345...` (créé par Amandine 09:32)
- role_custom_responsable_qualite : `id-23456` (créé par Amandine 10:14)
- emp_pierre_dupont : `87654...` (créé par Hugo 11:02)
- ...

## J2
- prospect_acme : `aaa...` (créé par Elodie 09:15, lead_score=72)
- opp_modernisation_acme : `bbb...` (créé par Damien 14:20, valeur 80 K€)
- ...
```

### 4.4 Format de `irritants.md`

```markdown
# Irritants UX

## Journal des correctifs
| Jour | IRR | Fichier(s) patché(s) |
|------|-----|----------------------|
| J1 | IRR-007 | backend/api/v1/admin/routes.py + schemas.py |
| J1 | IRR-009 | frontend/src/features/admin/roles/index.tsx |

## Faux positifs clôturés
- IRR-204 : Rate-limiter sur endpoints métier. Faux : ...

## Features à livrer (pas des irritants — manque réel)
- IRR-108 Module IoT
- IRR-207 Création produit + saisie mouvement manuel stock

---

### IRR-001 · [Orchestrateur] Rate-limit /auth/login agressif
**Sévérité** : moyen
**Page** : /login
**Repro** : 8 logins consécutifs en 30s depuis la même IP
**Attendu** : seuil distinct succès/échec ; ou hash & flow plus permissif pour
des tentatives valides
**Observé** : tous reçoivent 429 même si le mot de passe était correct

### IRR-002 · [Amandine] /admin/roles : accents cassés "Systè" au lieu de "Système"
...
```

### 4.5 Discipline d'utilisation du canal

**À chaque entrée d'agent dans la session** :
1. Lire les **20 derniers messages** de `channel.md`
2. Vérifier `shared-state.md` pour les IDs déjà créés
3. Vérifier `irritants.md` pour ne pas redocumenter un doublon
4. Poster son message de début de session avec `### [Jn · HH:MM] emoji Prénom (rôle) → destinataire`

**Après chaque action significative** :
- ID créé → ajouter dans `shared-state.md`
- Friction UX → numéroter IRR-NNN dans `irritants.md`
- Handoff vers un autre agent → message `@Prénom` dans `channel.md`

**À la fin de la journée** :
- Stand-up dans `daily-standup.md`
- Captures dans `screenshots/jN-prenom-NN.png`

---

## 5. Mode opératoire — orchestrateur

### Phase 0 — Brief et état (5 min)

```
1. Lire _team/week-plan.md → macro-scénario
2. Lire _team/channel.md → où on en est
3. Lire _team/shared-state.md → IDs déjà créés
4. Lire _team/irritants.md → ne pas redocumenter doublons
```

### Phase 1 — Vérification environnement (10 min)

```bash
# 1. Cible joignable
curl -I https://erp.eyeot.fr | head -3

# 2. Seeds joués
ssh -i ~/.ssh/amine-vps-deploy ubuntu@137.74.12.145 \
  "cd /opt/eyeot-erp && sudo docker compose exec -T flask-app flask seed-industest"

# 3. 8 logins testés rapidement (smoke avec /test-all-creates.py mode --logins-only)
python _team/test-all-creates.py --logins-only --base https://erp.eyeot.fr
```

### Phase 2 — Cadencement quotidien (J1 → J7)

Pour chaque jour :

```
1. Publier le stand-up dans daily-standup.md (3 lignes par persona : la veille / aujourd'hui / blocages)
2. Déclencher chaque skill dans l'ordre prévu par week-plan.md (1 par 1, pas en parallèle pour éviter le browser context partagé)
3. Brief précis pour chaque skill : "Tu vas travailler J<X> selon ton week-plan, tâches : <liste>. Lis canal avant. Poste IDs et irritants."
4. Après chaque agent → relire channel.md pour vérifier que les handoffs sont cohérents
5. 1-2 captures par jour dans _team/screenshots/
```

### Phase 3 — Revues intermédiaires (J3 et J5)

```
1. Compter les modules couverts vs matrice de week-plan.md
2. Relancer les agents-métier sur les modules non encore touchés
3. Consolider les irritants par sévérité et doublons
4. Si > 10 bugs critiques → pause + dev session de patch (commit en cours de semaine)
```

### Phase 4 — Clôture (J7)

```
1. Rapport final consolidé dans final-report.md
2. Tri des irritants en : patché / faux positif / à livrer
3. Re-test post-patch des correctifs
4. Identification des features manquantes (différent des bugs)
5. Bilan numérique : N modules couverts, M actions, K irritants, X patchés
```

---

## 6. Pièges connus de l'orchestration

### 6.1 Le piège du browser context partagé

**Symptôme** : 3 sub-agents lancés en parallèle, après 30s tous se retrouvent logués comme le même persona. Cause : `cookie HttpOnly refresh_token` partagé + `localStorage Zustand persist` + autofill navigateur.

**Mitigation court terme** :
- Lancer les sub-agents **séquentiellement**, pas en parallèle.
- Nettoyer cookies + localStorage avant chaque login : `mcp__plugin_playwright_playwright__browser_evaluate(function="() => { localStorage.clear(); sessionStorage.clear(); document.cookie.split(';').forEach(c => document.cookie = c.split('=')[0] + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'); }")`
- En dernier recours, utiliser un patch backend `/auth/logout-all-sessions` qui invalide tous les refresh_token côté serveur.

**Mitigation cible (cf. `G:\agentdeck\procedures\METHODOLOGY-REVIEW.md`)** : architecture context-per-agent dans le BrowserManager d'agentdeck.

### 6.2 Faux positifs de tests parallèles

Quand des agents lancent les mêmes tests en parallèle, ils créent des **collisions de fixtures** (deux assets avec même `asset_tag` autoincrémenté = 409 unique constraint). Solution :
- Préfixer les noms avec un suffixe unique par run (`uuid.uuid4().hex[:8]`)
- Utiliser un compte par persona (l'autoincrement est scopé tenant)

### 6.3 Rate-limit `/auth/login` trop agressif

Bucket commun pour toutes les tentatives login → 8 logins en 30s = 429 même si tous corrects. Mitigation : `time.sleep(15 * attempt)` avant retry, ou augmenter le bucket pour les tests.

### 6.4 Coordination asynchrone vs synchrone

- Le canal `_team/` est **append-only** : un agent qui lit ne voit que ce qui était écrit avant lui.
- **Risque** : agent A poste "j'ai créé X" mais agent B avait déjà commencé sans connaître cette info.
- **Mitigation** : avant chaque action significative, l'agent re-lit le canal. Mais c'est imparfait. Une vraie coordination synchrone (verrous, signal/wait) demanderait l'infrastructure agentdeck (`send_direct`, `wait_for_channel`).

### 6.5 Volume d'irritants à gérer

La semaine IndusForge a produit **244+ irritants** (IRR-001 → IRR-244). Sans discipline :
- Doublons (3 agents documentent le même bug 3 fois)
- Faux positifs (2 agents partageaient un browser context cassé, ils ont inventé un bug qui n'existe pas)
- Sévérité mal calibrée

Solution : **un sprint de tri post-semaine** (1 jour) pour clore les doublons, identifier les faux positifs, prioriser. ~10 faux positifs identifiés sur la semaine IndusForge réelle (cf. `_team/irritants.md` §"Faux positifs clôturés").

---

## 7. Répartition des rôles dans la semaine IndusForge

| Jour | Focus | Personas actifs |
|---|---|---|
| **J1** Lundi | Onboarding ERP + bootstrap data | Amandine, Hugo, Ghislaine, Camille, Bernard |
| **J2** Mardi | Prospection + pipeline commercial | Elodie, Damien |
| **J3** Mercredi | Validation devis + commande fournisseur | Damien, Bernard, Ghislaine |
| **J4** Jeudi | Réception + lancement projet + maintenance | Ghislaine, Camille, Fabien |
| **J5** Vendredi | Facturation + RH + IT | Bernard, Hugo, Amandine |
| **J6** Samedi | Astreinte + incident IT + documentation | Amandine, Fabien |
| **J7** Dimanche | Clôture mensuelle + revue KPIs + rapport | Bernard, Amandine |

**Règle** : un même persona peut être joué plusieurs fois dans la semaine, mais on ne joue **qu'un seul persona à la fois** pour éviter le browser context partagé.

---

## 8. Output attendu d'une orchestration

À la fin d'une semaine IndusForge :

| Livrable | Contenu | Cible |
|---|---|---|
| `_team/final-report.md` | Synthèse 2-3 pages avec KPI couverture | PO / utilisateur |
| `_team/irritants.md` finalisé | Triés par sévérité, status (patché/faux positif/à livrer) | Dev (sprint backlog) |
| `_team/shared-state.md` | Inventaire de tout ce qui a été créé pendant la semaine | Mémoire pour futures campagnes |
| `_team/screenshots/` organisés | Captures par jour × persona | Démo client / documentation |
| `_team/retest-report.md` (post-patch) | Confirmation que les fixes fonctionnent | PO + dev |

---

## 9. Quand orchestrer vs ne pas orchestrer

### Orchestrer
- Avant un jalon majeur (release v1.0, lancement client, audit)
- Après un refactor transverse (multi-org, RBAC, schéma DB)
- Pour valider la cohérence cross-module avant livraison commerciale

### Ne pas orchestrer
- Pour un hotfix d'un seul module → méthodo §02 suffit
- Pour valider une feature simple → méthodo §02 ou §01
- Si le browser context partagé n'a pas été résolu → risque énorme de faux positifs
- Si on n'a pas le budget temps de la phase de tri post-semaine

---

## 10. Cas d'usage réel — semaine IndusForge documentée

Cf. `G:\agentdeck\procedures\METHODOLOGY-REVIEW.md` pour le retex complet (analyse rédigée après 25 commits sur 2 semaines).

Quelques chiffres :
- 8 personas-métier × 7 jours = simulation hebdo cohérente
- ~60 flows UI exécutés
- 244 irritants documentés
- ~40 patches en cours de semaine
- ~10 faux positifs identifiés à la clôture
- Cause #1 des faux positifs : **browser context partagé entre sub-agents**

---

*Orchestration multi-agents — 2026-04-25, v1.0.*
