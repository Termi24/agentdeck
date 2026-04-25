import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { createDb, type AgentDeckDB } from '@agentdeck/shared/db';
import { config } from './config.js';

let db: AgentDeckDB | null = null;

export function getDb(): AgentDeckDB {
  if (!db) throw new Error('db not initialized — call initDb() first');
  return db;
}

export function initDb(): AgentDeckDB {
  if (db) return db;
  db = createDb({ url: config.DATABASE_URL });
  const migrationsFolder = resolveMigrationsFolder();
  migrate(db, { migrationsFolder });
  return db;
}

function resolveMigrationsFolder(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '../../shared/src/db/migrations');
}
