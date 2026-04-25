import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { INVENTORY_JS_EXT, inventoryWalk } from './api-inventory.js';

/**
 * Zod discriminated-union event cartography. Parses every .ts file for
 * `z.discriminatedUnion('type', [Z1, Z2, ...])` calls, then resolves the
 * referenced names to their `z.object({type: z.literal('xxx'), ...})`
 * declarations. Returns each event variant with its declared fields.
 *
 * Used by event-replay-auditor and schema-auditor to enumerate the event
 * surface with zero manual grep — guarantees ≥ 1 probe per event type
 * across the campaign.
 */

export interface EventVariant {
  type: string;
  fields: string[];
  file: string;
  line: number;
}

export interface EventsInventoryResult {
  rootPath: string;
  scannedFiles: number;
  discriminator: string | null;
  events: EventVariant[];
}

const UNION_RE = /discriminatedUnion\s*\(\s*['"](\w+)['"]\s*,\s*\[([^\]]+)\]/m;
const TYPE_LITERAL_RE = /type\s*:\s*z\.literal\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

export function inventoryEvents(rootPath: string): EventsInventoryResult {
  const files: string[] = [];
  inventoryWalk(rootPath, INVENTORY_JS_EXT, files);
  let discriminator: string | null = null;
  // Pass 1 — find the discriminatedUnion call (just for the discriminator
  // name; we don't restrict events to its referenced names because the
  // names there may be re-exports or aliased shapes that would falsely
  // hide variants from the count).
  for (const file of files) {
    let src: string;
    try {
      src = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const m = UNION_RE.exec(src);
    if (m) {
      discriminator = m[1]!;
      break;
    }
  }

  // Pass 2 — for every `type: z.literal('xxx')` occurrence, walk backward
  // up to 40 lines to locate the enclosing `const Name = z.object({...`
  // and extract the field names from the immediately following 30 lines.
  // This is cheaper and far more robust than trying to balance braces
  // across multi-line z.object definitions.
  const events: EventVariant[] = [];
  for (const file of files) {
    let src: string;
    try {
      src = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const lines = src.split(/\r?\n/);
    TYPE_LITERAL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TYPE_LITERAL_RE.exec(src)) !== null) {
      const evType = m[1]!;
      const lineIdx = src.slice(0, m.index).split(/\r?\n/).length - 1;
      const startBlock = Math.max(0, lineIdx - 40);
      const endBlock = Math.min(lines.length, lineIdx + 40);
      // Find enclosing const X = z.object — walk back
      let blockStart = startBlock;
      for (let i = lineIdx; i >= startBlock; i--) {
        if (/z\.object\s*\(/.test(lines[i] ?? '')) {
          blockStart = i;
          break;
        }
      }
      const blockText = lines.slice(blockStart, endBlock).join('\n');
      events.push({
        type: evType,
        fields: extractFieldNames(blockText),
        file: relative(rootPath, file).replace(/\\/g, '/'),
        line: lineIdx + 1,
      });
    }
  }
  return { rootPath, scannedFiles: files.length, discriminator, events };
}

const FIELD_RE = /^\s*(\w+)\s*:\s*z\./gm;
function extractFieldNames(body: string): string[] {
  const fields = new Set<string>();
  FIELD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FIELD_RE.exec(body)) !== null) {
    if (m[1] !== 'type') fields.add(m[1]!);
    else fields.add('type');
  }
  return Array.from(fields);
}
