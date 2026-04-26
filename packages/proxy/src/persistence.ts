import {
  agents,
  channelMessages,
  docs,
  events,
  sessions,
  testResults,
  toolCalls,
  type AgentDeckEvent,
  type NewAgent,
  type NewSession,
} from '@agentdeck/shared';
import { and, eq, sql } from 'drizzle-orm';
import { getDb } from './db.js';

// SQLite default `current_timestamp` returns "YYYY-MM-DD HH:MM:SS" (no T, no Z).
// JavaScript `new Date(s)` interprets that as LOCAL time on Chrome — so a
// timestamp written 5 s ago looks ~2 h in the past for a UTC+2 user. Force
// every cross-boundary timestamp through this helper so the browser parses
// them as UTC and `relativeTime()` stays honest.
function toIso(dt: string | null): string | null {
  if (!dt) return null;
  if (dt.includes('T')) return dt;
  return dt.replace(' ', 'T') + 'Z';
}

export function insertSession(row: NewSession): void {
  getDb().insert(sessions).values(row).run();
}

export interface SessionListRow {
  id: string;
  projectId: string;
  title: string;
  status: 'pending' | 'running' | 'waiting_tool' | 'completed' | 'failed' | 'cancelled';
  startedAt: string;
  endedAt: string | null;
  totalTokensIn: number;
  totalTokensOut: number;
  /** True when the session was bootstrapped by the Claude CLI bridge (no SDK query). */
  isBridge: boolean;
  /** Aggregated dashboard stats. */
  agentCount: number;
  runningAgentCount: number;
  channelMessageCount: number;
  docCount: number;
  testResultCount: number;
  toolCallCount: number;
  runningToolCallCount: number;
  /** ISO timestamp of the most recent event in this session, null if nothing ever happened. */
  lastActivityAt: string | null;
  lastChannelMessage: { fromAgentName: string; content: string; at: string } | null;
}

/**
 * Cross-session listing for the hub UI. Joins sessions on their root agent
 * (parentAgentId IS NULL) so the caller can distinguish SDK sessions
 * (role='root') from CLI-bridged sessions (role='bridge'). Returns
 * per-session dashboard aggregates via correlated sub-queries — one pass
 * through the DB, no per-session fan-out from the caller.
 *
 * Ordered by startedAt DESC so most recent shows first.
 */
export function listSessions(limit = 200): SessionListRow[] {
  const db = getDb();
  const rows = db
    .select({
      id: sessions.id,
      projectId: sessions.projectId,
      title: sessions.title,
      status: sessions.status,
      startedAt: sessions.startedAt,
      endedAt: sessions.endedAt,
      totalTokensIn: sessions.totalTokensIn,
      totalTokensOut: sessions.totalTokensOut,
      isBridge: sessions.isBridge,
      // Correlated sub-queries must qualify columns by table name so the inner reference
      // to "session_id" doesn't shadow against the outer "sessions". Drizzle's
      // ${table.column} interpolation drops the table prefix, which would silently match
      // the inner agents.session_id against the inner agents.id (always 0). Use raw SQL.
      agentCount: sql<number>`(SELECT count(*) FROM agents WHERE agents.session_id = sessions.id)`,
      runningAgentCount: sql<number>`(SELECT count(*) FROM agents WHERE agents.session_id = sessions.id AND agents.status IN ('running','pending','waiting_tool'))`,
      channelMessageCount: sql<number>`(SELECT count(*) FROM channel_messages WHERE channel_messages.session_id = sessions.id)`,
      docCount: sql<number>`(SELECT count(*) FROM docs WHERE docs.session_id = sessions.id)`,
      testResultCount: sql<number>`(SELECT count(*) FROM test_results WHERE test_results.session_id = sessions.id)`,
      toolCallCount: sql<number>`(SELECT count(*) FROM tool_calls WHERE tool_calls.session_id = sessions.id)`,
      runningToolCallCount: sql<number>`(SELECT count(*) FROM tool_calls WHERE tool_calls.session_id = sessions.id AND tool_calls.status = 'running')`,
      lastActivityAt: sql<string | null>`(SELECT max(events.created_at) FROM events WHERE events.session_id = sessions.id)`,
      lastMessageFromName: sql<string | null>`(SELECT channel_messages.from_agent_name FROM channel_messages WHERE channel_messages.session_id = sessions.id ORDER BY channel_messages.created_at DESC LIMIT 1)`,
      lastMessageContent: sql<string | null>`(SELECT channel_messages.content FROM channel_messages WHERE channel_messages.session_id = sessions.id ORDER BY channel_messages.created_at DESC LIMIT 1)`,
      lastMessageAt: sql<string | null>`(SELECT channel_messages.created_at FROM channel_messages WHERE channel_messages.session_id = sessions.id ORDER BY channel_messages.created_at DESC LIMIT 1)`,
    })
    .from(sessions)
    .orderBy(sql`${sessions.startedAt} DESC`)
    .limit(limit)
    .all();

  return rows.map((r) => {
    const lastAt = toIso(r.lastMessageAt);
    return {
      id: r.id,
      projectId: r.projectId,
      title: r.title,
      status: r.status,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      totalTokensIn: r.totalTokensIn,
      totalTokensOut: r.totalTokensOut,
      isBridge: Boolean(r.isBridge),
      agentCount: Number(r.agentCount ?? 0),
      runningAgentCount: Number(r.runningAgentCount ?? 0),
      channelMessageCount: Number(r.channelMessageCount ?? 0),
      docCount: Number(r.docCount ?? 0),
      testResultCount: Number(r.testResultCount ?? 0),
      toolCallCount: Number(r.toolCallCount ?? 0),
      runningToolCallCount: Number(r.runningToolCallCount ?? 0),
      lastActivityAt: toIso(r.lastActivityAt),
      lastChannelMessage:
        r.lastMessageContent && r.lastMessageFromName && lastAt
          ? { fromAgentName: r.lastMessageFromName, content: r.lastMessageContent, at: lastAt }
          : null,
    };
  });
}

