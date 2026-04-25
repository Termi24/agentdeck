import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { AgentDeckEvent } from '@agentdeck/shared';
import type { EventBus } from './event-bus.js';
import { config } from './config.js';
import { appendEvent, finalizeAgent, finalizeSession, insertAgent, insertSession } from './persistence.js';
import { registerBridgeSession, unregisterBridgeSession } from './services/bridge-watchdog.js';
import { translate, type MultiAgentContext } from './sdk-translator.js';
import { resolveMcpServerCommand } from './mcp-bootstrap.js';

export interface StartSessionInput {
  projectId: string;
  prompt: string;
  title?: string;
  bridge?: boolean;
  rootAgentName?: string;
  rootAgentRole?: string;
}

export interface StartSessionResult {
  sessionId: string;
  rootAgentId: string;
}

export interface SessionManager {
  start(input: StartSessionInput): Promise<StartSessionResult>;
  cancel(sessionId: string): Promise<void>;
}

interface RunningSession {
  abort: AbortController;
}

export function createSessionManager(eventBus: EventBus, logger?: { error: (msg: unknown) => void }): SessionManager {
  const running = new Map<string, RunningSession>();

  return {
    async start({ projectId, prompt, title, bridge, rootAgentName, rootAgentRole }) {
      const sessionId = randomUUID();
      const rootAgentId = randomUUID();
      const now = new Date().toISOString();
      const workspacePath = resolve(config.WORKSPACE_ROOT, sessionId);
      mkdirSync(workspacePath, { recursive: true });

      const agentName = rootAgentName ?? (bridge ? 'claude-cli' : 'orchestrator');
      const agentRole = rootAgentRole ?? (bridge ? 'bridge' : 'root');

      insertSession({
        id: sessionId,
        projectId,
        title: title ?? prompt.slice(0, 80),
        rootPrompt: prompt,
        workspacePath,
        status: 'running',
        startedAt: now,
      });
      insertAgent({
        id: rootAgentId,
        sessionId,
        parentAgentId: null,
        name: agentName,
        role: agentRole,
        prompt,
        status: 'running',
        startedAt: now,
      });

      emit(eventBus, { type: 'session.started', sessionId, projectId, prompt, at: now });
      emit(eventBus, {
        type: 'agent.spawned',
        sessionId,
        agentId: rootAgentId,
        parentAgentId: null,
        name: agentName,
        role: agentRole,
        prompt,
        at: now,
        seq: 0,
      });

      if (bridge) {
        registerBridgeSession(sessionId);
      } else {
        const abort = new AbortController();
        running.set(sessionId, { abort });
        void runSession({
          sessionId,
          rootAgentId,
          projectId,
          prompt,
          workspacePath,
          abort,
          eventBus,
          logger,
        }).finally(() => {
          running.delete(sessionId);
        });
      }

      return { sessionId, rootAgentId };
    },

    async cancel(sessionId) {
      const entry = running.get(sessionId);
      if (entry) {
        entry.abort.abort();
        return;
      }
      // Bridge session (no SDK run behind it) — finalize directly.
      unregisterBridgeSession(sessionId);
      finalizeSession(sessionId, { status: 'cancelled', totalTokensIn: 0, totalTokensOut: 0 });
      const nowIso = new Date().toISOString();
      const ended: import('@agentdeck/shared').AgentDeckEvent = {
        type: 'session.ended',
        sessionId,
        status: 'cancelled',
        totalTokensIn: 0,
        totalTokensOut: 0,
        at: nowIso,
      };
      appendEvent(ended);
      eventBus.emit(ended);
    },
  };
}

