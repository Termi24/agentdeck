/**
 * Internal bug tracker (FB-10).
 *
 * Captures self-bugs of agentdeck itself — Fastify 5xx responses,
 * uncaughtException / unhandledRejection at the process level, zod
 * boundary refusals, Playwright crashes, watchdog failures, and any other
 * site-of-failure that calls `reportInternalFinding`. All findings land in
 * the `internal_findings` table, dedup'd by SHA-1 fingerprint of
 * `${source}::${category}::${normalized message}`.
 *
 * Privacy-first: messages and stacks are sanitized + truncated to 500 chars
 * each at capture time. Context (a free-form JSON dict) is NOT redacted —
 * callers are responsible for not stuffing PII / prompts into it. The
 * channel post + DM body fields are routed through `redactStringValue`
 * before they ever land in `context`.
 *
 * The admin page `/internal/findings` reads this table directly via the
 * REST routes registered in `routes/internal-findings.ts`. There is no
 * Socket.IO live channel — findings are queryable, not streamed.
 */
import { createHash, randomUUID } from 'node:crypto';
import { internalFindings } from '@agentdeck/shared';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '../db.js';

const MAX_LEN = 500;
const SECRET_PATTERNS = [
  /(?:api[_-]?key|password|secret|token|bearer)\s*[:=]\s*[^\s,;]+/gi,
  /(?:Authorization|x-api-key|x-auth)\s*:\s*\S+/gi,
];

function sanitize(text: string): string {
  let out = text;
  // Strip ANSI escape sequences (Playwright + chalk like to inject these).
  // eslint-disable-next-line no-control-regex
  out = out.replace(/\x1b\[[0-9;]*m/g, '');
  // Drop bare file:// or absolute Windows paths from stack frames.
  out = out.replace(/file:\/\/\S+/g, '<path>');
  out = out.replace(/[A-Z]:\\[^\s)]+/g, '<path>');
  // Best-effort secret redaction.
  for (const re of SECRET_PATTERNS) out = out.replace(re, '<redacted>');
  // Truncate.
  if (out.length > MAX_LEN) out = out.slice(0, MAX_LEN) + '…[truncated]';
  return out;
}

function fingerprintOf(source: string, category: string, message: string): string {
  // Normalize message: collapse whitespace, drop UUIDs and digits so
  // "agent abc-123 stuck" and "agent def-456 stuck" dedupe to one row.
  const norm = message
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<uuid>')
    .replace(/\b\d+\b/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim();
  return createHash('sha1').update(`${source}::${category}::${norm}`).digest('hex');
}

export type FindingSeverity = 'info' | 'warn' | 'error' | 'critical';
export type FindingSource = 'proxy' | 'mcp' | 'browser' | 'watchdog' | 'ui' | 'other';

export interface ReportInput {
  severity: FindingSeverity;
  source: FindingSource;
  category: string;
  message: string;
  stack?: string | null;
  context?: Record<string, unknown> | null;
}

/**
 * Single entry point for everything. Idempotent on (source,category,message)
 * — a duplicate report bumps `occurrences` and `lastSeenAt` instead of
 * inserting a new row. Synchronous: callers don't need to await.
 */
export function reportInternalFinding(input: ReportInput): void {
  try {
    const message = sanitize(input.message);
    const stack = input.stack ? sanitize(input.stack) : null;
    const fp = fingerprintOf(input.source, input.category, message);
    const now = new Date().toISOString();
    const db = getDb();

    const existing = db
      .select({ id: internalFindings.id })
      .from(internalFindings)
      .where(eq(internalFindings.fingerprint, fp))
      .get();

    if (existing) {
      db.update(internalFindings)
        .set({
          occurrences: sql`${internalFindings.occurrences} + 1`,
          lastSeenAt: now,
          // Preserve the original severity unless escalating up.
        })
        .where(eq(internalFindings.id, existing.id))
        .run();
      return;
    }

    db.insert(internalFindings).values({
      id: randomUUID(),
      fingerprint: fp,
      severity: input.severity,
      source: input.source,
      category: input.category,
      message,
      stack,
      context: input.context ?? null,
      occurrences: 1,
      status: 'open',
      firstSeenAt: now,
      lastSeenAt: now,
    }).run();
  } catch (writeErr) {
    // Last-resort: never throw out of the bug tracker. If the DB is dead,
    // log to stderr so the operator at least sees something.
    try {
      process.stderr.write(
        `[internal-bug-tracker] failed to record finding: ${
          writeErr instanceof Error ? writeErr.message : String(writeErr)
        }\n`,
      );
    } catch {
      /* ignore */
    }
  }
}

/**
 * Wire process-level exception handlers. Idempotent — safe to call from
 * multiple boot paths (server.ts only does it once today).
 */
let processHooksWired = false;
export function installProcessHooks(): void {
  if (processHooksWired) return;
  processHooksWired = true;

  process.on('uncaughtException', (err) => {
    reportInternalFinding({
      severity: 'critical',
      source: 'proxy',
      category: 'process.uncaught_exception',
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack ?? null : null,
      context: null,
    });
  });

  process.on('unhandledRejection', (reason) => {
    reportInternalFinding({
      severity: 'error',
      source: 'proxy',
      category: 'process.unhandled_rejection',
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack ?? null : null,
      context: null,
    });
  });
}
