import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text, index } from 'drizzle-orm/sqlite-core';

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  title: text('title').notNull(),
  rootPrompt: text('root_prompt').notNull(),
  workspacePath: text('workspace_path').notNull(),
  status: text('status', { enum: ['pending', 'running', 'waiting_tool', 'completed', 'failed', 'cancelled'] })
    .notNull()
    .default('pending'),
  totalTokensIn: integer('total_tokens_in').notNull().default(0),
  totalTokensOut: integer('total_tokens_out').notNull().default(0),
  // True when the session was bootstrapped by a CLI bridge (no SDK query).
  // Persistent flag so set_agent_identity renaming the root agent's role
  // can't break bridge detection (used by hub UI label + watchdog reaper).
  isBridge: integer('is_bridge', { mode: 'boolean' }).notNull().default(false),
  startedAt: text('started_at').notNull().default(sql`(current_timestamp)`),
  endedAt: text('ended_at'),
});

export const agents = sqliteTable(
  'agents',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    parentAgentId: text('parent_agent_id'),
    name: text('name').notNull(),
    role: text('role'),
    model: text('model'),
    prompt: text('prompt').notNull(),
    status: text('status', { enum: ['pending', 'running', 'waiting_tool', 'completed', 'failed', 'cancelled'] })
      .notNull()
      .default('pending'),
    tokensIn: integer('tokens_in').notNull().default(0),
    tokensOut: integer('tokens_out').notNull().default(0),
    startedAt: text('started_at').notNull().default(sql`(current_timestamp)`),
    endedAt: text('ended_at'),
  },
  (table) => ({
    sessionIdx: index('agents_session_idx').on(table.sessionId),
    parentIdx: index('agents_parent_idx').on(table.parentAgentId),
  }),
);

export const events = sqliteTable(
  'events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    agentId: text('agent_id'),
    seq: integer('seq').notNull(),
    type: text('type').notNull(),
    payload: text('payload', { mode: 'json' }).notNull(),
    createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  },
  (table) => ({
    sessionSeqIdx: index('events_session_seq_idx').on(table.sessionId, table.seq),
    agentIdx: index('events_agent_idx').on(table.agentId),
    typeIdx: index('events_type_idx').on(table.type),
    // Used by getSession.lastActivityAt — `MAX(events.created_at) WHERE
    // session_id = ?`. Without this, the MAX is O(N) on a session_id-filtered
    // scan; with it, O(log N) via index seek to the rightmost key.
    sessionCreatedIdx: index('events_session_created_idx').on(table.sessionId, table.createdAt),
  }),
);

export const toolCalls = sqliteTable(
  'tool_calls',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    toolName: text('tool_name').notNull(),
    input: text('input', { mode: 'json' }).notNull(),
    output: text('output', { mode: 'json' }),
    isError: integer('is_error', { mode: 'boolean' }).notNull().default(false),
    status: text('status', { enum: ['running', 'completed', 'failed'] })
      .notNull()
      .default('running'),
    startedAt: text('started_at').notNull().default(sql`(current_timestamp)`),
    endedAt: text('ended_at'),
    durationMs: integer('duration_ms'),
  },
  (table) => ({
    agentIdx: index('tool_calls_agent_idx').on(table.agentId),
  }),
);

export const channelMessages = sqliteTable(
  'channel_messages',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    fromAgentId: text('from_agent_id').notNull(),
    fromAgentName: text('from_agent_name').notNull(),
    content: text('content').notNull(),
    createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  },
  (table) => ({
    sessionIdx: index('channel_messages_session_idx').on(table.sessionId),
  }),
);

export const docs = sqliteTable(
  'docs',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    content: text('content').notNull(),
    updatedByAgentId: text('updated_by_agent_id').notNull(),
    createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
    updatedAt: text('updated_at').notNull().default(sql`(current_timestamp)`),
  },
  (table) => ({
    sessionPathIdx: index('docs_session_path_idx').on(table.sessionId, table.path),
  }),
);

export const procedures = sqliteTable('procedures', {
  name: text('name').primaryKey(),
  path: text('path').notNull(),
  description: text('description'),
  format: text('format', { enum: ['yaml', 'md'] }).notNull(),
  content: text('content').notNull(),
  hash: text('hash').notNull(),
  updatedAt: text('updated_at').notNull().default(sql`(current_timestamp)`),
});

