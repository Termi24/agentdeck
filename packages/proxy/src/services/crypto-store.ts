import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { config } from '../config.js';

const KEY_PATH = resolve(homedir(), '.agentdeck', 'master.key');
const ALGO = 'aes-256-gcm';

let cachedKey: Buffer | null = null;

function loadOrCreateMasterKey(): Buffer {
  if (cachedKey) return cachedKey;
  const envKey = process.env.AGENTDECK_SECRETS_KEY;
  if (envKey) {
    cachedKey = scryptSync(envKey, 'agentdeck-salt', 32);
    return cachedKey;
  }
  if (existsSync(KEY_PATH)) {
    cachedKey = Buffer.from(readFileSync(KEY_PATH, 'utf8').trim(), 'hex');
    return cachedKey;
  }
  const fresh = randomBytes(32);
  mkdirSync(dirname(KEY_PATH), { recursive: true });
  writeFileSync(KEY_PATH, fresh.toString('hex'), { encoding: 'utf8', mode: 0o600 });
  cachedKey = fresh;
  return cachedKey;
}

export interface Encrypted {
  valueEncrypted: string;
  iv: string;
  tag: string;
}

export function encryptSecret(plaintext: string): Encrypted {
  const key = loadOrCreateMasterKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    valueEncrypted: enc.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

export function decryptSecret(row: Encrypted): string {
  const key = loadOrCreateMasterKey();
  const decipher = createDecipheriv(ALGO, key, Buffer.from(row.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(row.tag, 'base64'));
  const dec = Buffer.concat([decipher.update(Buffer.from(row.valueEncrypted, 'base64')), decipher.final()]);
  return dec.toString('utf8');
}

// Touch config to ensure initialization order
void config;
