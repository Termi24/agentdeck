import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { INVENTORY_JS_EXT, inventoryWalk } from './api-inventory.js';

/**
 * Drizzle-ORM schema cartography. Parses every .ts file under rootPath
 * for `sqliteTable('name', { ... })` (and `pgTable`) declarations,
 * extracts columns/indexes/foreignKeys per table, returns a structured
 * inventory the schema-auditor can compare against the events union.
 *
 * Pattern is heuristic (regex on multi-line balanced braces) like
 * api_inventory — accepts the same fragility tradeoff in exchange for
 * zero AST dependency.
 */

export interface SchemaTable {
  name: string;
  file: string;
  line: number;
  columns: Array<{ name: string; type: string; primary: boolean; notNull: boolean; autoIncrement: boolean }>;
  indexes: string[];
  foreignKeys: string[]; // referenced "table.column" strings
}

export interface SchemaInventoryResult {
  rootPath: string;
  scannedFiles: number;
  tables: SchemaTable[];
}

const TABLE_RE = /(sqliteTable|pgTable)\s*\(\s*['"]([^'"]+)['"]/g;

export function inventorySchema(rootPath: string): SchemaInventoryResult {
  const files: string[] = [];
  inventoryWalk(rootPath, INVENTORY_JS_EXT, files);
  const tables: SchemaTable[] = [];
  for (const file of files) {
    let src: string;
    try {
      src = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const lines = src.split(/\r?\n/);
    TABLE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TABLE_RE.exec(src)) !== null) {
      const name = m[2]!;
      const startIdx = m.index;
      const lineNo = src.slice(0, startIdx).split(/\r?\n/).length;
      const tableBlock = extractBalancedBlock(src, startIdx);
      if (!tableBlock) continue;
      tables.push({
        name,
        file: relative(rootPath, file).replace(/\\/g, '/'),
        line: lineNo,
        columns: parseColumns(tableBlock),
        indexes: parseIndexes(tableBlock),
        foreignKeys: parseForeignKeys(tableBlock),
      });
    }
  }
  return { rootPath, scannedFiles: files.length, tables };
}

function extractBalancedBlock(src: string, startIdx: number): string | null {
  // Find the opening '{' of the second arg of sqliteTable(...)
  const openParen = src.indexOf('(', startIdx);
  if (openParen < 0) return null;
  let depthParen = 0;
  let i = openParen;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === '(') depthParen++;
    else if (ch === ')') {
      depthParen--;
      if (depthParen === 0) break;
    }
  }
  if (i >= src.length) return null;
  return src.slice(openParen, i + 1);
}

const COLUMN_RE =
  /(\w+)\s*:\s*(text|integer|real|blob|boolean|json|timestamp|varchar|uuid|serial|date|numeric)\s*\(\s*['"]([^'"]+)['"]/g;

function parseColumns(block: string): SchemaTable['columns'] {
  const cols: SchemaTable['columns'] = [];
  COLUMN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = COLUMN_RE.exec(block)) !== null) {
    const propName = m[1]!;
    const type = m[2]!;
    // Look for chain calls .primaryKey() / .notNull() / .primaryKey({autoIncrement:true})
    const tail = block.slice(m.index, Math.min(m.index + 400, block.length));
    const chainEnd = tail.search(/[,\n}]\s*[a-zA-Z_]\w*\s*:/) ?? tail.length;
    const chain = tail.slice(0, chainEnd === -1 ? tail.length : chainEnd);
    cols.push({
      name: propName,
      type,
      primary: /\bprimaryKey\b/.test(chain),
      notNull: /\bnotNull\b/.test(chain),
      autoIncrement: /autoIncrement\s*:\s*true/.test(chain),
    });
  }
  return cols;
}

const INDEX_RE = /index\s*\(\s*['"]([^'"]+)['"]/g;
function parseIndexes(block: string): string[] {
  const idxs: string[] = [];
  INDEX_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INDEX_RE.exec(block)) !== null) idxs.push(m[1]!);
  return idxs;
}

const FK_RE = /references\s*\(\s*\(\)\s*=>\s*(\w+)\.(\w+)/g;
function parseForeignKeys(block: string): string[] {
  const fks: string[] = [];
  FK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FK_RE.exec(block)) !== null) fks.push(`${m[1]}.${m[2]}`);
  return fks;
}
