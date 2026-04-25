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

export const DocPublished = z.object({
  type: z.literal('doc.published'),
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
  projectId: z.string(),
  key: z.string(),
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
  SandboxFileChanged,
  TestResultReported,
  DirectMessagePosted,
  UserInputSubmitted,
  UserInputAwaiting,
  UserInputResolved,
  BrowserScreenshotTaken,
  AgentCancelRequested,
  MemoryUpdated,
]);
export type AgentDeckEvent = z.infer<typeof AgentDeckEvent>;
