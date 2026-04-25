# 04 — Test comparatif et cartographie vs concurrent open-source

> Méthodologie d'**analyse stratégique** où on cartographie exhaustivement notre produit ET un concurrent (typiquement open-source pour pouvoir lire le code), on compare feature-par-feature, et on en déduit une roadmap chiffrée. **Ce n'est pas du QA**, c'est de la décision produit.

---

## 1. Quand utiliser cette méthodo

| Trigger | Exemple |
|---|---|
| Avant un sprint produit majeur | "On va investir 2 mois sur le module IT, où mettre l'effort ?" |
| Avant un appel d'offres | "Le client demande ITIL, on est éligible ou pas ?" |
| À la demande du PO | "Compare notre module X vs le leader open-source, je veux savoir où on est." |
| Pour positionner commercialement | "Pourquoi un client choisirait nous vs eux ?" |
| Pour identifier les manques structurels | "Qu'est-ce qu'on n'a même pas envisagé ?" |

**Ne pas utiliser** pour :
- Trouver des bugs (c'est du QA, voir §01-02)
- Tester l'UX (c'est du QA, voir §02)
- Valider le code (c'est du QA, voir §01)

---

## 2. Cas d'usage de référence : eyeot IT vs GLPI (avril 2026)

Le dossier `G:\eyeot\ERP\_analysis\glpi-vs-eyeot\` est le résultat concret de cette méthodologie. Il contient :

| Doc | Volume | Rôle |
|---|---|---|
| `00-rapport-executif.md` | 200 lignes | Synthèse 10 min décideur |
| `01-eyeot-it-cartographie.md` | 456 lignes | Cartographie code eyeot |
| `02-glpi-cartographie.md` | 698 lignes | Cartographie code GLPI |
| `03-matrice-comparative.md` | 387 lignes | Matrice feature × ✅/⚠️/❌ |
| `04-roadmap-ameliorations.md` | 417 lignes | 8 lots priorisés avec effort |
| `05-plan-action.md` | 500+ lignes | Sprints chiffrés exécutables |

→ Total ~2 700 lignes de doc structurée, livrée en 1 session de 4-5h.

---

## 3. Architecture de la méthodologie

```
                   ┌──────────────────────────────────┐
                   │  1. Cartographie produit nous    │  ← Agent Explore
                   └──────────────┬───────────────────┘
                                  │
                                  ▼
                   ┌──────────────────────────────────┐
                   │  2. Cartographie produit concur. │  ← Agent Explore (parallèle)
                   └──────────────┬───────────────────┘
                                  │
                                  ▼
                   ┌──────────────────────────────────┐
                   │  3. Matrice comparative          │
                   │     feature × ✅/⚠️/❌            │
                   └──────────────┬───────────────────┘
                                  │
                                  ▼
                   ┌──────────────────────────────────┐
                   │  4. Roadmap d'amélioration       │
                   │     (lots, effort, priorité)     │
                   └──────────────┬───────────────────┘
                                  │
                                  ▼
                   ┌──────────────────────────────────┐
                   │  5. Plan d'action exécutable     │
                   │     (sprints, DoD, KPI)          │
                   └──────────────┬───────────────────┘
                                  │
                                  ▼
                   ┌──────────────────────────────────┐
                   │  6. Rapport exécutif (synthèse)  │
                   └──────────────────────────────────┘
```

---

## 4. Étape 1 — Cartographier notre produit

### 4.1 Quoi cartographier (par module)

| Couche | Cible |
|---|---|
| Backend models | Toutes les classes SQLAlchemy : table, attributs, relations, mixins, énumérations, contraintes |
| Backend routes | Tous les endpoints : méthode, URL, permission, schéma I/O |
| Backend services | Toutes les fonctions métier publiques, dépendances cross-module |
| Backend schemas | Marshmallow input/output |
| Frontend pages | Toutes les routes `/<module>/*` |
| Frontend features | Composants, hooks, types TS |
| Migrations | Ordre chrono, objet de chaque migration |
| Seeds | Données de démo |
| Tests | Couverture actuelle |
| Cross-module | Comment ce module s'intègre aux autres (FK, services partagés, événements) |
| Conformité standard | Vs ITIL, RGPD, ISO 27001, … |

### 4.2 Comment lancer la cartographie

```python
Agent({
  description: "Cartographie exhaustive module <X>",
  subagent_type: "Explore",      # spécialisé exploration codebase
  prompt: """
    Cartographie exhaustive du module <X> de l'ERP eyeot situé dans G:\eyeot\ERP\.

    Zones à explorer (niveau très poussé) :
    1. Backend — Models : <chemins>
    2. Backend — Routes API : <chemins>
    3. Backend — Services : <chemins>
    4. Frontend — Pages + features : <chemins>
    5. Cross-module : comment <X> s'intègre avec ...
    6. Conformité standard : vs <ITIL/HIPAA/PCI-DSS/...>
    7. Migrations : ordre chronologique
    8. Tests : couverture actuelle

    Livrable : rapport markdown 800-1500 lignes structuré, listes exhaustives,
    chemins de fichiers avec line numbers pour les points clés, forces et lacunes
    identifiées (synthèse qualitative).

    Lis aussi CARTOGRAPHY.md au préalable pour avoir une cartographie système.
    Ne code rien, recherche seulement. Réponds en français.
  """
})
```

### 4.3 Livrable type

Voir `G:\eyeot\ERP\_analysis\glpi-vs-eyeot\01-eyeot-it-cartographie.md` pour un exemple concret. Structure :

```markdown
# Cartographie exhaustive — Module <X>

## 0. Synthèse rapide (tableau métriques)
## 1. Modèles de données
## 2. API REST (par section)
## 3. Services métier
## 4. Schémas API
## 5. Frontend (pages + features + types)
## 6. Migrations Alembic
## 7. Seeds
## 8. Tests
## 9. Intégrations cross-module
## 10. Conformité <standard> — état détaillé
## 11. Forces & lacunes — synthèse
## 12. Chemins fichiers clés
```

---

## 5. Étape 2 — Cartographier le concurrent

### 5.1 Cloner le code source du concurrent

Si le concurrent est open-source (GLPI, OpenProject, Odoo Community, OFBiz, …), c'est trivial :

```bash
mkdir -p _external
git clone --depth 1 https://github.com/<org>/<repo>.git _external/<repo>
```

⚠️ **Ne pas committer `_external/`** dans git (l'ajouter au `.gitignore`).

### 5.2 Lancer la cartographie en parallèle de la nôtre

Astuce gain de temps : lancer **les deux cartographies (notre produit + concurrent) en parallèle** dans le même message :

```python
Agent({description: "Carto eyeot IT", subagent_type: "Explore", prompt: <brief 1>})
Agent({description: "Carto GLPI", subagent_type: "Explore", prompt: <brief 2>})
```

→ 2 agents tournent simultanément, le débit total est doublé.

### 5.3 Brief pour le concurrent — adapter

```python
Agent({
  description: "Cartographie exhaustive <Concurrent>",
  subagent_type: "Explore",
  prompt: """
    Cartographie exhaustive de <Concurrent> (description courte) situé dans G:\<chemin>\_external\<concurrent>\.

    Contexte : analyse comparative pro vs notre produit. <Concurrent> est <position marché>.

    Méthode : explore <dossiers clés> (équivalent de notre `backend/` et `frontend/`).
    Lis aussi CHANGELOG.md pour le scope des dernières releases, README.md, doc API si existe.

    Points à couvrir en profondeur :
    1. Périmètre fonctionnel global (par grande famille)
    2. <Module 1> (cœur historique) — détails ITIL ou similaire
    3. <Module 2> ...
    ...
    11. Architecture technique (stack PHP/Java/Python, modèle données, API)
    12. Chiffres clés (combien de classes, tables, code base, version actuelle)

    Livrable : rapport markdown 800-1500 lignes en français, structure :
    - Executive summary
    - Une section par bloc
    - Listes exhaustives des entités métier
    - Chemins fichiers concurrents clés
    - Synthèse forces distinctives + points faibles connus

    Recherche seulement, pas de code.
  """
})
```

---

## 6. Étape 3 — Matrice comparative

### 6.1 Format

```markdown
## Section X — <Domaine>

| Capacité | Nous | Concurrent | Note |
|---|---|---|---|
| Feature A | ✅ | ✅ | parité |
| Feature B | ❌ | ✅ XYZ.php | écart |
| Feature C | ✅ | ⚠️ déprécié | **avantage nous** |
| Feature D | ✅ amélioré | ⚠️ basique | **avantage nous** |
```

Légende :
- ✅ implémenté de façon cohérente
- ⚠️ présent mais incomplet/partiel
- ❌ absent
- N/A non applicable

### 6.2 Score de couverture par domaine

```markdown
| Domaine | Nous | Concurrent | Écart |
|---|---|---|---|
| Helpdesk / Ticketing | 6/10 | 9/10 | -3 |
| SLA / OLA | 4/10 | 9/10 | -5 |
| Asset / Configuration | 5/10 | 10/10 | -5 |
| ...
| Intégration ERP métier | **9/10** | 2/10 | **+7** |
```

→ Le score quantifie le diagnostic. Les **avantages structurels** (>5 d'écart en notre faveur) deviennent des **arguments commerciaux**.

### 6.3 Sections à couvrir typiquement

(adapter selon le domaine fonctionnel)

1. Helpdesk / Ticketing
2. SLA / OLA
3. Knowledge Base
4. Asset / Configuration
5. Network / Connectivity
6. DCIM (si applicable)
7. Software & Licenses
8. Contracts & Finance
9. Notifications & alertes
10. Self-service & forms
11. Multi-tenant & RBAC
12. API & intégrations
13. Reporting & analytics
14. Tests
15. **Avantages structurants nous (que le concurrent n'aura jamais)**
16. **Avantages structurants concurrent (qu'on n'a pas)**

### 6.4 Le piège à éviter

**Ne pas conclure** par "il faut tout copier le concurrent". C'est le piège du benchmarking naïf. Conclure par :
- Quels sont **nos avantages structurels** à amplifier (ex: intégration ERP) ?
- Quels sont **les manques critiques** qui empêchent la vente (ex: pas de Problem ITIL) ?
- Quels manques laisser de côté car **hors scope** (ex: DCIM pour une PME) ?

---

## 7. Étape 4 — Roadmap d'amélioration

Format : 5-10 lots, chacun avec :
- Tâches détaillées
- Fichiers à créer/modifier
- Effort en jours
- Priorité (P0/P1/P2)
- Dépendances

```markdown
## Lot N — <Nom du lot>

### Pourquoi
<1 paragraphe : raison stratégique>

### Deliverables
| Tâche | Détail | Effort |
|---|---|---|
| ... | ... | ... |

**Total Lot N** : ~X jours

### Definition of done
- ...
```

Exemple complet : `G:\eyeot\ERP\_analysis\glpi-vs-eyeot\04-roadmap-ameliorations.md`.

---

## 8. Étape 5 — Plan d'action exécutable

Découpage en sprints de 2 semaines max, avec :
- Objectif principal du sprint
- Liste des deliverables avec effort
- Definition of done
- Risques et mitigations
- KPIs cibles

Format complet : `G:\eyeot\ERP\_analysis\glpi-vs-eyeot\05-plan-action.md`.

---

## 9. Étape 6 — Rapport exécutif (synthèse)

**1 page maximum**, lisible en 10 min par un PO ou un C-level.

Structure :

```markdown
# Rapport exécutif — <Nous> vs <Concurrent>

## TL;DR (1 phrase)

## Score global (tableau : nous, concurrent, écart par domaine)

## Top 5 forces nous

## Top 10 manques critiques (P0/P1/P2 + effort)

## Manques NON prioritaires (à laisser de côté)

## Roadmap recommandée — 3 options (A/B/C avec efforts)

## Décisions à prendre (liste à cocher)

## Risques principaux (matrice probabilité × impact + mitigation)

## Documents joints (table 5-10 fichiers du dossier)
```

---

## 10. Workflow type — chronologie

```
T+0   : Brief PO ("compare notre module X vs Y, propose plan")
T+0:30: Setup (clone concurrent, mkdir _analysis, créer tasks)
T+1   : Lancer 2 agents Explore en parallèle (cartographies)
T+2-3 : Récupérer les 2 rapports, écrire la matrice comparative
T+4   : Écrire la roadmap
T+4:30: Écrire le plan d'action exécutable
T+5   : Écrire le rapport exécutif synthétique
T+5:15: Update README/index du dossier _analysis/
T+5:30: Présenter au PO les 3 options stratégiques + recommandation
```

→ Une journée bien employée pour un livrable structurant qui guide les 2-3 mois suivants.

---

## 11. Pièges spécifiques à cette méthodologie

### 11.1 Cartographies superficielles

Si l'agent Explore livre 200 lignes au lieu de 800-1500, c'est insuffisant. Re-prompter en demandant **explicitement** :
- "Listes EXHAUSTIVES, pas de 'etc.' qui cachent du contenu"
- "Pour CHAQUE classe X, lister attributs ET relations ET mixins"
- "Chemins de fichiers avec line numbers pour les points clés"

### 11.2 Score subjectif

Mettre 6/10 vs 9/10 sur "Helpdesk" est un jugement. Pour le rendre traçable, **lister 10 capacités sous chaque domaine** dans la matrice détaillée et compter (`✅ + 0,5 × ⚠️`).

### 11.3 Roadmap utopique

Si le total de la roadmap = 8 mois solo dev mais que le PO a 2 mois, **proposer 3 options A/B/C**. Toujours laisser au PO le choix de la profondeur d'investissement.

### 11.4 Oublier les avantages structurels nous

C'est le piège #1 du benchmarking : on liste tous les manques, on déprime, et on oublie qu'on a peut-être 3-5 avantages que le concurrent n'aura jamais (ex: pour eyeot vs GLPI, **intégration ERP totale + pont maintenance industrielle/IoT**).

→ **Section dédiée obligatoire** : "Avantages structurels que le concurrent n'aura jamais."

### 11.5 Ne pas tenir compte du marché

Reproduire DCIM (Rack/PDU/Cable) ressemble à un manque mais c'est inutile pour une PME. Toujours filtrer par **persona client cible**, pas par exhaustivité.

---

## 12. Variantes de la méthodologie

### Variante A — Comparaison vs SaaS commercial (closed-source)

On ne peut pas lire le code, mais on peut :
- Lire la documentation publique (gros docs, API ref, blog produit, changelog)
- Faire un essai gratuit / trial pour cartographier l'UI et le périmètre
- Lire les avis G2 / Capterra pour les forces/faiblesses perçues
- Lire les case studies pour comprendre les cas d'usage couverts

C'est moins précis mais permet de positionner.

### Variante B — Comparaison interne (audit module vs reste de l'ERP)

Un module peut être audité **vs les autres modules du même produit**. Exemple : "Mon module IT a-t-il le même niveau de tests/observabilité/i18n que le module RH ?"
- Adapter la méthodo : pas de concurrent externe, juste cartographie comparative interne.
- Output : "ce module a 60% de la maturité de la moyenne ERP".

### Variante C — Comparaison historique (avant/après refactor)

Cartographier avant refactor, après refactor, mesurer les écarts (taille code, nombre de tests, perf).

---

## 13. Quand cette méthodo a sauvé du temps (cas réel)

Avant l'analyse GLPI vs eyeot IT, l'équipe était partie sur l'idée d'**implémenter DCIM** (rack/PDU/cable visuel) pour "matcher GLPI". Cela aurait coûté 30+ jours dev pour une feature inutile aux PME industrielles.

L'analyse a montré que :
- DCIM est niche, ROI faible PME
- Au contraire, **conformité licences automatique** (5 j) + **alertes contrats** (2 j) sont des manques critiques que GLPI résout et qu'eyeot ignore
- Le pont **escalade IT → Maintenance industrielle** est un différenciant que GLPI n'aura jamais → à amplifier

→ **Économie estimée** : 30 j dev redirigés vers du valeur PME = 30 j × valeur d'une feature à fort ROI ≈ 60-90 j de valeur produit.

---

*Test comparatif et cartographie — 2026-04-25, v1.0.*
