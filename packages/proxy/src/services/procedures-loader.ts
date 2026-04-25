import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { config } from '../config.js';

export interface ProcedureEntry {
  name: string;
  path: string;
  format: 'yaml' | 'md';
  description: string | null;
  content: string;
  hash: string;
}

export function loadProcedures(): ProcedureEntry[] {
  const dir = config.PROCEDURES_DIR;
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const out: ProcedureEntry[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    let stats;
    try {
      stats = statSync(full);
    } catch {
      continue;
    }
    if (!stats.isFile()) continue;
    const ext = extname(entry).toLowerCase();
    const format = ext === '.yaml' || ext === '.yml' ? 'yaml' : ext === '.md' ? 'md' : null;
    if (!format) continue;
    const name = entry.slice(0, -ext.length);
    if (name.toLowerCase() === 'readme') continue;
    const content = readFileSync(full, 'utf8');
    out.push({
      name,
      path: full,
      format,
      description: extractDescription(content, format),
      content,
      hash: createHash('sha256').update(content).digest('hex').slice(0, 16),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function getProcedure(name: string): ProcedureEntry | null {
  return loadProcedures().find((p) => p.name === name) ?? null;
}

function extractDescription(content: string, format: 'yaml' | 'md'): string | null {
  if (format === 'yaml') {
    const match = content.match(/^description:\s*(.+)$/m);
    return match?.[1]?.replace(/^["']|["']$/g, '').trim() ?? null;
  }
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#')) continue;
    return trimmed;
  }
  return null;
}