export const testResults = sqliteTable(
  'test_results',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    agentId: text('agent_id').notNull(),
    suite: text('suite').notNull(),
    caseName: text('case_name').notNull(),
    status: text('status', { enum: ['passed', 'failed', 'skipped'] }).notNull(),
    evidence: text('evidence', { mode: 'json' }),
    message: text('message'),
    createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  },
  (table) => ({
    sessionIdx: index('test_results_session_idx').on(table.sessionId),
    suiteIdx: index('test_results_suite_idx').on(table.suite),
  }),
);

export const projectMemory = sqliteTable(
  'project_memory',
  {
    projectId: text('project_id').notNull(),
    key: text('key').notNull(),
    value: text('value').notNull(),
    updatedByAgentId: text('updated_by_agent_id'),
    updatedAt: text('updated_at').notNull().default(sql`(current_timestamp)`),
  },
  (table) => ({
    pk: index('project_memory_pk').on(table.projectId, table.key),
  }),
);

export const directMessages = sqliteTable(
  'direct_messages',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    fromAgentId: text('from_agent_id').notNull(),
    fromAgentName: text('from_agent_name').notNull(),
    toAgentId: text('to_agent_id').notNull(),
    content: text('content').notNull(),
    createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  },
  (table) => ({
    sessionToIdx: index('dm_session_to_idx').on(table.sessionId, table.toAgentId),
  }),
);

export const secrets = sqliteTable(
  'secrets',
  {
    projectId: text('project_id').notNull(),
    name: text('name').notNull(),
    valueEncrypted: text('value_encrypted').notNull(),
    iv: text('iv').notNull(),
    tag: text('tag').notNull(),
    updatedAt: text('updated_at').notNull().default(sql`(current_timestamp)`),
  },
  (table) => ({
    pk: index('secrets_pk').on(table.projectId, table.name),
  }),
);

export const execRuns = sqliteTable(
  'exec_runs',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    agentId: text('agent_id'),
    command: text('command').notNull(),
    stdout: text('stdout').notNull().default(''),
    stderr: text('stderr').notNull().default(''),
    exitCode: integer('exit_code'),
    durationMs: integer('duration_ms').notNull().default(0),
    timedOut: integer('timed_out', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  },
  (table) => ({
    sessionIdx: index('exec_runs_session_idx').on(table.sessionId),
  }),
);

export const userInputs = sqliteTable(
  'user_inputs',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    consumed: integer('consumed', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  },
  (table) => ({
    sessionIdx: index('user_inputs_session_idx').on(table.sessionId),
  }),
);

export const browserScreenshots = sqliteTable(
  'browser_screenshots',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    agentId: text('agent_id'),
    url: text('url'),
    imagePath: text('image_path').notNull(),
    caption: text('caption'),
    createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  },
  (table) => ({
    sessionIdx: index('browser_screenshots_session_idx').on(table.sessionId),
  }),
);

export const agentCancelRequests = sqliteTable(
  'agent_cancel_requests',
  {
    agentId: text('agent_id').primaryKey(),
    sessionId: text('session_id').notNull(),
    requestedAt: text('requested_at').notNull().default(sql`(current_timestamp)`),
    requestedByAgentId: text('requested_by_agent_id'),
  },
);

// QA campaigns — multi-session, cross-CLI runs of the unified methodology
// (process/10-methodologie-unifiee.md). Decoupled from sessions so a single
// campaign can span e.g. an SDK orchestrator + a Claude CLI bridge + a
// claim-validator running from a different CLI.
//
// `target` (v0.0.10+) selects the test-target template (process/test-targets/*.yaml)
// that pondère les phases, fan-outs spécialistes, et gates bloquants. Default
// `full` reproduit le comportement historique (Principe 10 UI-coverage gate).
// `templateName` est la version résolue (souvent identique à target, mais peut
// pointer un sur-template projet-spécifique). `gateResultsJson` est rempli
// au end_campaign — snapshot lisible du verdict pour l'historique.
export const campaigns = sqliteTable(
  'campaigns',
  {
    id: text('id').primaryKey(),
    projectName: text('project_name').notNull(),
    cliSource: text('cli_source').notNull(),
    notes: text('notes'),
    target: text('target').notNull().default('full'),
    templateName: text('template_name'),
    gateResultsJson: text('gate_results_json'),
    status: text('status', { enum: ['running', 'completed', 'aborted', 'failed'] })
      .notNull()
      .default('running'),
    startedAt: text('started_at').notNull().default(sql`(current_timestamp)`),
    endedAt: text('ended_at'),
  },
  (table) => ({
    statusIdx: index('campaigns_status_idx').on(table.status),
    targetIdx: index('campaigns_target_idx').on(table.target),
  }),
);

