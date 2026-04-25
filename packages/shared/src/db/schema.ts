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
export const campaigns = sqliteTable(
  'campaigns',
  {
    id: text('id').primaryKey(),
    projectName: text('project_name').notNull(),
    cliSource: text('cli_source').notNull(),
    notes: text('notes'),
    status: text('status', { enum: ['running', 'completed', 'aborted', 'failed'] })
      .notNull()
      .default('running'),
    startedAt: text('started_at').notNull().default(sql`(current_timestamp)`),
    endedAt: text('ended_at'),
  },
  (table) => ({
    statusIdx: index('campaigns_status_idx').on(table.status),
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
