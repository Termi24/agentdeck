# 09 — Glossaire

> Termes techniques et métier utilisés dans ce dossier. Ordre alphabétique.

---

## A

**Agent métier** — LLM-agent qui incarne un rôle métier (admin IT, commercial, RH…) et exécute des actions dans l'ERP via Playwright MCP. Voir §02. Différent d'un sub-agent général qui exécute une mission technique abstraite.

**Agent sub-agent (Claude Code)** — invocation d'un agent autonome via le tool `Agent`, avec son propre contexte isolé. Peut tourner en `run_in_background=true` pour ne pas bloquer la session principale. Voir §02 §05.

**API REST** — interface HTTP de l'ERP eyeot, préfixe `/api/v1/<module>/`. Toutes les réponses suivent le pattern `{"data": ..., "meta": ...}`. Erreurs RFC 7807.

**Asset (IT)** — équipement informatique dans le module IT eyeot : ordinateur, écran, imprimante, switch, serveur, etc. (9 catégories). Stocké dans la table `it_assets`.

## B

**Backend** — partie serveur Flask de l'ERP eyeot : `backend/api/`, `backend/services/`, `backend/models/`. Python 3, SQLAlchemy 2, Marshmallow.

**Browser context (Playwright)** — environnement d'isolation d'une session Playwright (cookies, localStorage, cache, service workers). Le piège majeur des tests multi-agents : un seul `BrowserContext` partagé = identités mélangées. Voir §08 §1.1.

