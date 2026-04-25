# 02 — Tests par agents métier (skills `crm-*` + Playwright MCP)

> Méthodologie où un **LLM-agent incarne un rôle métier** (admin IT, commercial, technicien…) et **utilise l'application via Playwright MCP** comme un humain. Trouve les bugs UX, les manques fonctionnels et les frictions que les tests automatisés ne voient pas.

---

## 1. Pourquoi cette méthodologie

Un test pytest valide qu'un endpoint retourne 201. Un test E2E valide qu'on peut cliquer un bouton. **Mais aucun ne peut dire** si :
- Le libellé "Préavis (J-30)" est compréhensible par une admin IT non technique.
- Le combobox catégorie vide induit en erreur (pas de message "configurer").
- La suppression sans confirmation est risquée.
- L'API expose une fonctionnalité que l'UI cache.

Un agent métier **incarné** voit ces choses parce qu'il **a un objectif métier** ("je dois déclarer un incident wifi pour mon client interne") et qu'il bute sur les frictions comme un humain le ferait.

---

## 2. Architecture d'un skill `crm-*`

### 2.1 Localisation

```
G:\eyeot\ERP\.claude\skills\
├── crm-admin/SKILL.md           Amandine Leroy (admin sys)
├── crm-it-service/SKILL.md      Amandine Leroy (IT Service)
├── crm-commercial/SKILL.md      Damien Oberkampf (commercial)
├── crm-directeur/SKILL.md       Bernard Fontaine (directeur)
├── crm-chef-projet/SKILL.md     Camille Rouvier (chef projet IT)
├── crm-magasinier/SKILL.md      Ghislaine Perrot (magasinier)
├── crm-prospection/SKILL.md     Elodie Vasseur (SDR)
├── crm-rh/SKILL.md              Hugo Delclos (RH)
├── crm-technicien/SKILL.md      Fabien Masson (technicien)
└── crm-qa-orchestrator/SKILL.md, crm-semaine-industrielle/SKILL.md  (orchestration)
```

### 2.2 Anatomie d'un skill métier (template observé)

```markdown
---
name: crm-it-service
description: "Agent IT Service Manager expert — teste les modules IT Service Management..."
---

# Amandine Leroy — Administratrice système / Responsable IT

Tu incarnes Amandine Leroy, administratrice système et responsable IT chez
IndusForge SAS (PME industrielle, 48 pers). 10 ans d'expérience.

## Identité et expertise
- Poste : Admin système + Responsable IT (cumulative dans une PME)
- Expérience : 10 ans (ESN, DSI PME)
- Certifications : ITIL 4 Foundation, MS-900, Linux LPIC-1
- Langue : Français
- Style : ordonnée, documentation-first, obsédée par la KB

### Ce que tu sais faire
- Ticketing (tri, SLA, escalade, RCA)
- Rédaction de KB (procédures, FAQ, runbooks)
- Inventaire parc IT
- Gestion licences logicielles
- Audit RGPD

### KPIs surveillés
- Volume tickets ouverts/résolus/backlog
- Taux SLA respecté
- ...

## Connexion
- URL : https://erp.eyeot.fr
- Email : admin@industest.fr
- Mot de passe : Indus2026!
- Rôle : admin (admin:all, it:*, ged:*)

## Pages maîtrisées
- /it, /it/tickets, /it/kb, /it/fleet, /it/assets, /it/software, /it/contracts
- /admin/users, /admin/roles, ...

## Ma journée type dans la semaine IndusForge

### J5 (Vendredi) — Cœur de métier ITSM
- Inventorie le parc physique (18 PC, 4 switches, 6 imprimantes, 3 NAS)
- Crée 24 licences M365 + 5 Adobe + antivirus
- Teste les alertes d'expiration
- Crée 3 contrats infogérance
- Traite 4 tickets ouverts par les autres agents
- Rédige 3 articles KB
- Teste recherche KB + helpful

## Mon mode bug-hunter (5 questions à chaque écran)

1. Y a-t-il une confirmation visuelle après une action critique ?
2. Les messages d'erreur sont-ils actionnables ?
3. Les champs obligatoires sont-ils signalés AVANT de valider ?
4. Y a-t-il un undo sur les actions destructives ?
5. La recherche retourne-t-elle des résultats pertinents en < 1s ?

Si réponse "non" → irritant à documenter dans `_team/irritants.md`.

## Couverture attendue (checklist)

Modules à avoir touché à 100% en fin de semaine :
- [ ] /admin/users : create, edit, deactivate, reset-password
- [ ] /it/tickets : create, assign, comment, resolve, close, SLA
- [ ] /it/kb : create article, publish, search, vote
- ...

## Format de rapport de fin de journée
\```markdown
### Rapport — Amandine — Jn
**Actions réalisées**
| # | Page | Action | Résultat | Observations |
**IDs créés**
**Irritants remontés**
**Bugs techniques**
**Handoffs canal**
\```
```

