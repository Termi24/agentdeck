import { z } from 'zod';

export const AgentStatus = z.enum(['pending', 'running', 'waiting_tool', 'completed', 'failed', 'cancelled']);
export type AgentStatus = z.infer<typeof AgentStatus>;

const Base = z.object({
  sessionId: z.uuid(),
  agentId: z.uuid(),
  at: z.iso.datetime(),
  seq: z.number().int().nonnegative(),
});

export const SessionStarted = z.object({
  type: z.literal('session.started'),
  sessionId: z.uuid(),
  projectId: z.string(),
  prompt: z.string(),
  at: z.iso.datetime(),
});

export const SessionEnded = z.object({
  type: z.literal('session.ended'),
  sessionId: z.uuid(),
  status: AgentStatus,
  totalTokensIn: z.number().int().nonnegative(),
  totalTokensOut: z.number().int().nonnegative(),
  at: z.iso.datetime(),
});

export const AgentSpawned = Base.extend({
  type: z.literal('agent.spawned'),
  parentAgentId: z.uuid().nullable(),
  name: z.string(),
  role: z.string().optional(),
  prompt: z.string(),
  model: z.string().optional(),
});

export const AgentStopped = Base.extend({
  type: z.literal('agent.stopped'),
  status: AgentStatus,
  tokensIn: z.number().int().nonnegative(),
  tokensOut: z.number().int().nonnegative(),
});

export const MessageDelta = Base.extend({
  type: z.literal('agent.message.delta'),
  text: z.string(),
});

export const ThinkingDelta = Base.extend({
  type: z.literal('agent.thinking.delta'),
  text: z.string(),
});

export const ToolUseStart = Base.extend({
  type: z.literal('agent.tool.use.start'),
  toolCallId: z.string(),
  toolName: z.string(),
  input: z.unknown(),
});

export const ToolUseResult = Base.extend({
  type: z.literal('agent.tool.use.result'),
  toolCallId: z.string(),
  output: z.unknown(),
  isError: z.boolean(),
  durationMs: z.number().int().nonnegative(),
});

export const ChannelMessagePosted = z.object({
  type: z.literal('channel.message.posted'),
  sessionId: z.uuid(),
  messageId: z.uuid(),
  fromAgentId: z.uuid(),
  fromAgentName: z.string(),
  content: z.string(),
  at: z.iso.datetime(),
});

// Emitted ONCE per doc the first time `path` is created in the session.
// Subsequent rewrites of the same path emit `doc.updated` instead, so a
// `count(events.type='doc.published')` reducer matches `count(docs)`
// without needing to dedupe by path.
export const DocPublished = z.object({
  type: z.literal('doc.published'),
  sessionId: z.uuid(),
  docId: z.uuid(),
  path: z.string(),
  byAgentId: z.uuid(),
  at: z.iso.datetime(),
});

// Emitted on every rewrite of an existing doc (same `path` / same `docId`).
// Activity feeds typically render these as a "republish" line; doc-count
// reducers should ignore them. Decoupled from `doc.published` so the
// "1 row in `docs` = 1 `doc.published` event" invariant holds again.
export const DocUpdated = z.object({
  type: z.literal('doc.updated'),
  sessionId: z.uuid(),
  docId: z.uuid(),
  path: z.string(),
  byAgentId: z.uuid(),
  at: z.iso.datetime(),
});

export const SandboxFileChanged = z.object({
  type: z.literal('sandbox.file.changed'),
  sessionId: z.uuid(),
  path: z.string(),
  op: z.enum(['create', 'modify', 'delete']),
  at: z.iso.datetime(),
});

// Emitted when a sandbox_exec run terminates. Surfaces command duration +
// exit status in the activity feed so reviewers can spot slow / failing
// shell calls without opening the per-tool-call detail sheet.
export const SandboxExecCompleted = z.object({
  type: z.literal('sandbox.exec.completed'),
  sessionId: z.uuid(),
  agentId: z.string().nullable().optional(),
  runId: z.uuid(),
  command: z.string(),
  exitCode: z.number().int(),
  durationMs: z.number().int().nonnegative(),
  timedOut: z.boolean(),
  at: z.iso.datetime(),
});

export const TestResultReported = z.object({
  type: z.literal('test.result.reported'),
  sessionId: z.uuid(),
  resultId: z.uuid(),
  agentId: z.string(),
  suite: z.string(),
  caseName: z.string(),
  status: z.enum(['passed', 'failed', 'skipped']),
  message: z.string().nullable().optional(),
  at: z.iso.datetime(),
});

