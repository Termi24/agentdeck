import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';

export type AgentDeckDB = BetterSQLite3Database<typeof schema>;

export interface CreateDbOptions {
  url: string;
  readonly?: boolean;
}

export function createDb({ url, readonly = false }: CreateDbOptions): AgentDeckDB {
  const filePath = url.startsWith('file:') ? url.slice('file:'.length) : url;
  if (filePath !== ':memory:') {
    mkdirSync(dirname(filePath), { recursive: true });
  }
  const sqlite = new Database(filePath, { readonly });
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('synchronous = NORMAL');
  return drizzle(sqlite, { schema });
}
