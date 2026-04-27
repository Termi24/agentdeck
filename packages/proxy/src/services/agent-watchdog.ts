/**
 * Stuck-agent watchdog (FB-01).
 *
 * Sweeps every 60 s and looks at every agent currently `running`,
 * `pending`, or `waiting_tool`. For each agent we compute
 * `lastEventAt = MAX(events.created_at WHERE agent_id = ? AND type NOT IN
 * (watchdog event types))` — i.e. the most recent meaningful activity from
 * this agent. The wall-clock difference becomes `stuckMinutes`.
 *
 * Two escalation tiers, each fired AT MOST ONCE per stuck episode:
 *
 *   • 3 min — `agent.stuck.warning` event. No action, no row in
 *     `agent_incidents`. The dashboard's AgentTree picks up the badge.
 *
 *   • 5 min — `agent.stuck.intervention` event + `agent_incidents` row
 *     + auto-published markdown doc + channel post + soft cancel via
 *     `agent_cancel_requests`. The agent is given a chance to wind down
 *     gracefully; the watchdog does NOT hard-stop it (running tool calls
 *     get to finish their network round-trip).
 *
 * Per-agent state (`warned` / `intervened`) is reset as soon as the agent
 * emits a fresh non-watchdog event, so a single agent can be flagged
 * multiple times across its lifetime if it deadlocks more than once.
 *
 * "Silencieux" by design: only the threshold-crossing tick speaks. Between
 * ticks, between thresholds, and during normal activity, the watchdog is
 * silent.
 */
import { randomUUID } from 'node:crypto';
import type { AgentDeckEvent } from '@agentdeck/shared';
import { agentCancelRequests, agentIncidents, agents, channelMessages, docs, events } from '@agentdeck/shared';
import { and, eq, sql } from 'drizzle-orm';
import type { EventBus } from '../event-bus.js';
import { getDb } from '../db.js';
import { appendEvent, inTx } from '../persistence.js';
import { reportInternalFinding } from './internal-bug-tracker.js';

const TICK_INTERVAL_MS = 60 * 1000;
const WARN_THRESHOLD_MS = 3 * 60 * 1000;
const INTERVENE_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Event types we emit ourselves. Must be excluded when computing
 * `lastEventAt` so the watchdog doesn't reset its own clock.
 */
const SELF_EVENT_TYPES = ['agent.stuck.warning', 'agent.stuck.intervention'];

const SYSTEM_AGENT_ID = 'system:watchdog';
const SYSTEM_AGENT_NAME = 'agentdeck-watchdog';

interface AgentState {
  warned: boolean;
  intervened: boolean;
  /** lastEventAt from the most recent tick — used to detect "agent moved" so
   *  state is cleared and the agent could be re-flagged later. */
  lastSeenAt: string | null;
}

const stateByAgent = new Map<string, AgentState>();

let tickTimer: NodeJS.Timeout | null = null;

interface CandidateRow {
  id: string;
  sessionId: string;
  name: string;
  status: string;
  lastEventAt: string | null;
  lastEventType: string | null;
  runningToolCalls: number;
}

function loadCandidates(): CandidateRow[] {
  const db = getDb();
  // Single query: for every running agent, get its last non-self event +
  // the running tool-call count. Correlated sub-queries with raw SQL so
  // Drizzle doesn't drop the table prefix in nested scopes (cf. the
  // listSessions correlated-sub-query trap documented in persistence.ts).
  const rows = db
    .select({
      id: agents.id,
      sessionId: agents.sessionId,
      name: agents.name,
      status: agents.status,
      lastEventAt: sql<string | null>`(SELECT MAX(events.created_at) FROM events WHERE events.agent_id = agents.id AND events.type NOT IN ('agent.stuck.warning','agent.stuck.intervention'))`,
      lastEventType: sql<string | null>`(SELECT events.type FROM events WHERE events.agent_id = agents.id AND events.type NOT IN ('agent.stuck.warning','agent.stuck.intervention') ORDER BY events.created_at DESC LIMIT 1)`,
      runningToolCalls: sql<number>`(SELECT count(*) FROM tool_calls WHERE tool_calls.agent_id = agents.id AND tool_calls.status = 'running')`,
    })
    .from(agents)
    .where(sql`${agents.status} IN ('running','pending','waiting_tool')`)
    .all();
  return rows.map((r) => ({
    ...r,
    runningToolCalls: Number(r.runningToolCalls ?? 0),
  }));
}