/**
 * Per-gate evaluation result attached to a campaign at end_campaign.
 *
 * One row per gate declared in the active template — even passing gates are
 * persisted so the dashboard / CLI can render the full verdict, not only
 * violations. `value` is JSON-encoded (numbers, booleans, or short strings).
 * `blocking` mirrors the template flag at evaluation time so historical reads
 * stay correct even if the template later changes.
 */
export const campaignGateResults = sqliteTable(
  'campaign_gate_results',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    gateName: text('gate_name').notNull(),
    valueJson: text('value_json').notNull(),
    thresholdJson: text('threshold_json').notNull(),
    passed: integer('passed', { mode: 'boolean' }).notNull(),
    blocking: integer('blocking', { mode: 'boolean' }).notNull(),
    waived: integer('waived', { mode: 'boolean' }).notNull().default(false),
    detailJson: text('detail_json'),
    evaluatedAt: text('evaluated_at').notNull().default(sql`(current_timestamp)`),
  },
  (table) => ({
    campaignIdx: index('campaign_gate_results_campaign_idx').on(table.campaignId),
    nameIdx: index('campaign_gate_results_name_idx').on(table.gateName),
  }),
);

export const campaignMetrics = sqliteTable(
  'campaign_metrics',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    valueJson: text('value_json').notNull(),
    tagsJson: text('tags_json'),
    recordedAt: text('recorded_at').notNull().default(sql`(current_timestamp)`),
  },
  (table) => ({
    campaignIdx: index('campaign_metrics_campaign_idx').on(table.campaignId),
    nameIdx: index('campaign_metrics_name_idx').on(table.name),
  }),
);

export const campaignRetrospectives = sqliteTable('campaign_retrospectives', {
  campaignId: text('campaign_id')
    .primaryKey()
    .references(() => campaigns.id, { onDelete: 'cascade' }),
  whatWentWell: text('what_went_well').notNull(),
  whatWentBadly: text('what_went_badly').notNull(),
  keyLearnings: text('key_learnings').notNull(),
  toolingFeedback: text('tooling_feedback').notNull(),
  recommendations: text('recommendations').notNull(),
  submittedAt: text('submitted_at').notNull().default(sql`(current_timestamp)`),
});

/**
 * Agent task planning. Personas / sub-agents announce what they intend to do
 * via task_plan, then progress through task_update_progress / task_complete.
 * Powers the dashboard's Gantt + Calendar + progress views.
 *
 * `plannedStart` / `plannedEnd` are the schedule. `actualStart` / `actualEnd`
 * are filled when the agent flips status. `progressPct` is 0-100 — agents
 * may report it linearly (50% means halfway) or as a coarse step count.
 */
export const agentTasks = sqliteTable(
  'agent_tasks',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status', { enum: ['planned', 'in_progress', 'blocked', 'completed', 'cancelled'] })
      .notNull()
      .default('planned'),
    progressPct: integer('progress_pct').notNull().default(0),
    plannedStart: text('planned_start').notNull(),
    plannedEnd: text('planned_end').notNull(),
    actualStart: text('actual_start'),
    actualEnd: text('actual_end'),
    /** JSON-encoded array of task ids this depends on. */
    dependenciesJson: text('dependencies_json'),
    createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
    updatedAt: text('updated_at').notNull().default(sql`(current_timestamp)`),
  },
  (table) => ({
    sessionIdx: index('agent_tasks_session_idx').on(table.sessionId),
    agentIdx: index('agent_tasks_agent_idx').on(table.agentId),
    statusIdx: index('agent_tasks_status_idx').on(table.status),
  }),
);

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
export type EventRow = typeof events.$inferSelect;
export type NewEventRow = typeof events.$inferInsert;
export type ToolCall = typeof toolCalls.$inferSelect;
export type ChannelMessage = typeof channelMessages.$inferSelect;
export type Doc = typeof docs.$inferSelect;
export type Procedure = typeof procedures.$inferSelect;
export type TestResult = typeof testResults.$inferSelect;
export type NewTestResult = typeof testResults.$inferInsert;
export type ProjectMemoryRow = typeof projectMemory.$inferSelect;
export type DirectMessage = typeof directMessages.$inferSelect;
export type SecretRow = typeof secrets.$inferSelect;
export type ExecRun = typeof execRuns.$inferSelect;
export type UserInput = typeof userInputs.$inferSelect;
export type BrowserScreenshot = typeof browserScreenshots.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type NewCampaign = typeof campaigns.$inferInsert;
export type CampaignMetric = typeof campaignMetrics.$inferSelect;
export type NewCampaignMetric = typeof campaignMetrics.$inferInsert;
export type CampaignRetrospective = typeof campaignRetrospectives.$inferSelect;
export type NewCampaignRetrospective = typeof campaignRetrospectives.$inferInsert;
export type AgentTask = typeof agentTasks.$inferSelect;
export type NewAgentTask = typeof agentTasks.$inferInsert;