export const DirectMessagePosted = z.object({
  type: z.literal('dm.message.posted'),
  sessionId: z.uuid(),
  messageId: z.uuid(),
  fromAgentId: z.string(),
  fromAgentName: z.string(),
  toAgentId: z.string(),
  content: z.string(),
  at: z.iso.datetime(),
});

export const UserInputSubmitted = z.object({
  type: z.literal('user.input.submitted'),
  sessionId: z.uuid(),
  inputId: z.uuid(),
  content: z.string(),
  at: z.iso.datetime(),
});

export const UserInputAwaiting = z.object({
  type: z.literal('user.input.awaiting'),
  sessionId: z.uuid(),
  waitId: z.string(),
  agentId: z.string().nullable().optional(),
  agentName: z.string().nullable().optional(),
  prompt: z.string().nullable().optional(),
  at: z.iso.datetime(),
});

export const UserInputResolved = z.object({
  type: z.literal('user.input.resolved'),
  sessionId: z.uuid(),
  waitId: z.string(),
  agentId: z.string().nullable().optional(),
  inputId: z.uuid().nullable().optional(),
  timedOut: z.boolean(),
  at: z.iso.datetime(),
});

export const BrowserScreenshotTaken = z.object({
  type: z.literal('browser.screenshot.taken'),
  sessionId: z.uuid(),
  screenshotId: z.uuid(),
  agentId: z.string().nullable(),
  url: z.string().nullable(),
  imagePath: z.string(),
  caption: z.string().nullable().optional(),
  at: z.iso.datetime(),
});

export const AgentCancelRequested = z.object({
  type: z.literal('agent.cancel.requested'),
  sessionId: z.uuid(),
  agentId: z.string(),
  requestedByAgentId: z.string().nullable().optional(),
  at: z.iso.datetime(),
});

export const MemoryUpdated = z.object({
  type: z.literal('memory.updated'),
  // Project-scoped event, but we also tag the originating session so the
  // event survives the events.session_id NOT NULL invariant (required by
  // appendEvent). Without sessionId we cannot satisfy the "every domain
  // fact appended to events" invariant from CLAUDE.md.
  sessionId: z.uuid(),
  projectId: z.string(),
  key: z.string(),
  at: z.iso.datetime(),
});

// Agent planning lifecycle. Drives the dashboard Gantt + calendar + % views.
export const AgentTaskPlanned = z.object({
  type: z.literal('agent.task.planned'),
  sessionId: z.uuid(),
  agentId: z.string(),
  taskId: z.uuid(),
  title: z.string(),
  description: z.string().nullable().optional(),
  plannedStart: z.iso.datetime(),
  plannedEnd: z.iso.datetime(),
  dependencies: z.array(z.string()).optional(),
  at: z.iso.datetime(),
});

export const AgentTaskStarted = z.object({
  type: z.literal('agent.task.started'),
  sessionId: z.uuid(),
  agentId: z.string(),
  taskId: z.uuid(),
  at: z.iso.datetime(),
});

export const AgentTaskProgressed = z.object({
  type: z.literal('agent.task.progressed'),
  sessionId: z.uuid(),
  agentId: z.string(),
  taskId: z.uuid(),
  progressPct: z.number().int().min(0).max(100),
  status: z.enum(['planned', 'in_progress', 'blocked', 'completed', 'cancelled']).optional(),
  at: z.iso.datetime(),
});

export const AgentTaskCompleted = z.object({
  type: z.literal('agent.task.completed'),
  sessionId: z.uuid(),
  agentId: z.string(),
  taskId: z.uuid(),
  status: z.enum(['completed', 'cancelled']),
  at: z.iso.datetime(),
});

export const AgentDeckEvent = z.discriminatedUnion('type', [
  SessionStarted,
  SessionEnded,
  AgentSpawned,
  AgentStopped,
  MessageDelta,
  ThinkingDelta,
  ToolUseStart,
  ToolUseResult,
  ChannelMessagePosted,
  DocPublished,
  DocUpdated,
  SandboxFileChanged,
  SandboxExecCompleted,
  TestResultReported,
  DirectMessagePosted,
  UserInputSubmitted,
  UserInputAwaiting,
  UserInputResolved,
  BrowserScreenshotTaken,
  AgentCancelRequested,
  MemoryUpdated,
  AgentTaskPlanned,
  AgentTaskStarted,
  AgentTaskProgressed,
  AgentTaskCompleted,
]);
export type AgentDeckEvent = z.infer<typeof AgentDeckEvent>;
