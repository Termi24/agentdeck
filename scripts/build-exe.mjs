#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';
const pnpmBin = isWindows ? 'pnpm.cmd' : 'pnpm';

function log(msg) { process.stdout.write(`[build-exe] ${msg}\n`); }

async function run(cmd, args, opts = {}) {
  const child = spawn(cmd, args, { cwd: repoRoot, shell: isWindows, stdio: 'inherit', ...opts });
  const [code] = await once(child, 'exit');
  if (code !== 0) throw new Error(`${cmd} ${args.join(' ')} failed with exit ${code}`);
}

async function main() {
  log('ensuring dependencies are installed');
  if (!existsSync(resolve(repoRoot, 'node_modules'))) {
    await run(pnpmBin, ['install']);
  }

  const bundlePath = resolve(repoRoot, 'scripts/exe-launch.bundled.cjs');
  const exePath = resolve(repoRoot, 'agentdeck.exe');

  log('bundling scripts/exe-launch.mjs → scripts/exe-launch.bundled.cjs');
  await run(pnpmBin, [
    'exec', 'esbuild',
    'scripts/exe-launch.mjs',
    '--bundle',
    '--platform=node',
    '--format=cjs',
    '--target=node22',
    `--outfile=${bundlePath}`,
    '--log-level=error',
  ]);

  log('packaging with @yao-pkg/pkg → agentdeck.exe');
  mkdirSync(dirname(exePath), { recursive: true });
  await run(pnpmBin, [
    'exec', 'pkg',
    bundlePath,
    '--targets', 'node22-win-x64',
    '--output', exePath,
    '--compress', 'GZip',
  ]);

  log(`built: ${exePath}`);
  log('Double-click agentdeck.exe (or create a desktop shortcut to it) to launch.');
  // Keep bundle for debugging; it's in .gitignore via dist-ignore patterns anyway.
  void copyFileSync;
}

main().catch((err) => {
  log(`fatal: ${err?.message ?? err}`);
  process.exit(1);
});