/**
 * Cheap existence check for the global onRequest hook in server.ts. Single
 * SELECT-by-PK; never fans out to the 8 aggregate sub-queries that getSession
 * runs. Use this when all you need is "does this id exist?" — typically the
 * 404-or-pass guard before route handlers — and reserve `getSession()` for
 * UI-facing reads that consume the dashboard KPIs.
 */
export function sessionExists(sessionId: string): boolean {
  const row = getDb()
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .get();
  return row !== undefined;
}

/**
 * Fetch one session row with the same aggregated stats as `listSessions()`.
 * Returns null if the id is unknown.
 */
export function getSession(sessionId: string): SessionListRow | null {
  const db = getDb();
  const r = db
    .select({
      id: sessions.id,
      projectId: sessions.projectId,
      title: sessions.title,
      status: sessions.status,
      startedAt: sessions.startedAt,
      endedAt: sessions.endedAt,
      totalTokensIn: sessions.totalTokensIn,
      totalTokensOut: sessions.totalTokensOut,
      isBridge: sessions.isBridge,
      agentCount: sql<number>`(SELECT count(*) FROM agents WHERE agents.session_id = sessions.id)`,
      runningAgentCount: sql<number>`(SELECT count(*) FROM agents WHERE agents.session_id = sessions.id AND agents.status IN ('running','pending','waiting_tool'))`,
      channelMessageCount: sql<number>`(SELECT count(*) FROM channel_messages WHERE channel_messages.session_id = sessions.id)`,
      docCount: sql<number>`(SELECT count(*) FROM docs WHERE docs.session_id = sessions.id)`,
      testResultCount: sql<number>`(SELECT count(*) FROM test_results WHERE test_results.session_id = sessions.id)`,
      toolCallCount: sql<number>`(SELECT count(*) FROM tool_calls WHERE tool_calls.session_id = sessions.id)`,
      runningToolCallCount: sql<number>`(SELECT count(*) FROM tool_calls WHERE tool_calls.session_id = sessions.id AND tool_calls.status = 'running')`,
      lastActivityAt: sql<string | null>`(SELECT max(events.created_at) FROM events WHERE events.session_id = sessions.id)`,
      lastMessageFromName: sql<string | null>`(SELECT channel_messages.from_agent_name FROM channel_messages WHERE channel_messages.session_id = sessions.id ORDER BY channel_messages.created_at DESC LIMIT 1)`,
      lastMessageContent: sql<string | null>`(SELECT channel_messages.content FROM channel_messages WHERE channel_messages.session_id = sessions.id ORDER BY channel_messages.created_at DESC LIMIT 1)`,
      lastMessageAt: sql<string | null>`(SELECT channel_messages.created_at FROM channel_messages WHERE channel_messages.session_id = sessions.id ORDER BY channel_messages.created_at DESC LIMIT 1)`,
    })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .get();

  if (!r) return null;
  const lastAt = toIso(r.lastMessageAt);
  return {
    id: r.id,
    projectId: r.projectId,
    title: r.title,
    status: r.status,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    totalTokensIn: r.totalTokensIn,
    totalTokensOut: r.totalTokensOut,
    isBridge: Boolean(r.isBridge),
    agentCount: Number(r.agentCount ?? 0),
    runningAgentCount: Number(r.runningAgentCount ?? 0),
    channelMessageCount: Number(r.channelMessageCount ?? 0),
    docCount: Number(r.docCount ?? 0),
    testResultCount: Number(r.testResultCount ?? 0),
    toolCallCount: Number(r.toolCallCount ?? 0),
    runningToolCallCount: Number(r.runningToolCallCount ?? 0),
    lastActivityAt: toIso(r.lastActivityAt),
    lastChannelMessage:
      r.lastMessageContent && r.lastMessageFromName && lastAt
        ? { fromAgentName: r.lastMessageFromName, content: r.lastMessageContent, at: lastAt }
        : null,
  };
}