### 2.3 Pourquoi cette structure marche

| Section | Rôle |
|---|---|
| Identité (poste, expérience, style) | L'agent imite un humain réaliste, pas un robot |
| KPIs surveillés | Ancrage des décisions ("je clique parce que ça impacte mon KPI") |
| Connexion (URL+credentials) | Évite les questions, démarrage immédiat |
| Pages maîtrisées | Périmètre du test |
| Journée type (J1, J5, ...) | Scénario réaliste qui chaîne les actions |
| Mode bug-hunter (5 questions) | Discipline de capture des frictions |
| Couverture attendue | Mesure post-mortem |
| Format de rapport | Structure de sortie cohérente |

---

## 3. Comment lancer un agent métier

### 3.1 Via le `Skill` tool (synchrone, dans la conversation principale)

```
> /crm-it-service
```

Avantage : interactif, on peut intervenir.
Inconvénient : pollue le contexte de la conversation principale, long.

### 3.2 Via l'`Agent` tool (asynchrone, sub-agent isolé) — **PRÉFÉRÉ**

```python
Agent({
  description: "Test fonctionnel module IT exhaustif",
  subagent_type: "general-purpose",
  run_in_background: true,
  prompt: """
    Tu es Amandine Leroy, administratrice système et responsable IT...
    [contenu copié/inspiré du SKILL.md]

    Mandat exhaustif: tester chaque endpoint API + chaque page UI du module IT.
    Compte: amine240601@gmail.com / Eyeot2026! (org eyeot)
    Outillage: mcp__plugin_playwright_playwright__browser_*
    ...

    Livrable: G:\eyeot\ERP\_analysis\07-test-exhaustif-it.md
  """
})
```

Avantage : isolé, ne pollue pas la session, run en background, on peut faire autre chose en parallèle.
Inconvénient : pas interactif, l'agent ne peut pas demander de précision.

### 3.3 Via `crm-qa-orchestrator` ou `crm-semaine-industrielle`

Pour des scénarios cross-module → cf. `03-orchestration-multi-agents.md`.

---

## 4. Mode opératoire — pas-à-pas

### Étape 1 — Préparer le mandat

Question à se poser : **quel objectif métier précis ?**

Exemples :
- "Tester le module IT en condition réelle, parcours d'un IT manager." → skill `crm-it-service`
- "Tester un cycle commercial complet de prospect à facturation." → skill `crm-commercial`
- "Vérifier que les contrôles RBAC fonctionnent pour 6 rôles différents." → orchestrator

### Étape 2 — Choisir le compte testeur

| Org | Compte | Quand utiliser |
|---|---|---|
| `eyeot` | `amine240601@gmail.com` (OWNER+PLATFORM_ADMIN) | Test des privilèges plateforme, du compte primaire |
| `IndusForge SAS` | `admin@industest.fr` à `rh@industest.fr` | Test des 8 personas avec données seedées (`flask seed-industest`) |
| Org de démo | À créer ad hoc | Test du provisioning, de l'onboarding |

### Étape 3 — Vérifier les prérequis

```bash
# 1. La cible est joignable
curl -I https://erp.eyeot.fr | head -3

# 2. Les seeds IndusForge sont joués sur cette cible
ssh -i ~/.ssh/amine-vps-deploy ubuntu@137.74.12.145 \
  "cd /opt/eyeot-erp && sudo docker compose -f docker-compose.vps.yml \
   exec -T flask-app flask seed-industest"

# 3. Les comptes se connectent (smoke test 1 compte)
curl -X POST https://erp.eyeot.fr/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@industest.fr","password":"Indus2026!"}'
```

