/**
 * Test-target template loader.
 *
 * Reads `process/test-targets/*.json` at proxy boot, validates each via the
 * Zod schema in `@agentdeck/shared/test-targets`, and exposes a synchronous
 * `getTemplate(target)` lookup.
 *
 * The loader is fault-tolerant by design: a corrupt template logs a warning
 * to stderr but never crashes the proxy — its absence will surface naturally
 * at `start_qa_campaign` (unknown target) or `end_campaign` (gates absent).
 *
 * Cache invalidation: the cache is process-lifetime. Call `reloadTemplates()`
 * after editing a template file (only useful in dev — production proxy
 * restarts handle it).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { TestTargetTemplate, type TestTargetTemplate as Template } from '@agentdeck/shared';
import { config } from '../config.js';

const TEMPLATES_DIR = join(config.REPO_ROOT, 'process', 'test-targets');

let cache: Map<string, Template> | null = null;

function loadAll(): Map<string, Template> {
  const out = new Map<string, Template>();
  if (!existsSync(TEMPLATES_DIR)) {
    console.warn(`[test-targets] templates dir not found: ${TEMPLATES_DIR}`);
    return out;
  }
  let files: string[];
  try {
    files = readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith('.json'));
  } catch (err) {
    console.error(`[test-targets] cannot read ${TEMPLATES_DIR}:`, err);
    return out;
  }
  for (const f of files) {
    const path = join(TEMPLATES_DIR, f);
    try {
      const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
      const parsed = TestTargetTemplate.safeParse(raw);
      if (!parsed.success) {
        console.error(`[test-targets] invalid template ${f}:`, parsed.error.message);
        continue;
      }
      if (out.has(parsed.data.target)) {
        console.warn(`[test-targets] duplicate target "${parsed.data.target}" in ${f} — first one wins`);
        continue;
      }
      out.set(parsed.data.target, parsed.data);
    } catch (err) {
      console.error(`[test-targets] failed to parse ${f}:`, err);
    }
  }
  return out;
}

export function loadTemplates(): Map<string, Template> {
  if (cache) return cache;
  cache = loadAll();
  return cache;
}

export function getTemplate(target: string): Template | undefined {
  return loadTemplates().get(target);
}

export function listTemplateNames(): string[] {
  return [...loadTemplates().keys()].sort();
}

/** Force a re-read on next call. Use after editing a template in dev. */
export function reloadTemplates(): void {
  cache = null;
}
