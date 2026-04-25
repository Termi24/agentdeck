'use client';
import type { IDockviewPanelProps } from 'dockview-react';
import { useMemo } from 'react';
import type { AgentDeckEvent } from '@agentdeck/shared';
import { cn } from '@/lib/utils';
import { useSession } from '@/components/session-context';

interface AgentTreePanelParams {
  onSelectAgent: (agentId: string) => void;
  activeAgentId?: string;
}

interface AgentNode {
  agentId: string;
  parentAgentId: string | null;
  name: string;
  role?: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  children: AgentNode[];
}

function buildTree(events: AgentDeckEvent[]): AgentNode[] {
  const byId = new Map<string, AgentNode>();
  for (const ev of events) {
    if (ev.type === 'agent.spawned') {
      byId.set(ev.agentId, {
        agentId: ev.agentId,
        parentAgentId: ev.parentAgentId,
        name: ev.name,
        role: ev.role,
        status: 'running',
        children: [],
      });
    } else if (ev.type === 'agent.stopped') {
      const n = byId.get(ev.agentId);
      if (n) n.status = ev.status === 'waiting_tool' || ev.status === 'pending' ? 'running' : ev.status;
    }
  }
  const roots: AgentNode[] = [];
  for (const node of byId.values()) {
    if (!node.parentAgentId) {
      roots.push(node);
      continue;
    }
    const parent = byId.get(node.parentAgentId);
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export function AgentTreePanel(props: IDockviewPanelProps<AgentTreePanelParams>) {
  const { events } = useSession();
  const { onSelectAgent, activeAgentId } = props.params;
  const tree = useMemo(() => buildTree(events), [events]);

  return (
    <div className="flex h-full flex-col overflow-auto p-2">
      <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Agents</div>
      <ul className="flex flex-col gap-0.5">
        {tree.map((node) => (
          <TreeNode key={node.agentId} node={node} depth={0} activeAgentId={activeAgentId} onSelect={onSelectAgent} />
        ))}
      </ul>
    </div>
  );
}

function TreeNode({
  node,
  depth,
  activeAgentId,
  onSelect,
}: {
  node: AgentNode;
  depth: number;
  activeAgentId?: string;
  onSelect: (id: string) => void;
}) {
  const active = activeAgentId === node.agentId;
  return (
    <>
      <li>
        <button
          onClick={() => onSelect(node.agentId)}
          style={{ paddingLeft: `${8 + depth * 12}px` }}
          className={cn(
            'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors',
            active ? 'bg-secondary text-secondary-foreground' : 'hover:bg-muted',
          )}
        >
          <StatusDot status={node.status} />
          <span className="truncate font-medium">{node.name}</span>
          {node.role && <span className="shrink-0 text-[10px] text-muted-foreground">{node.role}</span>}
        </button>
      </li>
      {node.children.map((child) => (
        <TreeNode key={child.agentId} node={child} depth={depth + 1} activeAgentId={activeAgentId} onSelect={onSelect} />
      ))}
    </>
  );
}

function StatusDot({ status }: { status: AgentNode['status'] }) {
  const map: Record<AgentNode['status'], string> = {
    running: 'bg-amber-400 animate-pulse',
    completed: 'bg-emerald-500',
    failed: 'bg-destructive',
    cancelled: 'bg-muted-foreground',
  };
  return <span className={cn('h-1.5 w-1.5 rounded-full', map[status])} />;
}
