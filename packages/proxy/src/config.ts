import 'dotenv/config';
import { existsSync } from 'node:fs';
import { dirname, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const Schema = z.object({
  PROXY_HOST: z.string().default('127.0.0.1'),
  PROXY_PORT: z.coerce.number().int().positive().default(4317),
  DATABASE_URL: z.string().default('file:./data/agentdeck.db'),
  WORKSPACE_ROOT: z.string().default('./data/workspaces'),
  PROCEDURES_DIR: z.string().default('./procedures'),
  ANTHROPIC_API_KEY: z.string().optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

const raw = Schema.parse(process.env);
const repoRoot = findRepoRoot();

function findRepoRoot(): string {
  const envRoot = process.env.PNPM_WORKSPACE_DIR ?? process.env.npm_config_local_prefix;
  if (envRoot) return envRoot;
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function resolveFromRoot(p: string): string {
  return isAbsolute(p) ? p : resolve(repoRoot, p);
}

function resolveFileUrl(url: string): string {
  const bare = url.startsWith('file:') ? url.slice('file:'.length) : url;
  return `file:${resolveFromRoot(bare)}`;
}

export const config = {
  ...raw,
  DATABASE_URL: resolveFileUrl(raw.DATABASE_URL),
  WORKSPACE_ROOT: resolveFromRoot(raw.WORKSPACE_ROOT),
  PROCEDURES_DIR: resolveFromRoot(raw.PROCEDURES_DIR),
  REPO_ROOT: repoRoot,
};
export type Config = typeof config;
