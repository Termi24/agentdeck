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
import { and, eq, isNull, sql } from 'drizzle-orm';
import { getDb } from './db.js';

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
      rootRole: agents.role,
      agentCount: sql<number>`(SELECT count(*) FROM ${agents} WHERE ${agents.sessionId} = ${sessions.id})`,
      runningAgentCount: sql<number>`(SELECT count(*) FROM ${agents} WHERE ${agents.sessionId} = ${sessions.id} AND ${agents.status} IN ('running','pending','waiting_tool'))`,
      channelMessageCount: sql<number>`(SELECT count(*) FROM ${channelMessages} WHERE ${channelMessages.sessionId} = ${sessions.id})`,
      docCount: sql<number>`(SELECT count(*) FROM ${docs} WHERE ${docs.sessionId} = ${sessions.id})`,
      testResultCount: sql<number>`(SELECT count(*) FROM ${testResults} WHERE ${testResults.sessionId} = ${sessions.id})`,
      toolCallCount: sql<number>`(SELECT count(*) FROM ${toolCalls} WHERE ${toolCalls.sessionId} = ${sessions.id})`,
      runningToolCallCount: sql<number>`(SELECT count(*) FROM ${toolCalls} WHERE ${toolCalls.sessionId} = ${sessions.id} AND ${toolCalls.status} = 'running')`,
      lastActivityAt: sql<string | null>`(SELECT max(${events.createdAt}) FROM ${events} WHERE ${events.sessionId} = ${sessions.id})`,
      lastMessageFromName: sql<string | null>`(SELECT ${channelMessages.fromAgentName} FROM ${channelMessages} WHERE ${channelMessages.sessionId} = ${sessions.id} ORDER BY ${channelMessages.createdAt} DESC LIMIT 1)`,
      lastMessageContent: sql<string | null>`(SELECT ${channelMessages.content} FROM ${channelMessages} WHERE ${channelMessages.sessionId} = ${sessions.id} ORDER BY ${channelMessages.createdAt} DESC LIMIT 1)`,
      lastMessageAt: sql<string | null>`(SELECT ${channelMessages.createdAt} FROM ${channelMessages} WHERE ${channelMessages.sessionId} = ${sessions.id} ORDER BY ${channelMessages.createdAt} DESC LIMIT 1)`,
    })
    .from(sessions)
    .leftJoin(agents, and(eq(agents.sessionId, sessions.id), isNull(agents.parentAgentId)))
    .orderBy(sql`${sessions.startedAt} DESC`)
    .limit(limit)
    .all();

  return rows.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    title: r.title,
    status: r.status,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    totalTokensIn: r.totalTokensIn,
    totalTokensOut: r.totalTokensOut,
    isBridge: r.rootRole === 'bridge',
    agentCount: Number(r.agentCount ?? 0),
    runningAgentCount: Number(r.runningAgentCount ?? 0),
    channelMessageCount: Number(r.channelMessageCount ?? 0),
    docCount: Number(r.docCount ?? 0),
    testResultCount: Number(r.testResultCount ?? 0),
    toolCallCount: Number(r.toolCallCount ?? 0),
    runningToolCallCount: Number(r.runningToolCallCount ?? 0),
    lastActivityAt: r.lastActivityAt,
    lastChannelMessage:
      r.lastMessageContent && r.lastMessageFromName && r.lastMessageAt
        ? { fromAgentName: r.lastMessageFromName, content: r.lastMessageContent, at: r.lastMessageAt }
        : null,
  }));
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
      rootRole: agents.role,
      agentCount: sql<number>`(SELECT count(*) FROM ${agents} WHERE ${agents.sessionId} = ${sessions.id})`,
      runningAgentCount: sql<number>`(SELECT count(*) FROM ${agents} WHERE ${agents.sessionId} = ${sessions.id} AND ${agents.status} IN ('running','pending','waiting_tool'))`,
      channelMessageCount: sql<number>`(SELECT count(*) FROM ${channelMessages} WHERE ${channelMessages.sessionId} = ${sessions.id})`,
      docCount: sql<number>`(SELECT count(*) FROM ${docs} WHERE ${docs.sessionId} = ${sessions.id})`,
      testResultCount: sql<number>`(SELECT count(*) FROM ${testResults} WHERE ${testResults.sessionId} = ${sessions.id})`,
      toolCallCount: sql<number>`(SELECT count(*) FROM ${toolCalls} WHERE ${toolCalls.sessionId} = ${sessions.id})`,
      runningToolCallCount: sql<number>`(SELECT count(*) FROM ${toolCalls} WHERE ${toolCalls.sessionId} = ${sessions.id} AND ${toolCalls.status} = 'running')`,
      lastActivityAt: sql<string | null>`(SELECT max(${events.createdAt}) FROM ${events} WHERE ${events.sessionId} = ${sessions.id})`,
      lastMessageFromName: sql<string | null>`(SELECT ${channelMessages.fromAgentName} FROM ${channelMessages} WHERE ${channelMessages.sessionId} = ${sessions.id} ORDER BY ${channelMessages.createdAt} DESC LIMIT 1)`,
      lastMessageContent: sql<string | null>`(SELECT ${channelMessages.content} FROM ${channelMessages} WHERE ${channelMessages.sessionId} = ${sessions.id} ORDER BY ${channelMessages.createdAt} DESC LIMIT 1)`,
      lastMessageAt: sql<string | null>`(SELECT ${channelMessages.createdAt} FROM ${channelMessages} WHERE ${channelMessages.sessionId} = ${sessions.id} ORDER BY ${channelMessages.createdAt} DESC LIMIT 1)`,
    })
    .from(sessions)
    .leftJoin(agents, and(eq(agents.sessionId, sessions.id), isNull(agents.parentAgentId)))
    .where(eq(sessions.id, sessionId))
    .get();

  if (!r) return null;
  return {
    id: r.id,
    projectId: r.projectId,
    title: r.title,
    status: r.status,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    totalTokensIn: r.totalTokensIn,
    totalTokensOut: r.totalTokensOut,
    isBridge: r.rootRole === 'bridge',
    agentCount: Number(r.agentCount ?? 0),
    runningAgentCount: Number(r.runningAgentCount ?? 0),
    channelMessageCount: Number(r.channelMessageCount ?? 0),
    docCount: Number(r.docCount ?? 0),
    testResultCount: Number(r.testResultCount ?? 0),
    toolCallCount: Number(r.toolCallCount ?? 0),
    runningToolCallCount: Number(r.runningToolCallCount ?? 0),
    lastActivityAt: r.lastActivityAt,
    lastChannelMessage:
      r.lastMessageContent && r.lastMessageFromName && r.lastMessageAt
        ? { fromAgentName: r.lastMessageFromName, content: r.lastMessageContent, at: r.lastMessageAt }
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
      toolCallCount: sql<number>`(SELECT count(*) FROM ${toolCalls} WHERE ${toolCalls.agentId} = ${agents.id})`,
      runningToolCallCount: sql<number>`(SELECT count(*) FROM ${toolCalls} WHERE ${toolCalls.agentId} = ${agents.id} AND ${toolCalls.status} = 'running')`,
      dmCount: sql<number>`(SELECT count(*) FROM direct_messages WHERE session_id = ${sessionId} AND (from_agent_id = ${agents.id} OR to_agent_id = ${agents.id}))`,
      channelMessageCount: sql<number>`(SELECT count(*) FROM ${channelMessages} WHERE ${channelMessages.sessionId} = ${sessionId} AND ${channelMessages.fromAgentId} = ${agents.id})`,
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

export function appendEvent(event: AgentDeckEvent): number {
  const sessionId = 'sessionId' in event ? event.sessionId : null;
  if (!sessionId) throw new Error(`event without sessionId: ${event.type}`);
  const agentId = 'agentId' in event ? event.agentId : null;
  const result = getDb()
    .insert(events)
    .values({
      sessionId,
      agentId,
      seq: 0,
      type: event.type,
      payload: event,
    })
    .returning({ id: events.id })
    .all();
  const row = result[0];
  if (!row) throw new Error('insert events returned empty');
  return row.id;
}

export function nextSeq(sessionId: string): number {
  const row = getDb()
    .select({ seq: sql<number>`coalesce(max(${events.seq}), -1) + 1`.as('seq') })
    .from(events)
    .where(and(eq(events.sessionId, sessionId)))
    .get();
  return row?.seq ?? 0;
}