async function runSession(args: {
  sessionId: string;
  rootAgentId: string;
  projectId: string;
  prompt: string;
  workspacePath: string;
  abort: AbortController;
  eventBus: EventBus;
  logger?: { error: (msg: unknown) => void };
}): Promise<void> {
  const { sessionId, rootAgentId, projectId, prompt, workspacePath, abort, eventBus, logger } = args;
  let seq = 1;
  const ctx: MultiAgentContext = {
    sessionId,
    rootAgentId,
    nextSeq: () => seq++,
    taskIdToAgentId: new Map(),
    toolUseOwner: new Map(),
    taskToolUseToChild: new Map(),
  };

  let tokensIn = 0;
  let tokensOut = 0;
  let status: 'completed' | 'failed' | 'cancelled' = 'completed';

  try {
    const mcpServer = resolveMcpServerCommand({
      sessionId,
      agentId: rootAgentId,
      agentName: 'orchestrator',
      projectId,
      proxyUrl: `http://${config.PROXY_HOST}:${config.PROXY_PORT}`,
    });

    const q = query({
      prompt,
      options: {
        abortController: abort,
        cwd: workspacePath,
        includePartialMessages: true,
        mcpServers: { agentdeck: mcpServer },
        permissionMode: 'bypassPermissions',
        allowedTools: [
          'mcp__agentdeck__list_procedures',
          'mcp__agentdeck__run_test_procedure',
          'mcp__agentdeck__post_to_channel',
          'mcp__agentdeck__read_channel',
          'mcp__agentdeck__publish_doc',
          'mcp__agentdeck__sandbox_write',
          'mcp__agentdeck__sandbox_read',
          'mcp__agentdeck__sandbox_exec',
          'mcp__agentdeck__report_test_result',
          'mcp__agentdeck__project_memory_read',
          'mcp__agentdeck__project_memory_write',
          'mcp__agentdeck__send_direct',
          'mcp__agentdeck__read_direct',
          'mcp__agentdeck__secrets_get',
          'mcp__agentdeck__wait_for_channel',
          'mcp__agentdeck__await_user_input',
          'mcp__agentdeck__diff_exec',
          'mcp__agentdeck__request_agent_cancel',
          'mcp__agentdeck__check_cancellation',
          'mcp__agentdeck__browser_navigate',
          'mcp__agentdeck__browser_snapshot',
          'mcp__agentdeck__browser_click',
          'mcp__agentdeck__browser_type',
          'mcp__agentdeck__browser_fill_form',
          'mcp__agentdeck__browser_wait_for',
          'mcp__agentdeck__browser_press_key',
          'mcp__agentdeck__browser_screenshot',
        ],
      },
    });

    for await (const msg of q) {
      const result = translate(ctx, msg);
      const now = new Date().toISOString();

      for (const spawn of result.spawned) {
        insertAgent({
          id: spawn.agentId,
          sessionId,
          parentAgentId: spawn.parentAgentId,
          name: spawn.name,
          role: spawn.role,
          prompt: spawn.prompt,
          status: 'running',
          startedAt: now,
        });
      }

      for (const event of result.events) {
        emit(eventBus, event);
      }

      for (const stop of result.stopped) {
        finalizeAgent(stop.agentId, { status: stop.status, tokensIn: 0, tokensOut: 0 });
      }

      if (result.stats) {
        tokensIn = result.stats.tokensIn;
        tokensOut = result.stats.tokensOut;
      }
    }
  } catch (err) {
    if (abort.signal.aborted) {
      status = 'cancelled';
    } else {
      status = 'failed';
      logger?.error(err);
    }
  }

  const now = new Date().toISOString();
  finalizeAgent(rootAgentId, { status, tokensIn, tokensOut });
  finalizeSession(sessionId, { status, totalTokensIn: tokensIn, totalTokensOut: tokensOut });

  emit(eventBus, {
    type: 'agent.stopped',
    sessionId,
    agentId: rootAgentId,
    at: now,
    seq: seq++,
    status,
    tokensIn,
    tokensOut,
  });
  emit(eventBus, {
    type: 'session.ended',
    sessionId,
    status,
    totalTokensIn: tokensIn,
    totalTokensOut: tokensOut,
    at: now,
  });
}

function emit(eventBus: EventBus, event: AgentDeckEvent): void {
  appendEvent(event);
  eventBus.emit(event);
}
