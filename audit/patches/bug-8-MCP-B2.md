# BUG-MCP-B2 — MCP dist out of sync with src

## Status: PROCESS-FIX (rebuild, not a code patch)

## Trigger

`packages/mcp/dist/index.js` is committed for the Claude CLI bridge (which spawns the MCP via `claude` and has no access to `tsx`). When `packages/mcp/src/*` changes — typically when adding a tool — the dist drifts and CLI bridge users see stale tool schemas / missing tools until somebody runs the build.

## Resolution

Document and bake a build invocation:

```bash
pnpm --filter @agentdeck/mcp build
```

After any change in `packages/mcp/src/`. Optional follow-up (out of scope for this phase): add a `prepare` hook in `packages/mcp/package.json` so `pnpm install` auto-rebuilds the dist on every clean install. That is a `package.json` edit which Phase-7 hard rules disallow without explicit approval (would also have CI implications).

## No diff authored.

If after applying the other 9 patches you want a follow-up that adds the prepare hook, ping me.
