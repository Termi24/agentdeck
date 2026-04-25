'use client';
import { useMemo } from 'react';
import type { AgentDeckEvent } from '@agentdeck/shared';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface AgentStreamView {
  agentId: string;
  name: string;
  role?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  thinking: string;
  text: string;
  toolCalls: Array<{
    id: string;
    toolName: string;
    input: unknown;
    output?: unknown;
    isError?: boolean;
    startedAt: string;
    endedAt?: string;
  }>;
  tokensIn: number;
  tokensOut: number;
}

export function useAgentStreams(events: AgentDeckEvent[]): AgentStreamView[] {
  return useMemo(() => {
    const byAgent = new Map<string, AgentStreamView>();
    for (const ev of events) {
      switch (ev.type) {
        case 'agent.spawned': {
          byAgent.set(ev.agentId, {
            agentId: ev.agentId,
            name: ev.name,
            role: ev.role,
            status: 'running',
            thinking: '',
            text: '',
            toolCalls: [],
            tokensIn: 0,
            tokensOut: 0,
          });
          break;
        }
        case 'agent.thinking.delta': {
          const a = byAgent.get(ev.agentId);
          if (a) a.thinking += ev.text;
          break;
        }
        case 'agent.message.delta': {
          const a = byAgent.get(ev.agentId);
          if (a) a.text += ev.text;
          break;
        }
        case 'agent.tool.use.start': {
          const a = byAgent.get(ev.agentId);
          if (!a) break;
          a.toolCalls.push({
            id: ev.toolCallId,
            toolName: ev.toolName,
            input: ev.input,
            startedAt: ev.at,
          });
          break;
        }
        case 'agent.tool.use.result': {
          const a = byAgent.get(ev.agentId);
          if (!a) break;
          const tc = a.toolCalls.find((t) => t.id === ev.toolCallId);
          if (tc) {
            tc.output = ev.output;
            tc.isError = ev.isError;
            tc.endedAt = ev.at;
          }
          break;
        }
        case 'agent.stopped': {
          const a = byAgent.get(ev.agentId);
          if (a) {
            a.status = ev.status === 'waiting_tool' ? 'running' : ev.status;
            a.tokensIn = ev.tokensIn;
            a.tokensOut = ev.tokensOut;
          }
          break;
        }
        default:
          break;
      }
    }
    return Array.from(byAgent.values());
  }, [events]);
}

export function AgentStreamPanel({ stream }: { stream: AgentStreamView }) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">{stream.name}</h3>
          {stream.role && <Badge variant="secondary">{stream.role}</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={stream.status} />
          <span className="font-mono text-xs text-muted-foreground">
            {stream.tokensIn}↓ / {stream.tokensOut}↑
          </span>
        </div>
      </header>

      {stream.thinking && (
        <section className="rounded-md bg-muted/40 p-3">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Thinking</div>
          <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-muted-foreground">{stream.thinking}</pre>
        </section>
      )}

      {stream.text && (
        <section>
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Output</div>
          <pre className="whitespace-pre-wrap text-sm leading-relaxed">{stream.text}</pre>
        </section>
      )}

      {stream.toolCalls.length > 0 && (
        <section className="flex flex-col gap-2">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tool calls</div>
          {stream.toolCalls.map((tc) => (
            <div key={tc.id} className="rounded-md border border-border bg-background p-2 text-xs">
              <div className="mb-1 flex items-center gap-2">
                <span className="font-mono font-semibold">{tc.toolName}</span>
                {tc.endedAt ? (
                  <Badge variant={tc.isError ? 'destructive' : 'secondary'}>{tc.isError ? 'error' : 'done'}</Badge>
                ) : (
                  <Badge variant="outline">running</Badge>
                )}
              </div>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] text-muted-foreground">
                {JSON.stringify(tc.input, null, 2)}
              </pre>
              {tc.output !== undefined && (
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all border-t border-border pt-1 font-mono text-[11px]">
                  {typeof tc.output === 'string' ? tc.output : JSON.stringify(tc.output, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: AgentStreamView['status'] }) {
  const label = status;
  const cls: Record<AgentStreamView['status'], string> = {
    pending: 'bg-muted text-muted-foreground',
    running: 'bg-amber-500/20 text-amber-200 border-amber-500/40',
    completed: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40',
    failed: 'bg-destructive/20 text-destructive-foreground border-destructive/40',
    cancelled: 'bg-muted text-muted-foreground',
  };
  return (
    <span className={cn('rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider', cls[status])}>
      {label}
    </span>
  );
}
