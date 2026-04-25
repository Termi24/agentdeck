# CLAUDE-SNIPPET (optionnel)

> **Plus nécessaire dans le cas général.** Le serveur MCP `agentdeck` envoie
> automatiquement ses instructions au client lors du handshake `initialize`.
> Tout CLI MCP-compatible (Claude Code, Claude Desktop, Cursor, …) les injecte
> dans le system prompt sans aucune action utilisateur.
>
> Conséquence : il suffit de dire à l'agent *« utilise agentdeck pour tester
> ce projet »* — il appellera `read_methodology({section:"overview"})` puis
> `start_qa_campaign(...)` de lui-même.
>
> Garde ce snippet sous la main uniquement si tu veux **renforcer** les
> consignes dans le `CLAUDE.md` du projet cible (pour un projet hyper-critique,
> ou parce qu'un CLI tiers ignore les instructions MCP).

---

## Snippet renforcé (à coller dans le `CLAUDE.md` du projet cible — facultatif)

```markdown
## Tests QA avec agentdeck (rappel)

Le serveur MCP agentdeck fournit déjà ses instructions automatiquement.
Si jamais elles n'apparaissent pas dans ton contexte :

1. Appelle `mcp__agentdeck__read_methodology({ section: "overview" })`
2. Puis `mcp__agentdeck__start_qa_campaign({ projectName, cliSource })`
3. Suis le pipeline 9 phases en lisant chaque section avant exécution.

Avant `end_campaign` : `submit_campaign_retrospective` obligatoire.
Tu es libre de définir N personas adaptés au projet, tant que les 9 principes
sont respectés (read_methodology section "principles").
```

## Vérifier que les instructions MCP sont bien servies

Depuis n'importe quel CLI branché à agentdeck, demande simplement :

> *"Décris-moi ce que fait le MCP agentdeck."*

Si le CLI répond avec le pipeline 9 phases, les 9 principes et les sections
`read_methodology` → les instructions sont bien injectées, le snippet n'est
pas nécessaire.

Si le CLI répond évasivement (genre *"je ne sais pas, lis la liste de tools"*) →
ce CLI n'honore pas les instructions MCP du serveur, dans ce cas seulement
copie le bloc ci-dessus dans le `CLAUDE.md` du projet.