function isAwaitingUserInput(sessionId: string, agentId: string): boolean {
  // `await_user_input` is a legitimate "blocked but not stuck" state. We
  // detect it by checking for an unconsumed user_inputs prompt OR by
  // looking at the most recent event being a user.input.awaiting that
  // hasn't been resolved yet.
  const db = getDb();
  const lastInputEvent = db
    .select({ type: events.type, payload: events.payload, createdAt: events.createdAt })
    .from(events)
    .where(and(eq(events.sessionId, sessionId), eq(events.agentId, agentId)))
    .orderBy(sql`${events.createdAt} DESC`)
    .limit(1)
    .get();
  if (!lastInputEvent) return false;
  return lastInputEvent.type === 'user.input.awaiting';
}

function nowIso(): string {
  return new Date().toISOString();
}

function diffMinutes(now: number, isoOrSqlite: string | null): number {
  if (!isoOrSqlite) return Number.POSITIVE_INFINITY;
  // The SQLite default `current_timestamp` returns "YYYY-MM-DD HH:MM:SS"
  // which JS parses as local time. Force UTC interpretation. Same trick as
  // persistence.ts:toIso().
  const iso = isoOrSqlite.includes('T') ? isoOrSqlite : isoOrSqlite.replace(' ', 'T') + 'Z';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return Math.floor((now - t) / 60_000);
}

function emitWarning(eventBus: EventBus, c: CandidateRow, stuckMinutes: number, at: string): void {
  const event: AgentDeckEvent = {
    type: 'agent.stuck.warning',
    sessionId: c.sessionId,
    agentId: c.id,
    agentName: c.name,
    stuckMinutes,
    lastEventType: c.lastEventType,
    lastEventAt: c.lastEventAt ? (c.lastEventAt.includes('T') ? c.lastEventAt : c.lastEventAt.replace(' ', 'T') + 'Z') : null,
    runningToolCalls: c.runningToolCalls,
    at,
  };
  inTx(() => {
    appendEvent(event);
  });
  eventBus.emit(event);
}

function buildIncidentMarkdown(c: CandidateRow, stuckMinutes: number, action: string): string {
  return [
    `# Stuck-agent incident — ${c.name}`,
    '',
    `- **Agent**: \`${c.id}\` (${c.name})`,
    `- **Session**: \`${c.sessionId}\``,
    `- **Status at trigger**: ${c.status}`,
    `- **Stuck for**: ${stuckMinutes} min (≥ ${INTERVENE_THRESHOLD_MS / 60000} min threshold)`,
    `- **Last event type**: ${c.lastEventType ?? 'none'}`,
    `- **Last event at**: ${c.lastEventAt ?? 'never'}`,
    `- **Running tool calls**: ${c.runningToolCalls}`,
    `- **Auto-action taken**: ${action}`,
    '',
    '## What this means',
    '',
    'No event was emitted on behalf of this agent for the threshold window —',
    'no message delta, no tool call lifecycle change, no channel post, no DM,',
    'no doc, no test result. The agent is either deadlocked, waiting on a',
    'network call that never returns, or its host process died silently.',
    '',
    '## What the watchdog did',
    '',
    'A soft cancel request was inserted into `agent_cancel_requests`. The next',
    'time the agent (or its host) polls `check_cancellation`, it will see',
    '`cancelled: true` and can wind down gracefully. If the agent never polls,',
    'it will eventually time out via its own host machinery — the watchdog',
    'does not hard-stop the SDK process.',
    '',
    '## What you should do',
    '',
    '1. Open the session dashboard and review the agent activity feed.',
    '2. If the agent is genuinely deadlocked, call',
    '   `mcp__agentdeck__stop_agent({agentId, status: "cancelled"})`',
    '   to mark it terminated for the hub UI.',
    '3. If this happens repeatedly with the same agent role / persona,',
    '   inspect its system prompt / skill — it may be entering an infinite loop.',
  ].join('\n');
}