### Étape 4 — Rédiger le brief de l'agent

Structure recommandée (voir `06-templates-prompts.md` pour le template complet) :

```
1. **Persona** : qui tu es (1 paragraphe)
2. **Mandat** : ce que tu dois tester (1 ligne précise)
3. **Compte** : credentials
4. **Outillage** : `mcp__plugin_playwright_playwright__browser_*`
5. **Périmètre** : liste exhaustive des pages / endpoints à couvrir
6. **Parcours métier** : 3-5 scénarios concrets (cycle d'usage)
7. **Mode bug-hunter** : 5 questions à chaque écran
8. **Cleanup** : suppression de tout ce qui a été créé
9. **Livrable** : chemin du rapport markdown attendu + structure
10. **Contraintes** : qualité prime sur vitesse, captures, console+network capture
```

### Étape 5 — Lancer l'agent en background

```python
Agent({
  description: "Test métier <module>",
  subagent_type: "general-purpose",
  run_in_background: true,
  prompt: <brief structuré>
})
```

### Étape 6 — Pendant que l'agent tourne

Tu peux :
- Préparer le plan d'action / la roadmap suite à venir
- Lire les rapports précédents pour intégrer les findings
- Travailler sur d'autres modules

⚠️ **Ne jamais lancer un autre agent qui touche aux mêmes fichiers**.

### Étape 7 — Lecture du livrable

Quand l'agent finit, tu reçois une notification. Tu lis le rapport (structuré dans la section 5 ci-dessous), tu intègres les findings dans le plan d'action, tu re-priorises.

---

## 5. Format standard du rapport agent métier

```markdown
# Rapport test fonctionnel <module> — eyeot ERP — <Persona>

## 0. Synthèse exécutive
- Couverture endpoints : N/M testés
- Couverture pages frontend : N/M
- Bugs détectés par sévérité (bloquant/majeur/mineur)
- Verdict global

## 1. Couverture backend (matrice exhaustive)
| Endpoint | Méthode | Status HTTP observé | Verdict | Détail |

## 2. Couverture frontend (matrice exhaustive)
| Page | Action | Verdict | Capture | Détail |

## 3. Bugs détectés (par sévérité)
### BUG-IT-001 — Bloquant : titre
- Sévérité, page/endpoint, repro, attendu, observé, capture, hypothèse cause

## 4. Frictions UX
### UX-IT-001 — titre

## 5. Manques fonctionnels visibles côté UI
### MISS-IT-001 — titre (l'API a la feature, l'UI ne l'expose pas)

## 6. Parcours métier — résultats détaillés
### P1 — <nom du parcours>
| Étape | Statut | Détail |

## 7. Console errors et erreurs réseau
(extrait de browser_console_messages + browser_network_requests)

## 8. Captures d'écran (chemins absolus)

## 9. Recommandations top 10 ordonnées
```

---

## 6. Le mode bug-hunter — 5 questions à chaque écran

Issu directement du skill `crm-it-service` (Amandine Leroy) :

1. **Y a-t-il une confirmation visuelle après une action critique ?**
   *Exemple raté* : le drawer reste ouvert silencieusement après POST 201.
2. **Les messages d'erreur sont-ils actionnables ?**
   *Exemple raté* : "Une erreur est survenue" sans précision.
3. **Les champs obligatoires sont-ils signalés AVANT de valider ?**
   *Exemple raté* : on clique "Créer", on découvre 3 champs requis manquants en rouge après coup.
4. **Y a-t-il un undo sur les actions destructives ?**
   *Exemple raté* : suppression asset au clic sur poubelle, sans modal de confirmation.
5. **La recherche retourne-t-elle des résultats pertinents en < 1s ?**
   *Exemple raté* : recherche fulltext sur 10k articles → 8s ou résultats hors sujet.

→ Si "non" à une question, c'est un irritant. Format dans `_team/irritants.md` (cf. `03-orchestration-multi-agents.md`).

---

## 7. Pièges connus (cf. `08-apprentissages.md` pour le détail)

### 7.1 Browser context partagé entre sub-agents

Si on lance 3 sub-agents Playwright en parallèle, ils **partagent les cookies HttpOnly et le localStorage**. Au bout de ~30s, tous se retrouvent logués comme le dernier persona.