export interface ToolCallRow {
  id: string;
  agentId: string;
  agentName: string;
  toolName: string;
  input: unknown;
  output: unknown | null;
  isError: boolean;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
}

export function listSessionToolCalls(
  sessionId: string,
  opts: { status?: 'running' | 'completed' | 'failed'; limit?: number } = {},
): ToolCallRow[] {
  const db = getDb();
  const limit = opts.limit ?? 50;
  const base = db
    .select({
      id: toolCalls.id,
      agentId: toolCalls.agentId,
      agentName: agents.name,
      toolName: toolCalls.toolName,
      input: toolCalls.input,
      output: toolCalls.output,
      isError: toolCalls.isError,
      status: toolCalls.status,
      startedAt: toolCalls.startedAt,
      endedAt: toolCalls.endedAt,
      durationMs: toolCalls.durationMs,
    })
    .from(toolCalls)
    .leftJoin(agents, eq(agents.id, toolCalls.agentId));

  const rows = opts.status
    ? base
        .where(and(eq(toolCalls.sessionId, sessionId), eq(toolCalls.status, opts.status)))
        .orderBy(sql`${toolCalls.startedAt} DESC`)
        .limit(limit)
        .all()
    : base
        .where(eq(toolCalls.sessionId, sessionId))
        .orderBy(sql`${toolCalls.startedAt} DESC`)
        .limit(limit)
        .all();

  return rows.map((r) => ({
    id: r.id,
    agentId: r.agentId,
    agentName: r.agentName ?? '(unknown)',
    toolName: r.toolName,
    input: r.input,
    output: r.output,
    isError: Boolean(r.isError),
    status: r.status,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    durationMs: r.durationMs,
  }));
}

export interface SessionAgentRow {
  id: string;
  name: string;
  role: string | null;
  /** The prompt (or skill definition) the agent was spawned with — full context for the UI detail view. */
  prompt: string;
  model: string | null;
  status: 'pending' | 'running' | 'waiting_tool' | 'completed' | 'failed' | 'cancelled';
  parentAgentId: string | null;
  startedAt: string;
  endedAt: string | null;
  tokensIn: number;
  tokensOut: number;
  /** Number of tool_calls rows whose agentId matches — tells you at a glance how busy each agent has been. */
  toolCallCount: number;
  runningToolCallCount: number;
  /** DMs where this agent is sender OR recipient. */
  dmCount: number;
  /** Channel messages authored by this agent. */
  channelMessageCount: number;
}

export function listSessionAgents(sessionId: string): SessionAgentRow[] {
  const db = getDb();
  const rows = db
    .select({
      id: agents.id,
      name: agents.name,
      role: agents.role,
      prompt: agents.prompt,
      model: agents.model,
      status: agents.status,
      parentAgentId: agents.parentAgentId,
      startedAt: agents.startedAt,
      endedAt: agents.endedAt,
      tokensIn: agents.tokensIn,
      tokensOut: agents.tokensOut,
      toolCallCount: sql<number>`(SELECT count(*) FROM tool_calls WHERE tool_calls.agent_id = agents.id)`,
      runningToolCallCount: sql<number>`(SELECT count(*) FROM tool_calls WHERE tool_calls.agent_id = agents.id AND tool_calls.status = 'running')`,
      dmCount: sql<number>`(SELECT count(*) FROM direct_messages WHERE direct_messages.session_id = ${sessionId} AND (direct_messages.from_agent_id = agents.id OR direct_messages.to_agent_id = agents.id))`,
      channelMessageCount: sql<number>`(SELECT count(*) FROM channel_messages WHERE channel_messages.session_id = ${sessionId} AND channel_messages.from_agent_id = agents.id)`,
    })
    .from(agents)
    .where(eq(agents.sessionId, sessionId))
    .orderBy(sql`${agents.startedAt} ASC`)
    .all();
  return rows.map((r) => ({
    ...r,
    toolCallCount: Number(r.toolCallCount ?? 0),
    runningToolCallCount: Number(r.runningToolCallCount ?? 0),
    dmCount: Number(r.dmCount ?? 0),
    channelMessageCount: Number(r.channelMessageCount ?? 0),
  }));
}