function emitIntervention(
  eventBus: EventBus,
  c: CandidateRow,
  stuckMinutes: number,
  at: string,
  logger?: { info?: (m: string) => void; warn?: (m: string) => void },
): void {
  const incidentId = randomUUID();
  const docId = randomUUID();
  const docPath = `incidents/stuck-${c.id.slice(0, 8)}-${at.slice(0, 19).replace(/[:T]/g, '-')}.md`;
  const action = 'cancel_requested';
  const markdown = buildIncidentMarkdown(c, stuckMinutes, action);

  const event: AgentDeckEvent = {
    type: 'agent.stuck.intervention',
    sessionId: c.sessionId,
    agentId: c.id,
    agentName: c.name,
    stuckMinutes,
    lastEventType: c.lastEventType,
    lastEventAt: c.lastEventAt ? (c.lastEventAt.includes('T') ? c.lastEventAt : c.lastEventAt.replace(' ', 'T') + 'Z') : null,
    runningToolCalls: c.runningToolCalls,
    actionTaken: action,
    incidentId,
    incidentDocPath: docPath,
    at,
  };

  // Also auto-publish a doc.published event so the doc surfaces in the Docs
  // tab. Same shape the /sessions/:id/docs route emits.
  const docEvent: AgentDeckEvent = {
    type: 'doc.published',
    sessionId: c.sessionId,
    docId,
    path: docPath,
    byAgentId: SYSTEM_AGENT_ID,
    at,
  };

  // Channel post so the team sees the watchdog speaking up.
  const channelMessageId = randomUUID();
  const channelEvent: AgentDeckEvent = {
    type: 'channel.message.posted',
    sessionId: c.sessionId,
    messageId: channelMessageId,
    fromAgentId: SYSTEM_AGENT_ID,
    fromAgentName: SYSTEM_AGENT_NAME,
    content: `🚨 agent ${c.name} (${c.id.slice(0, 8)}…) silent for ${stuckMinutes} min — auto-cancel triggered. See doc \`${docPath}\` for full report.`,
    at,
  };

  // Cancel-request event matches what the /agent-cancel route emits.
  const cancelEvent: AgentDeckEvent = {
    type: 'agent.cancel.requested',
    sessionId: c.sessionId,
    agentId: c.id,
    requestedByAgentId: SYSTEM_AGENT_ID,
    at,
  };

  let cancelInserted = false;

  try {
    inTx(() => {
      const db = getDb();
      // 1) doc row + doc.published event
      db.insert(docs).values({
        id: docId,
        sessionId: c.sessionId,
        path: docPath,
        content: markdown,
        updatedByAgentId: SYSTEM_AGENT_ID,
        createdAt: at,
        updatedAt: at,
      }).run();
      appendEvent(docEvent);

      // 2) channel post + channel.message.posted event
      db.insert(channelMessages).values({
        id: channelMessageId,
        sessionId: c.sessionId,
        fromAgentId: SYSTEM_AGENT_ID,
        fromAgentName: SYSTEM_AGENT_NAME,
        content: channelEvent.type === 'channel.message.posted' ? channelEvent.content : '',
        createdAt: at,
      }).run();
      appendEvent(channelEvent);

      // 3) cancel request (idempotent) + agent.cancel.requested event
      const existingCancel = db
        .select({ agentId: agentCancelRequests.agentId })
        .from(agentCancelRequests)
        .where(and(eq(agentCancelRequests.agentId, c.id), eq(agentCancelRequests.sessionId, c.sessionId)))
        .get();
      if (!existingCancel) {
        db.insert(agentCancelRequests).values({
          agentId: c.id,
          sessionId: c.sessionId,
          requestedAt: at,
          requestedByAgentId: SYSTEM_AGENT_ID,
        }).run();
        appendEvent(cancelEvent);
        cancelInserted = true;
      }

      // 4) agent_incidents row (storage of record for triage)
      db.insert(agentIncidents).values({
        id: incidentId,
        sessionId: c.sessionId,
        agentId: c.id,
        severity: 'intervention',
        stuckMinutes,
        snapshot: {
          status: c.status,
          lastEventType: c.lastEventType,
          lastEventAt: c.lastEventAt,
          runningToolCalls: c.runningToolCalls,
          name: c.name,
        },
        actionTaken: action,
        incidentDocPath: docPath,
        createdAt: at,
      }).run();

      // 5) agent.stuck.intervention event itself
      appendEvent(event);
    });

    eventBus.emit(docEvent);
    eventBus.emit(channelEvent);
    if (cancelInserted) eventBus.emit(cancelEvent);
    eventBus.emit(event);

    if (logger?.info) {
      logger.info(`agent-watchdog: intervention for agent=${c.id} session=${c.sessionId} stuck=${stuckMinutes}min`);
    }
  } catch (err) {
    // If the intervention transaction fails, surface it as an internal
    // finding (FB-10) so the operator sees what went wrong.
    reportInternalFinding({
      severity: 'error',
      source: 'watchdog',
      category: 'agent-watchdog.intervention.failed',
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : null,
      context: { agentId: c.id, sessionId: c.sessionId, stuckMinutes },
    });
    if (logger?.warn) logger.warn(`agent-watchdog: intervention failed for ${c.id}: ${err}`);
  }
}

