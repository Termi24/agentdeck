# @agentdeck/desktop

**Status (v0.0.8): deferred indefinitely.** Not on the v0.0.x roadmap. The
shipping path for desktop use is `scripts/build-exe.mjs` (which produces a
self-contained `agentdeck.exe` via `@yao-pkg/pkg`) and `scripts/launch.mjs`
(which boots proxy + web + opens the browser).

## Why deferred

Tauri 2 would embed the proxy as a sidecar binary, the Next.js web UI as
the surface, and produce a signed MSI installer. The cost on Windows
(rustup + cargo-tauri + MSVC build tools + signing certificates + CI
matrix) is larger than the actual user benefit while agentdeck stays a
**solo dev tool** running locally. The Node-based launcher already
covers the "double-click to run" UX.

## Re-evaluation triggers

Spec a Tauri shell only when **one** of these becomes true:

1. The product needs to ship to multi-machine teams (signed binaries
   become a hard requirement for IT).
2. The bundled `agentdeck.exe` from `pnpm build:exe` proves to be a
   blocker for Windows Defender / SmartScreen on cold-spawn.
3. The Next.js web UI starts requiring native OS integration (system
   tray, native notifications, file system pickers beyond the
   browser sandbox).

Until then, this folder stays empty so the `pnpm install` cost of a
Tauri sidecar (which would cascade through Turborepo) is zero.

## When to init (procedure)

Once a re-evaluation trigger fires:

```bash
pnpm dlx @tauri-apps/cli@latest init
```

inside this folder, pointing `distDir` at `../web/out` (Next static
export — needs `next build && next export` upstream) and `devUrl` at
`http://127.0.0.1:3000`.

## See also

- `scripts/build-exe.mjs` — current packaging path via `@yao-pkg/pkg`.
- `scripts/launch.mjs` — production launcher (proxy + web + open browser).
- ADR equivalent in the user's vault: `01-Projects/agentdeck/02-Architecture/ADRs/`
  — should track the desktop packaging decision once a trigger fires.
