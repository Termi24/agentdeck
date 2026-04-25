import { randomUUID } from 'node:crypto';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { AgentDeckEvent } from '@agentdeck/shared';

export interface MultiAgentContext {
  sessionId: string;
  rootAgentId: string;
  nextSeq: () => number;
  taskIdToAgentId: Map<string, string>;
  toolUseOwner: Map<string, string>;
  taskToolUseToChild: Map<string, string>;
}

export interface SpawnRecord {
  agentId: string;
  parentAgentId: string | null;
  name: string;
  role?: string;
  prompt: string;
}

export interface StopRecord {
  agentId: string;
  status: 'completed' | 'failed' | 'cancelled';
}

export interface TranslationResult {
  events: AgentDeckEvent[];
  spawned: SpawnRecord[];
  stopped: StopRecord[];
  stats: { tokensIn: number; tokensOut: number } | null;
}

export function translate(ctx: MultiAgentContext, msg: SDKMessage): TranslationResult {
  const out: TranslationResult = { events: [], spawned: [], stopped: [], stats: null };

  switch (msg.type) {
    case 'stream_event':
      handleStreamEvent(ctx, msg, out);
      break;
    case 'assistant':
      handleAssistant(ctx, msg, out);
      break;
    case 'user':
      handleUserTurn(ctx, msg, out);
      break;
    case 'system':
      handleSystem(ctx, msg, out);
      break;
    case 'result':
      if (msg.subtype === 'success') {
        out.stats = { tokensIn: msg.usage.input_tokens ?? 0, tokensOut: msg.usage.output_tokens ?? 0 };
      }
      break;
    default:
      break;
  }

  return out;
}

function resolveAuthor(ctx: MultiAgentContext, parentToolUseId: string | null | undefined): string {
  if (!parentToolUseId) return ctx.rootAgentId;
  const child = ctx.taskToolUseToChild.get(parentToolUseId);
  if (child) return child;
  return ctx.toolUseOwner.get(parentToolUseId) ?? ctx.rootAgentId;
}

function handleStreamEvent(
  ctx: MultiAgentContext,
  msg: Extract<SDKMessage, { type: 'stream_event' }>,
  out: TranslationResult,
): void {
  const ev = msg.event;
  if (ev.type !== 'content_block_delta') return;
  const agentId = resolveAuthor(ctx, msg.parent_tool_use_id);
  const now = new Date().toISOString();
  if (ev.delta.type === 'text_delta') {
    out.events.push({
      type: 'agent.message.delta',
      sessionId: ctx.sessionId,
      agentId,
      at: now,
      seq: ctx.nextSeq(),
      text: ev.delta.text,
    });
    return;
  }
  if (ev.delta.type === 'thinking_delta') {
    out.events.push({
      type: 'agent.thinking.delta',
      sessionId: ctx.sessionId,
      agentId,
      at: now,
      seq: ctx.nextSeq(),
      text: ev.delta.thinking,
    });
  }
}

function handleAssistant(
  ctx: MultiAgentContext,
  msg: Extract<SDKMessage, { type: 'assistant' }>,
  out: TranslationResult,
): void {
  const agentId = resolveAuthor(ctx, msg.parent_tool_use_id);
  const now = new Date().toISOString();
  for (const block of msg.message.content) {
    if (block.type !== 'tool_use') continue;
    ctx.toolUseOwner.set(block.id, agentId);
    out.events.push({
      type: 'agent.tool.use.start',
      sessionId: ctx.sessionId,
      agentId,
      at: now,
      seq: ctx.nextSeq(),
      toolCallId: block.id,
      toolName: block.name,
      input: block.input,
    });
  }
}