**Bug-hunter mode** — discipline de questionnement systématique à chaque écran : 5 questions sur la UX (confirmation, message d'erreur, champ requis, undo, recherche). Voir §02 §6.

**BUG-XX-NNN** — convention de numérotation des bugs dans les rapports. `XX` = code module (ex: IT, CRM, RH). `NNN` = numéro séquentiel.

## C

**Canal `_team/`** — système de coordination asynchrone entre agents-métier, basé sur des fichiers markdown partagés (`channel.md`, `shared-state.md`, `irritants.md`, `daily-standup.md`). Voir §03.

**Cartographie** — inventaire exhaustif d'un module : modèles, routes, services, schémas, frontend, migrations, tests. Sert de checklist pour les tests exhaustifs et les comparaisons. Voir §04 §4.1.

**Cleanup** — étape obligatoire à la fin de chaque session de test métier : suppression de tous les objets créés (préfixe "TEST QA"). Sans cleanup, l'org est polluée pour les prochains tests. Voir §05 §4.7.

**`crm-*`** — préfixe des skills agents-métier dans `.claude/skills/`. 8 personas humains + 2 méta (qa-orchestrator, semaine-industrielle).

## D

**DCIM** (DataCenter Infrastructure Management) — module de cartographie physique d'un datacenter (rack, PDU, câbles). Présent dans GLPI, **pas dans eyeot** (hors scope PME).

**DoD** (Definition of Done) — critères mesurables qui définissent la complétude d'un sprint ou d'un livrable.

**Drawer** — panneau latéral droit qui s'ouvre par dessus la page (vs modal centrée). Pattern UI principal d'eyeot pour les détails et formulaires.

## E

**E2E** (End-to-End) — test qui couvre un parcours utilisateur complet, de l'UI à la DB et retour. Outillage : Playwright. Cher en maintenance, à réserver aux golden paths. Voir §01 §3.

**Endpoint** — route API spécifique (méthode HTTP + URL). Ex: `POST /api/v1/it/tickets`.

**Énumération (enum)** — type de donnée à valeurs limitées (ex: ticket.type ∈ {INCIDENT, DEMANDE} ; ticket.status ∈ {NOUVEAU, EN_COURS, ...}).

**Explore (sub-agent)** — type de sub-agent Claude Code spécialisé dans l'exploration de codebase. Plus rapide que `general-purpose` pour des cartographies. Voir §04 §4.2.

## F

**Faux positif** — bug rapporté qui n'en est pas un en réalité. Causes typiques : browser context partagé, mauvais nom de route, payload mal testé. Voir §08 §3.

**Feature flag** — drapeau qui active/désactive une fonctionnalité sans déployer du code. Ex: `LEGACY_JWT_FALLBACK`, `LEGACY_DUAL_WRITE` dans eyeot multi-org refactor.

**Fixture (pytest)** — fonction décorée `@pytest.fixture` qui produit une donnée de test réutilisable. Ex: `app`, `client`, `db`, `admin_headers`. Voir §01 §1.2.

**Fixture (script API)** — alias d'un UUID retourné par un POST, réutilisé dans les requêtes suivantes (ex: `client_id` réutilisé pour le PATCH puis le DELETE). Voir §01 §2.5.

**Fleet (IT)** — vue consolidée du parc IT (assets + software + contracts). Page `/it/fleet` dans eyeot.

## G

**GED** (Gestion Électronique de Documents) — module de gestion documentaire d'eyeot. Permet d'attacher des fichiers à n'importe quel objet métier.

**General-purpose (sub-agent)** — type de sub-agent Claude Code généraliste, accès à tous les tools y compris Playwright MCP. Voir §02 §3.2.

**GLPI** — leader open-source ITSM/ITAM, GPL v3, version 11. Concurrent de référence du module IT eyeot. Cf. `G:\eyeot\ERP\_external\glpi\`.

**Golden path** — parcours utilisateur principal d'une feature. Doit être couvert en E2E. Ex: login → créer ticket → assigner → résoudre.

## H

**Handoff** — passage de relai entre 2 agents-métier. Format dans le canal : `### [Jn · HH:MM] 🎩 Damien (commercial) → @Bernard`. Voir §03 §4.2.

**Helpdesk** — système de gestion de tickets / demandes IT. Synonyme : ticketing, ITSM (vue narrow).

## I

**IRR-NNN** — convention de numérotation des irritants UX dans `_team/irritants.md`. NNN incrémental sur la durée de la campagne.

**ITAM** (IT Asset Management) — gestion du parc IT (équipements, licences, contrats). Chez eyeot : module Fleet.

**ITIL** — référentiel des bonnes pratiques de gestion des services IT (Information Technology Infrastructure Library). Process clés : Incident, Demande, Problème, Changement.

**ITSM** (IT Service Management) — gestion des services IT (helpdesk + processus ITIL). Module IT d'eyeot vise ITSM léger ; GLPI vise ITSM complet.

## J

**JWT** (JSON Web Token) — format de token d'authentification utilisé par eyeot. Stocké dans `localStorage` côté front, en `Authorization: Bearer <token>` côté requête API.

## L

**Lot** (roadmap) — bloc de travail cohérent dans une roadmap, plus large qu'un sprint, plus petit qu'une release. Ex: "Lot 0 — Stabilité (5 j)".

## M

**MCP** (Model Context Protocol) — protocole d'extension de Claude Code permettant d'ajouter des tools natifs. Playwright MCP fournit `browser_navigate`, `browser_click`, etc.

**Membership** — table N-N user × organization dans le refactor multi-org d'eyeot. Remplace le legacy `user.organization_id` direct.

**`membership_roles`** — table pivot user × org × role permettant à un user d'avoir des rôles différents dans des orgs différentes.

**MISS-XX-NNN** — convention de numérotation des manques fonctionnels (l'API a la feature, l'UI ne l'expose pas). Distinct de BUG-XX-NNN. Voir §05 §7.5.

**Multi-tenant** — capacité d'un système à isoler les données entre organisations clientes. Implémenté chez eyeot via `TenantMixin` + cache Redis `permissions:{user_id}:{org_id}`.

## N

**Navigation manuelle (URL directe)** — accéder à une page en saisissant l'URL au clavier (vs cliquer un lien sidebar). Symptôme de navigation cassée : si seule l'URL directe marche, la nav sidebar est défaillante.

## O

**OLA** (Operational Level Agreement) — engagement interne (entre équipes, vs SLA externe avec client). Présent dans GLPI, **pas dans eyeot** (potentiel S2+).

**Onglet (drawer)** — sous-section d'un drawer de détail (ex: drawer asset → onglets Software, Contrats, Tickets liés). MISS-IT-002 = onglets manquants côté UI.

**Org** (organization) — instance multi-tenant. Un user peut appartenir à plusieurs orgs (`Membership`). Org active = claim JWT `organization_id`.

**Orchestration** — coordination de plusieurs agents-métier sur plusieurs jours via canal partagé. Voir §03.

## P

**Persona** — incarnation par un LLM-agent d'un rôle métier réaliste (Amandine admin IT, Damien commercial, etc.). Voir §02.

**Playwright** — framework de test E2E (Microsoft). Disponible :
- En CLI : `npx playwright test` sur des specs `.ts`
- En MCP : `mcp__plugin_playwright_playwright__browser_*` pour piloter Chromium depuis un agent

**Plan d'action** — découpage d'une roadmap en sprints exécutables (DoD, KPI, gouvernance, plans B/C). Voir `04-test-comparatif-cartographie.md` §8.

**Plan B/C** — alternatives à un plan principal en cas de contrainte (urgence, ressources réduites, scope élargi). Toujours proposer 3 options au PO.

**PostHog** — outil d'observability remplaçant Sentry chez eyeot. Capture analytics + erreurs frontend + backend. Dashboard EU RGPD-compliant.

**Procedure** (`G:\agentdeck\procedures\`) — runbook YAML/Markdown réutilisable, déclenché par `run_test_procedure`. Format atomique. Différent de `process/` (ce dossier-ci) qui est conceptuel.

**Pyramide des tests** — distribution recommandée : majorité de tests unitaires (rapides) → moins de tests d'intégration → encore moins de E2E (chers). Voir §00 §1.

## Q

**QA** (Quality Assurance) — discipline globale de garantie qualité d'un produit. Inclut tests automatisés ET manuels.

## R

**Race condition** — bug causé par un ordre d'exécution non déterministe. Ex: BUG-IT-008 (401 au montage avant injection token).

**Rate-limit** — limitation du nombre de requêtes par fenêtre de temps. Implémenté chez eyeot via Flask-Limiter sur `/auth/*`. Bucket commun → faux positifs en parallèle. Voir §08 §1.4-1.5.

**RBAC** (Role-Based Access Control) — modèle de droits par rôle. Chez eyeot : permissions `module:action` (ex: `it:read`, `it:write`, `admin:all`).

**RFC 7807** — standard de format d'erreur API JSON (Problem Details). Champs : `type`, `title`, `status`, `detail`, `instance`. Utilisé par eyeot via `core/errors.py`.

**Roadmap** — plan d'évolution sur plusieurs sprints / mois, organisé en lots priorisés.

## S

**S0 / S1 / S2 / ...** — sprints numérotés. S0 = hotfix urgence. S1 = stabilisation. S2-S5 = évolutions majeures.

**Seed** — données de démo / configuration de base injectées dans la DB. Chez eyeot : `flask seed-config`, `flask seed-rbac`, `flask seed-industest`.

**Skill** (Claude Code) — module de spécialisation invocable via le tool `Skill`. Localisé dans `.claude/skills/<nom>/SKILL.md`. Format frontmatter + contenu markdown.

**SLA** (Service Level Agreement) — engagement de niveau de service (temps de réponse, temps de résolution). Chez eyeot : `SLAPolicy` model. Implémentation incomplète : flag `business_hours_only` stocké mais non calculé.

**Smoke test** — test rapide qui vérifie qu'un service de base fonctionne (ex: login OK pour 8 personas en 2 min). Voir §03 §5.

**SSE** (Server-Sent Events) — protocole de push serveur → client. Utilisé par eyeot pour les notifications temps réel. Piège pour Playwright `networkidle`. Voir §08 §1.2.

**Sub-agent** — voir Agent sub-agent.

## T

**TenantMixin** — mixin SQLAlchemy qui ajoute `organization_id` FK et filtre automatique. Tous les modèles métier d'eyeot l'utilisent.

**TEST QA** — préfixe convention pour tous les objets créés pendant un test métier (`TEST QA Wifi salle réunion`, `TEST-QA-PC-001`). Permet le cleanup propre.

**Test exhaustif** — méthodologie de test qui couvre **toutes les routes API + toutes les pages UI + 5 parcours métier** d'un module. Voir §05.

**Top 10 fixes** — livrable d'un test exhaustif : 10 items priorisés P0/P1/P2 avec effort estimé, prêts à devenir le brief d'un Sprint S0.

**TOTP** (Time-based One-Time Password) — 2FA (Google Authenticator, Authy). Natif chez eyeot via `totp_routes.py`. GLPI le fait par plugin.

**TTO** (Time to Own) — délai d'assignation d'un ticket. Niveau SLA dans GLPI.

**TTR** (Time to Resolve) — délai de résolution d'un ticket. Niveau SLA dans GLPI.

## U

**UX-XX-NNN** — convention de numérotation des frictions UX (différentes des bugs et des manques). Format : `UX-IT-001`, `UX-CRM-005`.

## V

**Vitest** — framework de test unitaire frontend, alternative moderne à Jest. Utilisé chez eyeot pour les tests de composants React et hooks.

## W

**Webhook** — appel HTTP sortant d'un système vers un autre, déclenché par un événement. Chez eyeot : infra existe (HMAC-SHA256), pas branché sur événements IT (à brancher en S2).

**Werkzeug** — librairie WSGI de base de Flask. Génère les pages d'erreur HTML par défaut. Si non override, retourne 400 HTML brut au lieu de JSON RFC 7807. Voir §08 §1.11.

---

*Glossaire — 2026-04-25, v1.0. À enrichir au fil des nouveaux termes rencontrés.*
