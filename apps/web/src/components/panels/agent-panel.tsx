'use client';
import type { IDockviewPanelProps } from 'dockview-react';
import { useAgentStreams, AgentStreamPanel } from '@/components/agent-stream';
import { useSession } from '@/components/session-context';

interface AgentPanelParams {
  agentId: string;
}

export function AgentPanel(props: IDockviewPanelProps<AgentPanelParams>) {
  const { agentId } = props.params;
  const { events } = useSession();
  const streams = useAgentStreams(events);
  const stream = streams.find((s) => s.agentId === agentId);

  if (!stream) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Waiting for agent {agentId.slice(0, 8)}…</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-4">
      <AgentStreamPanel stream={stream} />
    </div>
  );
}