function handleUserTurn(
  ctx: MultiAgentContext,
  msg: Extract<SDKMessage, { type: 'user' }>,
  out: TranslationResult,
): void {
  const content = msg.message.content;
  if (typeof content === 'string' || !Array.isArray(content)) return;
  const now = new Date().toISOString();
  for (const block of content) {
    if (typeof block !== 'object' || block === null || !('type' in block) || block.type !== 'tool_result') continue;

    const ownerAgentId = ctx.toolUseOwner.get(block.tool_use_id) ?? ctx.rootAgentId;
    out.events.push({
      type: 'agent.tool.use.result',
      sessionId: ctx.sessionId,
      agentId: ownerAgentId,
      at: now,
      seq: ctx.nextSeq(),
      toolCallId: block.tool_use_id,
      output: block.content,
      isError: block.is_error ?? false,
      durationMs: 0,
    });

    const childAgentId = ctx.taskToolUseToChild.get(block.tool_use_id);
    if (childAgentId) {
      const text = extractTextFromToolResult(block.content);
      if (text) {
        out.events.push({
          type: 'agent.message.delta',
          sessionId: ctx.sessionId,
          agentId: childAgentId,
          at: now,
          seq: ctx.nextSeq(),
          text,
        });
      }
      const status: 'completed' | 'failed' = block.is_error ? 'failed' : 'completed';
      out.stopped.push({ agentId: childAgentId, status });
      out.events.push({
        type: 'agent.stopped',
        sessionId: ctx.sessionId,
        agentId: childAgentId,
        at: now,
        seq: ctx.nextSeq(),
        status,
        tokensIn: 0,
        tokensOut: 0,
      });
    }
  }
}

function extractTextFromToolResult(content: unknown): string | null {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return null;
  const parts: string[] = [];
  for (const block of content) {
    if (typeof block === 'object' && block !== null && 'type' in block && (block as { type: string }).type === 'text') {
      const text = (block as { text?: string }).text;
      if (typeof text === 'string') parts.push(text);
    }
  }
  return parts.length > 0 ? parts.join('\n') : null;
}

function handleSystem(
  ctx: MultiAgentContext,
  msg: Extract<SDKMessage, { type: 'system' }>,
  out: TranslationResult,
): void {
  if (msg.subtype === 'task_started') {
    if (msg.skip_transcript) return;
    const parentAgentId = msg.tool_use_id
      ? ctx.toolUseOwner.get(msg.tool_use_id) ?? ctx.rootAgentId
      : ctx.rootAgentId;
    const agentId = randomUUID();
    ctx.taskIdToAgentId.set(msg.task_id, agentId);
    if (msg.tool_use_id) ctx.taskToolUseToChild.set(msg.tool_use_id, agentId);
    const prompt = msg.prompt ?? msg.description ?? '';
    const name = msg.workflow_name ?? msg.description ?? `task:${msg.task_id.slice(0, 8)}`;
    const role = msg.task_type ?? 'subagent';
    const now = new Date().toISOString();
    out.spawned.push({ agentId, parentAgentId, name, role, prompt });
    out.events.push({
      type: 'agent.spawned',
      sessionId: ctx.sessionId,
      agentId,
      parentAgentId,
      name,
      role,
      prompt,
      at: now,
      seq: ctx.nextSeq(),
    });
    return;
  }
  if (msg.subtype === 'task_updated') {
    const agentId = ctx.taskIdToAgentId.get(msg.task_id);
    if (!agentId) return;
    const patchStatus = msg.patch.status;
    if (!patchStatus || !isTerminal(patchStatus)) return;
    const status = mapStatus(patchStatus);
    const now = new Date().toISOString();
    out.stopped.push({ agentId, status });
    out.events.push({
      type: 'agent.stopped',
      sessionId: ctx.sessionId,
      agentId,
      at: now,
      seq: ctx.nextSeq(),
      status,
      tokensIn: 0,
      tokensOut: 0,
    });
  }
}

function isTerminal(s: string): s is 'completed' | 'failed' | 'killed' {
  return s === 'completed' || s === 'failed' || s === 'killed';
}

function mapStatus(s: 'completed' | 'failed' | 'killed'): 'completed' | 'failed' | 'cancelled' {
  if (s === 'killed') return 'cancelled';
  return s;
}
