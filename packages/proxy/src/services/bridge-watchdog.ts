/**
 * Bridge session watchdog.
 *
 * CLI-bridged sessions have no `runSession()` loop behind them, so nothing
 * in the proxy knows when the Claude CLI that owns them dies. This leaves
 * a stale `status='running'` row forever in the DB, cluttering the hub.
 *
 * This service closes that gap with two mechanisms:
 *
 *  1. **Runtime heartbeat.** `POST /sessions/:id/heartbeat` from the MCP
 *     stdio server proves the CLI is still alive. The watchdog sweeps
 *     every 30 s and finalizes any bridge session whose last heartbeat
 *     is older than STALE_MS (90 s) — the CLI either died or stopped
 *     using agentdeck long enough that the session is no longer useful
 *     as a live observability target.
 *
 *  2. **Boot reaper.** On proxy startup, every bridge session still in
 *     `status='running'` in the DB is necessarily stale (the process
 *     that created them can no longer reach this new proxy instance),
 *     so we finalize them all with `status='completed'`.
 *
 * Heartbeats are stored in memory only; we do not want to write a row
 * to `events` every 30 s per active CLI.
 */
import type { AgentDeckEvent } from '@agentdeck/shared';
import { agents, sessions } from '@agentdeck/shared';
import { and, eq, isNull } from 'drizzle-orm';
import type { EventBus } from '../event-bus.js';
import { getDb } from '../db.js';
import { appendEvent, finalizeSession } from '../persistence.js';

const STALE_MS = 90 * 1000;
const SWEEP_INTERVAL_MS = 30 * 1000;
/**
 * Grace period after boot: the watchdog skips the first sweep so a CLI
 * that was mid-request when the proxy restarted has a chance to re-ping
 * before being reaped. Not strictly needed given boot reaper already
 * cancels stale bridges from the previous proxy instance, but cheap safety.
 */
const BOOT_GRACE_MS = 60 * 1000;

const lastHeartbeat = new Map<string, number>();
let bootAt = Date.now();
let sweepTimer: NodeJS.Timeout | null = null;

/**
 * Register a bridge session for heartbeat tracking. Called from session
 * manager immediately after `insertSession` + `insertAgent` for bridges.
 */
export function registerBridgeSession(sessionId: string): void {
  lastHeartbeat.set(sessionId, Date.now());
}

/**
 * Bump the in-memory heartbeat for a bridge session.
 *
 * Revival path: after a proxy restart, a still-living CLI's first heartbeat
 * hits a session that the boot reaper finalized as `completed`. Rather than
 * lose that CLI to the "Past" bucket, we undo the reap by flipping the row
 * back to `running` on the first ping. The watchdog then tracks it normally.
 */
export function bumpBridgeHeartbeat(sessionId: string): void {
  const known = lastHeartbeat.has(sessionId);
  lastHeartbeat.set(sessionId, Date.now());
  if (known) return;

  const db = getDb();
  const row = db.select({ status: sessions.status }).from(sessions).where(eq(sessions.id, sessionId)).get();
  if (row && row.status !== 'running') {
    db.update(sessions).set({ status: 'running', endedAt: null }).where(eq(sessions.id, sessionId)).run();
  }
}

export function unregisterBridgeSession(sessionId: string): void {
  lastHeartbeat.delete(sessionId);
}

function emitEnded(eventBus: EventBus, sessionId: string, nowIso: string): void {
  const ev: AgentDeckEvent = {
    type: 'session.ended',
    sessionId,
    status: 'completed',
    totalTokensIn: 0,
    totalTokensOut: 0,
    at: nowIso,
  };
  appendEvent(ev);
  eventBus.emit(ev);
}

/**
 * Finalize every bridge session still marked running in the DB. Called
 * once at startup: any such row is a ghost from a dead proxy instance.
 */
export function reapOrphanBridgesOnBoot(eventBus: EventBus): number {
  const db = getDb();
  const orphans = db
    .select({ id: sessions.id, role: agents.role })
    .from(sessions)
    .leftJoin(agents, and(eq(agents.sessionId, sessions.id), isNull(agents.parentAgentId)))
    .where(eq(sessions.status, 'running'))
    .all()
    .filter((r) => r.role === 'bridge');

  const now = new Date().toISOString();
  for (const row of orphans) {
    finalizeSession(row.id, { status: 'completed', totalTokensIn: 0, totalTokensOut: 0 });
    emitEnded(eventBus, row.id, now);
  }
  return orphans.length;
}

export function startBridgeWatchdog(eventBus: EventBus, logger?: { info: (m: string) => void }): () => void {
  bootAt = Date.now();
  sweepTimer = setInterval(() => sweep(eventBus, logger), SWEEP_INTERVAL_MS);
  sweepTimer.unref?.();
  return () => {
    if (sweepTimer) clearInterval(sweepTimer);
    sweepTimer = null;
  };
}

function sweep(eventBus: EventBus, logger?: { info: (m: string) => void }): void {
  const now = Date.now();
  if (now - bootAt < BOOT_GRACE_MS) return;

  const nowIso = new Date().toISOString();
  const killed: string[] = [];
  for (const [sessionId, last] of lastHeartbeat) {
    if (now - last > STALE_MS) {
      try {
        finalizeSession(sessionId, { status: 'completed', totalTokensIn: 0, totalTokensOut: 0 });
        emitEnded(eventBus, sessionId, nowIso);
        lastHeartbeat.delete(sessionId);
        killed.push(sessionId);
      } catch {
        // finalizeSession on a row that's already completed is a no-op in SQLite
        lastHeartbeat.delete(sessionId);
      }
    }
  }
  if (killed.length && logger) {
    logger.info(`bridge-watchdog: finalized ${killed.length} stale bridge session(s)`);
  }
}