/**
 * Stuck-agent watchdog incidents (FB-01). The agent-watchdog service ticks
 * every 60 s and writes one row each time an agent crosses the 5-minute
 * intervention threshold. The 3-minute "warning" tier is event-only
 * (`agent.stuck.warning`) — no row is written for warnings to keep this
 * table to actionable incidents only.
 *
 * `severity` is "warning" or "intervention" — but in practice only
 * "intervention" rows land here today. The column is kept open for future
 * tiers (e.g. a hard 7-min stop_agent escalation) without a migration.
 */
export const agentIncidents = sqliteTable(
  'agent_incidents',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    agentId: text('agent_id').notNull(),
    severity: text('severity', { enum: ['warning', 'intervention'] }).notNull(),
    /** Wall-clock minutes the agent had been silent at trigger time. */
    stuckMinutes: integer('stuck_minutes').notNull(),
    /** Snapshot JSON: lastEventType, lastEventAt, runningToolCalls, agentStatus, etc. */
    snapshot: text('snapshot', { mode: 'json' }).notNull(),
    /**
     * What the watchdog did. Values include: `none` (warning tier),
     * `cancel_requested`, `force_stopped`, `await_user_input`. Free-form text
     * to leave room for future strategies.
     */
    actionTaken: text('action_taken').notNull(),
    /** UUID of the doc auto-published with the incident report, if any. */
    incidentDocPath: text('incident_doc_path'),
    createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  },
  (table) => ({
    sessionIdx: index('agent_incidents_session_idx').on(table.sessionId),
    agentIdx: index('agent_incidents_agent_idx').on(table.agentId),
  }),
);

/**
 * Internal bug tracker (FB-10). The `internal-bug-tracker` service captures
 * proxy 5xx, uncaught exceptions, zod parse failures, Playwright crashes,
 * watchdog interventions, etc. into a queryable, dedup-by-fingerprint store.
 *
 * `fingerprint` = SHA-1 of `${source}::${category}::${normalized message}`.
 * Repeat occurrences of the same bug bump `occurrences` + `lastSeenAt`
 * instead of inserting a new row. Privacy-first: prompts and message bodies
 * are truncated to 500 chars at capture time, never stored full.
 */
export const internalFindings = sqliteTable(
  'internal_findings',
  {
    id: text('id').primaryKey(),
    fingerprint: text('fingerprint').notNull(),
    severity: text('severity', { enum: ['info', 'warn', 'error', 'critical'] }).notNull(),
    source: text('source', { enum: ['proxy', 'mcp', 'browser', 'watchdog', 'ui', 'other'] }).notNull(),
    category: text('category').notNull(),
    /** First 500 chars of the error message — redacted/truncated upstream. */
    message: text('message').notNull(),
    /** Trimmed stack trace (paths sanitized, ANSI stripped). */
    stack: text('stack'),
    /** JSON dictionary of extra context (route, statusCode, agentId, …). */
    context: text('context', { mode: 'json' }),
    occurrences: integer('occurrences').notNull().default(1),
    /** open → triaged → fixed (or wontfix). Default "open". */
    status: text('status', { enum: ['open', 'triaged', 'fixed', 'wontfix'] })
      .notNull()
      .default('open'),
    /** Optional version/commit where the user marks this fixed. */
    fixedInVersion: text('fixed_in_version'),
    firstSeenAt: text('first_seen_at').notNull().default(sql`(current_timestamp)`),
    lastSeenAt: text('last_seen_at').notNull().default(sql`(current_timestamp)`),
  },
  (table) => ({
    fingerprintIdx: index('internal_findings_fingerprint_idx').on(table.fingerprint),
    statusIdx: index('internal_findings_status_idx').on(table.status),
    severityIdx: index('internal_findings_severity_idx').on(table.severity),
    lastSeenIdx: index('internal_findings_last_seen_idx').on(table.lastSeenAt),
  }),
);

export type AgentIncident = typeof agentIncidents.$inferSelect;
export type NewAgentIncident = typeof agentIncidents.$inferInsert;
export type InternalFinding = typeof internalFindings.$inferSelect;
export type NewInternalFinding = typeof internalFindings.$inferInsert;