**Solution** : un sub-agent à la fois, ou bien sandbox `BrowserContext` séparé par agent (en cours sur agentdeck).

### 7.2 SSE qui empêche `networkidle`

```typescript
// Dans Playwright MCP, équivalent : ne PAS attendre "networkidle"
// Attendre un sélecteur visuel concret :
await page.locator('h1:has-text("Service IT")').waitFor();
```

### 7.3 Cookie banner RGPD

Toujours dismiss en début de session, sinon ça bloque les clics :
```
mcp__plugin_playwright_playwright__browser_click(selector="button:has-text('Tout accepter')")
```

### 7.4 Rate-limit qui pollue les tests

```python
# Avant le test, attendre que la fenêtre rate-limit se renouvelle
time.sleep(60)
# Ou bien augmenter la limite côté backend pour les comptes admin (BUG-IT-001)
```

---

## 8. Quand un test métier devient inutile

- Si l'agent fait < 20 actions Playwright et termine en 5 min → mandat trop étroit, augmenter le périmètre.
- Si l'agent fait > 500 actions et termine en > 2h → mandat trop large, découper en sessions.
- Si l'agent ne capture **aucune capture d'écran** → préciser dans le brief que c'est obligatoire.
- Si l'agent rapporte 0 friction UX → l'agent n'a pas activé le mode bug-hunter, re-prompt.

---

## 9. Inventaire des skills crm-* existants (eyeot, à 2026-04-25)

| Skill | Persona | Modules testés | Compte |
|---|---|---|---|
| `crm-admin` | Amandine Leroy | admin/users, /admin/roles, settings, RGPD, billing, intégrations | `admin@industest.fr` |
| `crm-it-service` | Amandine Leroy | IT (tickets, KB, fleet, assets, software, contracts) | `admin@industest.fr` |
| `crm-commercial` | Damien Oberkampf | CRM (clients, opp, devis), commandes, finance | `commercial@industest.fr` |
| `crm-prospection` | Elodie Vasseur | Prospection avancée (séquences, signaux, scoring) | `prospection@industest.fr` |
| `crm-directeur` | Bernard Fontaine | Dashboard, analytics, intelligence, finance, approvals, reporting | `directeur@industest.fr` |
| `crm-chef-projet` | Camille Rouvier | Projets (Gantt, CPM, EVM, tâches, jalons, ressources, budget) | `chef-projet@industest.fr` |
| `crm-technicien` | Fabien Masson | Maintenance, IoT, stock pièces détachées, GED technique | `technicien@industest.fr` |
| `crm-magasinier` | Ghislaine Perrot | Stock, commandes fournisseur, réceptions, transferts inter-sites | `magasinier@industest.fr` |
| `crm-rh` | Hugo Delclos | RH (employés, contrats, congés, formations, évaluations, frais, onboarding) | `rh@industest.fr` |
| `crm-qa-orchestrator` | (méta) | Cross-module (S1-S7) | tous |
| `crm-semaine-industrielle` | (méta) | Tous (J1-J7) | tous |

---

## 10. Cas d'usage réel — le test exhaustif IT du 2026-04-24

Pour donner un exemple concret de cette méthodologie en action :

- **Mandat** : tester EXHAUSTIVEMENT le module IT (70 endpoints + 9 pages) en condition prod.
- **Persona** : Amandine Leroy (skill `crm-it-service`).
- **Compte** : `admin@industest.fr` / `Indus2026!` sur l'org IndusForge SAS.
- **Sub-agent** : `general-purpose` en `run_in_background=true`.
- **Durée** : 26 min, 218 actions Playwright, 270k tokens.
- **Résultat** :
  - 64/70 endpoints couverts (91%)
  - 9/9 pages frontend
  - 5 parcours métier exécutés (P1-P5)
  - 16 bugs + 11 frictions UX + 12 manques fonctionnels documentés
  - 29 captures
  - Top 10 hotfix chiffré (~7-8 j-h dev)
- **Livrable** : `G:\eyeot\ERP\_analysis\glpi-vs-eyeot\07-test-exhaustif-it.md` (~600 lignes structurées)

→ Toute la méthodologie détaillée du test exhaustif est dans `05-test-exhaustif-prod.md`.

---

*Tests par agents métier — 2026-04-25, v1.0.*
