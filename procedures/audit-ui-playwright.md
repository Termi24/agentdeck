# Procedure: audit-ui-playwright

## Objectif
Driver le dashboard agentdeck via Playwright (BrowserContext isolé) pour vérifier que toutes les surfaces UI rendent correctement et restent navigables : hub, session dashboard, dockview, replay scrubber, a11y de base.

## Pré-requis
- Playwright Chromium installé (`pnpm --filter @agentdeck/proxy exec playwright install chromium`)
- Tools : `mcp__agentdeck__browser_*` (suite complète)
- Au moins une session existante visible dans le hub

## Étapes

1. **Setup isolation**
   ```
   browser_new_context({reset:true})
   ```
   Doit retourner `{isolated:true}`.

2. **Hub `/`**
   - browser_navigate http://127.0.0.1:3000
   - browser_snapshot — vérifier KPI bar visible, session list non vide
   - Tester filtres : status tabs (Active/Past/All), search, project dropdown, live-only toggle, grid/list view
   - 1 case par filtre

3. **Session dashboard `/sessions/[id]`**
   - browser_navigate vers la session courante
   - Vérifier : sticky header, KPI strip (sub-agents/tool-calls/channel/tests), AgentTree, ActivityFeed, RunningTools, UserInputBar
   - 1 case par section visible

4. **Dockview `/sessions/[id]/dockview`**
   - browser_navigate
   - Vérifier 9 tabs fixes + tabs dynamiques par agent
   - Cliquer chaque tab, vérifier qu'il render

5. **Replay scrubber**
   - À `scrubIndex=0` (Home key), `scrubIndex=mid` (PageUp ×N), `scrubIndex=max` (End key)
   - Vérifier que les counts dans le KPI strip changent en accord
   - 3 cases (min/mid/max)

6. **A11y quick pass**
   - Tab à travers les controls du hub : focus visible, ordre logique
   - Vérifier landmarks `<main>`, `<nav>`, `<header>` présents
   - Contraste basique sur le KPI bar (compute-time check via Playwright)
   - 4 cases

7. **Screenshots**
   - browser_screenshot pour chaque surface principale (hub list, session dashboard, dockview, scrubber)
   - 4-5 captures dans le doc

8. **Cleanup**
   ```
   browser_dispose_context()
   ```

## Format des reports
- suite: `ui-playwright`
- caseName: `<surface>: <what>` (ex: `hub: kpi-bar-visible`, `session-dashboard: agent-tree-renders`)
- evidence: `{screenshot_id?, error_message?}`

## Critère de done
- ≥ 25 cases reportées
- 4 screenshots minimum
- Doc `08-ui-audit.md` publié

## Anti-patterns
- Réutiliser un context existant entre 2 personas → contamination
- Skipper l'a11y "parce que c'est lent" — 4 cases simples suffisent
- Utiliser `mcp__plugin_playwright_*` au lieu de `mcp__agentdeck__browser_*` (les screenshots ne se stockent pas dans la session)
