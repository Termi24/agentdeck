'use client';
import type { IDockviewPanelProps } from 'dockview-react';
import { useEffect, useMemo, useState } from 'react';
import type { AgentDeckEvent } from '@agentdeck/shared';
import { useSession } from '@/components/session-context';
import { Badge } from '@/components/ui/badge';

interface ChannelMessage {
  id: string;
  fromAgentName: string;
  content: string;
  createdAt: string;
}

export function ChannelPanel(_props: IDockviewPanelProps) {
  const { events } = useSession();
  const [seed] = useState<ChannelMessage[]>([]);

  const messages = useMemo(() => {
    const out: ChannelMessage[] = [...seed];
    for (const ev of events) {
      if (ev.type !== 'channel.message.posted') continue;
      if (out.some((m) => m.id === ev.messageId)) continue;
      out.push({ id: ev.messageId, fromAgentName: ev.fromAgentName, content: ev.content, createdAt: ev.at });
    }
    out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return out;
  }, [events, seed]);

  useEffect(() => {
    const el = document.getElementById('channel-scroll');
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  return (
    <div id="channel-scroll" className="h-full overflow-auto p-4">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-sm font-semibold">Project channel</h3>
        <Badge variant="secondary">{messages.length}</Badge>
      </div>
      {messages.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Agents post here via <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">post_to_channel</code>.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {messages.map((m) => (
            <li key={m.id} className="rounded-md border border-border bg-card p-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold">{m.fromAgentName}</span>
                <span className="font-mono text-[10px] text-muted-foreground">{fmt(m.createdAt)}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm">{m.content}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString();
  } catch {
    return iso;
  }
}

// Satisfies AgentDeckEvent import used for narrowing
void (null as unknown as AgentDeckEvent);
