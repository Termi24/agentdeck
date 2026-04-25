import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { INVENTORY_JS_EXT, inventoryWalk } from './api-inventory.js';

/**
 * React hooks cartography. Recursively scans .ts/.tsx for any
 * `export function useXxx` or `export const useXxx = ...` declaration.
 * Uniquely names them by file path so duplicates across files are
 * surfaced (sometimes a sign of accidental shadowing).
 */

export interface ReactHook {
  name: string;
  kind: 'function' | 'const';
  file: string;
  line: number;
}

export interface ReactHooksInventoryResult {
  rootPath: string;
  scannedFiles: number;
  hooks: ReactHook[];
}

const HOOK_RE =
  /export\s+(?:default\s+)?(function|const|let|var)\s+(use[A-Z]\w*)\b/g;

export function inventoryReactHooks(rootPath: string): ReactHooksInventoryResult {
  const files: string[] = [];
  inventoryWalk(rootPath, INVENTORY_JS_EXT, files);
  const hooks: ReactHook[] = [];
  for (const file of files) {
    let src: string;
    try {
      src = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    HOOK_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = HOOK_RE.exec(src)) !== null) {
      const kind = m[1] === 'function' ? 'function' : 'const';
      const name = m[2]!;
      const lineNo = src.slice(0, m.index).split(/\r?\n/).length;
      hooks.push({
        name,
        kind,
        file: relative(rootPath, file).replace(/\\/g, '/'),
        line: lineNo,
      });
    }
  }
  return { rootPath, scannedFiles: files.length, hooks };
}
