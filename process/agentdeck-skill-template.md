# agentdeck — full-fidelity skill template

Bloc d'instructions à inclure dans toute skill ou system prompt qui doit
peupler agentdeck aussi richement que le seeder de démo. Sans ça, une session
CLI bridge n'affiche qu'un seul agent `claude-cli` et un activity feed quasi
vide.

> **Pourquoi ça compte** — agentdeck est un récepteur passif. Tout ce qui
> apparaît dans l'UI provient d'appels MCP explicites. Claude ne broadcaste
> ni son thinking ni les sub-Tasks SDK ; chaque surface (AgentTree, Channel,
> DMs, Docs, Tests, Planning, AgentDetail) doit être alimentée par un appel
> `mcp__agentdeck__*` correspondant.

---

## 1. Identité du root agent (1 appel, en tout début)

Dès le premier message :

```
mcp__agentdeck__set_agent_identity({ name: "<skill-name>", role: "<role>" })
```

Sans ça, le bridge apparaît comme `claude-cli`. Alternative permanente :
poser `AGENTDECK_SKILL_NAME=ma-skill` dans le bloc `env:` du MCP server
dans `~/.claude.json`.

## 2. Plan de travail (3-7 appels en début de run)

Avant d'attaquer le travail, déclarer le plan complet pour qu'il
apparaisse dans l'onglet **Planning** (Gantt/Calendar/Progress) :

```
mcp__agentdeck__task_plan({
  agentId: "<root-or-sub-agent-id>",
  title: "Phase 1 — cartographie",
  description: "Build api_inventory + schema_inventory",
  plannedStart: "<ISO>",
  plannedEnd: "<ISO>",
  dependencies: []
})
```

Pendant l'exécution :

```
mcp__agentdeck__task_update_progress({ taskId, progressPct: 50, status: "in_progress" })
```

À la fin de chaque tâche :

```
mcp__agentdeck__task_complete({ taskId, status: "completed" })
```

## 3. Sub-agents (1 appel par persona / Task spawné)

Toute fois que la skill délègue à un Task() ou démarre une persona, **avant
le premier outil exécuté par cette persona**, l'enregistrer :

```
mcp__agentdeck__spawn_agent({
  name: "persona-A",
  role: "ui-tester",
  prompt: "Drive the admin panel as the admin persona via browser_*. Isolated context. Cover full CRUD on /admin/users.",
  parentAgentId: "<root-agent-id>"
})
```

Le champ `prompt` est ce qui s'affiche dans l'onglet "Agents & context" et
le side-sheet AgentDetail. **Le remplir avec la vraie skill, pas un résumé
de 5 mots.**

À la fin du sub-task :

```
mcp__agentdeck__stop_agent({ agentId, status: "completed" })
```

## 4. Channel & DMs (à chaque étape signifiante)

Après chaque action notable :

```
mcp__agentdeck__post_to_channel({
  fromAgentId: "<self>",
  fromAgentName: "<self-name>",
  content: "Created user u_8421 via POST /admin/users (201)."
})
```

Pour communiquer avec un autre sub-agent :

```
mcp__agentdeck__send_direct({
  fromAgentId, fromAgentName, toAgentId, content
})
```

**Heuristique** : 1 channel par phase + 1 par finding + 1 par décision.
1 DM par hand-off entre orchestrator et sub-agent.

## 5. Test results (à chaque vérification)

Pour chaque assertion ou claim validé :

```
mcp__agentdeck__report_test_result({
  agentId: "<self>",
  suite: "rbac",
  caseName: "viewer-cannot-POST-/invoices/9821",
  status: "passed" | "failed" | "skipped",
  message: "expected 403, got 200 — privilege escalation"
})
```

Surfacé dans l'onglet **Tests** + le KPI strip + le claim-validator workflow.

## 6. Docs (à chaque artefact écrit)

Quand la skill produit un document (incident report, audit, methodology) :

```
mcp__agentdeck__publish_doc({
  path: "incidents/emoji-encoding.md",
  content: "<full markdown>",
  byAgentId: "<self>"
})
```

Convention de chemins :
- `incidents/<slug>.md` pour les bugs
- `audit/<n>-<topic>.md` pour les audits de campaign
- `inventories/<topic>.md` pour les cartographies

## 7. Fin de run (1 appel par sub + 1 root)

```
mcp__agentdeck__stop_agent({ agentId: "<sub-agent-id>", status: "completed" })  # × N subs
mcp__agentdeck__stop_agent({ agentId: "<root-agent-id>", status: "completed" })
```

---

## Bloc-template prêt à coller

À insérer dans le system prompt / les instructions d'une skill agentdeck :

```
You are running inside an agentdeck CLI bridge. Every surface of the
agentdeck dashboard (http://127.0.0.1:3000) is populated by explicit MCP
tool calls. To make this run observable end-to-end, follow this protocol
without exception:

1. FIRST MESSAGE: call mcp__agentdeck__set_agent_identity({name, role})
   with your skill's display name.
2. PLAN UPFRONT: for every phase you will execute, call
   mcp__agentdeck__task_plan({agentId, title, description, plannedStart,
   plannedEnd}) so the Planning view (Gantt) shows your roadmap.
3. SPAWN SUB-AGENTS: any time you delegate or launch a parallel persona,
   call mcp__agentdeck__spawn_agent({name, role, prompt, parentAgentId})
   BEFORE that persona makes any other call. Pass the full skill text
   as `prompt` (what the persona is asked to do, not a 5-word summary).
4. ANNOUNCE PROGRESS: call mcp__agentdeck__post_to_channel({content})
   at every meaningful step (start, finding, decision, error). Use
   send_direct for orchestrator ↔ sub-agent hand-offs.
5. REPORT TESTS: every assertion → report_test_result({suite, caseName,
   status, message}). Don't aggregate — one row per check.
6. PUBLISH DOCS: every artefact (incident, audit, inventory) →
   publish_doc({path, content}).
7. UPDATE PLANNING: as work proceeds, task_update_progress({taskId,
   progressPct, status}); at end task_complete({taskId, status}).
8. CLOSE: stop_agent for every sub then for the root.

Skipping any of these calls leaves the dashboard surface empty, even if
you completed the work. Operators inspect agentdeck — not your output —
to assess your run.
```

---

## Test smoke (script)

`scripts/test-cli-bridge.mjs` lance un `claude -p` headless en mode
non-interactif avec ce protocole dans le prompt, puis vérifie via
l'API REST agentdeck que toutes les surfaces sont peuplées :

```bash
node scripts/test-cli-bridge.mjs
```

Doit reporter :
- `agents ≥ 2` (root + au moins 1 sub-agent enregistré)
- `channel messages ≥ 3`
- `tasks ≥ 2` avec ≥ 1 in_progress et ≥ 1 completed
- `tests ≥ 1`
- root agent `prompt` non vide

Toute case verte = la skill est full-fidelity. Toute case rouge =
ajouter le tool call manquant dans la skill.