export function insertAgent(row: NewAgent): void {
  getDb().insert(agents).values(row).run();
}

export function finalizeSession(
  sessionId: string,
  patch: { status: NewSession['status']; totalTokensIn: number; totalTokensOut: number },
): void {
  getDb()
    .update(sessions)
    .set({ ...patch, endedAt: new Date().toISOString() })
    .where(eq(sessions.id, sessionId))
    .run();
}

export function finalizeAgent(
  agentId: string,
  patch: { status: NewAgent['status']; tokensIn: number; tokensOut: number },
): void {
  getDb()
    .update(agents)
    .set({ ...patch, endedAt: new Date().toISOString() })
    .where(eq(agents.id, agentId))
    .run();
}

/**
 * Insert a `tool_calls` row when the SDK translator observes an
 * `agent.tool.use.start` event. Pairs with `finishToolCall()` to
 * keep the dashboard's `toolCallCount` KPI accurate for SDK-spawned
 * sessions (the MCP HTTP shim path writes its own rows independently).
 */
export function insertToolCall(row: {
  id: string;
  sessionId: string;
  agentId: string;
  toolName: string;
  input: unknown;
  startedAt: string;
}): void {
  getDb()
    .insert(toolCalls)
    .values({
      id: row.id,
      sessionId: row.sessionId,
      agentId: row.agentId,
      toolName: row.toolName,
      input: row.input,
      status: 'running',
      startedAt: row.startedAt,
    })
    .run();
}

export function finishToolCall(
  toolCallId: string,
  patch: { output: unknown; isError: boolean; durationMs: number; endedAt: string },
): void {
  getDb()
    .update(toolCalls)
    .set({
      output: patch.output,
      isError: patch.isError,
      status: patch.isError ? 'failed' : 'completed',
      durationMs: patch.durationMs,
      endedAt: patch.endedAt,
    })
    .where(eq(toolCalls.id, toolCallId))
    .run();
}

export function appendEvent(event: AgentDeckEvent): number {
  const sessionId = 'sessionId' in event ? event.sessionId : null;
  if (!sessionId) throw new Error(`event without sessionId: ${event.type}`);
  const agentId = 'agentId' in event ? event.agentId : null;
  const result = getDb()
    .insert(events)
    .values({
      sessionId,
      agentId,
      seq: nextSeq(sessionId),
      type: event.type,
      payload: event,
    })
    .returning({ id: events.id })
    .all();
  const row = result[0];
  if (!row) throw new Error('insert events returned empty');
  return row.id;
}

/**
 * Wrap a synchronous block in one SQLite transaction. The CLAUDE.md invariant
 * "every domain fact is written to its own table AND appended to events in
 * the same transaction" is enforced via this helper — pair every `insert(...)`
 * with its `appendEvent(...)` inside the same `inTx(() => { ... })`. One fsync
 * instead of two; atomic on crash.
 */
export function inTx<T>(fn: () => T): T {
  return getDb().transaction((): T => fn());
}

/**
 * Run a write block under deferred-foreign-key checking — useful for bulk
 * imports where every row references the same parent (session_id). FKs are
 * verified once at COMMIT, not per row, gaining ~20-30% on large batches.
 * Falls back gracefully if `defer_foreign_keys` isn't supported.
 */
export function inBulkTx<T>(fn: () => T): T {
  const db = getDb();
  return db.transaction((): T => {
    db.run(sql`PRAGMA defer_foreign_keys = ON`);
    try {
      return fn();
    } finally {
      db.run(sql`PRAGMA defer_foreign_keys = OFF`);
    }
  });
}

export function nextSeq(sessionId: string): number {
  const row = getDb()
    .select({ seq: sql<number>`coalesce(max(${events.seq}), -1) + 1`.as('seq') })
    .from(events)
    .where(and(eq(events.sessionId, sessionId)))
    .get();
  return row?.seq ?? 0;
}
