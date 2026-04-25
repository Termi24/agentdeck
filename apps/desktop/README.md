# @agentdeck/desktop

Tauri 2 shell — deferred to **P5**. Will embed:

- the `@agentdeck/proxy` server as a sidecar binary,
- the `@agentdeck/web` Next.js static export as the UI surface,
- signed MSI installer for Windows.

Do not scaffold yet: Tauri requires `rustup` + `cargo-tauri` + platform toolchains; installing those before the proxy and web UI are stable would waste build cycles.

## When to init

Only once P1→P4 are done and the web UI is usable via `http://127.0.0.1:3000`. Then:

```bash
pnpm dlx @tauri-apps/cli@latest init
```

inside this folder, pointing `distDir` at `../web/out` (Next static export) and `devUrl` at `http://127.0.0.1:3000`.
