'use client';
import type { IDockviewPanelProps } from 'dockview-react';
import { useMemo } from 'react';
import type { AgentDeckEvent } from '@agentdeck/shared';
import { useSession } from '@/components/session-context';
import { Badge } from '@/components/ui/badge';

interface DmPanelParams { agentId: string; agentName: string; }

export function DmPanel(props: IDockviewPanelProps<DmPanelParams>) {
  const { agentId, agentName } = props.params;
  const { events } = useSession();

  const msgs = useMemo(() => {
    const out: Array<{ id: string; fromAgentName: string; toAgentId: string; content: string; at: string }> = [];
    for (const ev of events) {
      if (ev.type !== 'dm.message.posted') continue;
      if (ev.toAgentId !== agentId && ev.fromAgentId !== agentId) continue;
      out.push({ id: ev.messageId, fromAgentName: ev.fromAgentName, toAgentId: ev.toAgentId, content: ev.content, at: ev.at });
    }
    return out.sort((a, b) => a.at.localeCompare(b.at));
  }, [events, agentId]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">DM · {agentName}</h3>
          <Badge variant="secondary">{msgs.length}</Badge>
        </div>
      </div>
      {msgs.length === 0 ? (
        <div className="flex h-full items-center justify-center p-6">
          <p className="text-sm text-muted-foreground">
            No direct messages for this agent yet.
          </p>
        </div>
      ) : (
        <ul className="flex-1 overflow-auto p-3">
          {msgs.map((m) => (
            <li key={m.id} className="mb-2 rounded-md border border-border bg-card p-2 text-xs">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-semibold">
                  {m.fromAgentName} → {m.toAgentId === agentId ? agentName : 'peer'}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">{fmt(m.at)}</span>
              </div>
              <p className="whitespace-pre-wrap">{m.content}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function fmt(iso: string): string { try { return new Date(iso).toLocaleTimeString(); } catch { return iso; } }

// Keep AgentDeckEvent type bound for type-checkers
void (null as unknown as AgentDeckEvent);