function tick(eventBus: EventBus, logger?: { info?: (m: string) => void; warn?: (m: string) => void }): void {
  const candidates = loadCandidates();
  const now = Date.now();
  const at = nowIso();
  const stillRunning = new Set<string>();

  for (const c of candidates) {
    stillRunning.add(c.id);
    // Skip agents that are legitimately blocked on user input.
    if (isAwaitingUserInput(c.sessionId, c.id)) continue;

    const stuckMin = diffMinutes(now, c.lastEventAt);
    const stuckMs = stuckMin * 60_000;
    let st = stateByAgent.get(c.id);
    if (!st) {
      st = { warned: false, intervened: false, lastSeenAt: c.lastEventAt };
      stateByAgent.set(c.id, st);
    }

    // Reset on activity: if lastEventAt advanced since our last sighting,
    // the agent moved — clear the warned/intervened flags so it can be
    // flagged again later if it deadlocks anew.
    if (st.lastSeenAt !== c.lastEventAt) {
      st.warned = false;
      st.intervened = false;
      st.lastSeenAt = c.lastEventAt;
    }

    if (stuckMs >= INTERVENE_THRESHOLD_MS && !st.intervened) {
      emitIntervention(eventBus, c, stuckMin, at, logger);
      st.intervened = true;
      st.warned = true;
    } else if (stuckMs >= WARN_THRESHOLD_MS && !st.warned) {
      emitWarning(eventBus, c, stuckMin, at);
      st.warned = true;
    }
  }

  // Garbage-collect state for agents that finalized between ticks so the
  // map doesn't grow forever in long-lived proxies.
  for (const id of [...stateByAgent.keys()]) {
    if (!stillRunning.has(id)) stateByAgent.delete(id);
  }
}

export function startAgentWatchdog(
  eventBus: EventBus,
  logger?: { info?: (m: string) => void; warn?: (m: string) => void },
): () => void {
  if (tickTimer) return () => stopAgentWatchdog();
  tickTimer = setInterval(() => {
    try {
      tick(eventBus, logger);
    } catch (err) {
      reportInternalFinding({
        severity: 'error',
        source: 'watchdog',
        category: 'agent-watchdog.tick.failed',
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : null,
        context: null,
      });
    }
  }, TICK_INTERVAL_MS);
  tickTimer.unref?.();
  return () => stopAgentWatchdog();
}

export function stopAgentWatchdog(): void {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = null;
  stateByAgent.clear();
}
