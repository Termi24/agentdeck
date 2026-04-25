'use client';
import { useState } from 'react';
import { ChevronRight, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { listSessionAgents, type SessionAgent } from '@/lib/api';
import { usePollingInterval } from '@/lib/use-polling';
import { AgentDetailSheet } from './agent-detail-sheet';
import { ACTIVE_STATUSES, LiveDot, relativeTime, statusClasses } from './shared';

interface Props {
  sessionId: string;
  selectedAgentId: string | null;
  onSelect: (id: string | null) => void;
}

export function AgentTree({ sessionId, selectedAgentId, onSelect }: Props) {
  const [agents, setAgents] = useState<SessionAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailAgent, setDetailAgent] = useState<SessionAgent | null>(null);

  usePollingInterval(
    async () => {
      try {
        const rows = await listSessionAgents(sessionId);
        setAgents(rows);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    },
    8_000,
    [sessionId],
  );

  const roots = agents.filter((a) => a.parentAgentId === null);
  const childrenOf = (id: string) => agents.filter((a) => a.parentAgentId === id);
  const orphans = agents.filter(
    (a) => a.parentAgentId !== null && !agents.some((x) => x.id === a.parentAgentId),
  );

  const runningCount = agents.filter((a) => ACTIVE_STATUSES.includes(a.status)).length;

  return (
    <>
      <Card className="flex h-full flex-col overflow-hidden border-border/60 bg-card/40">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 border-b border-border/40 px-4 py-2.5">
          <CardTitle className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Agents
            <Badge variant="outline" className="px-1.5 py-0 text-[9px]">
              {runningCount}/{agents.length}
            </Badge>
          </CardTitle>
          {selectedAgentId && (
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="text-[10px] text-muted-foreground hover:text-foreground"
            >
              clear filter
            </button>
          )}
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden p-0">
          <ScrollArea className="h-full">
            <div className="flex flex-col">
              {loading && agents.length === 0 ? (
                <div className="p-4 text-xs text-muted-foreground">loading…</div>
              ) : agents.length === 0 ? (
                <div className="p-4 text-xs text-muted-foreground">no agents yet</div>
              ) : (
                <>
                  {roots.map((r) => (
                    <div key={r.id}>
                      <AgentRow
                        a={r}
                        isRoot
                        selected={selectedAgentId === r.id}
                        onSelect={() => onSelect(selectedAgentId === r.id ? null : r.id)}
                        onOpenDetail={() => setDetailAgent(r)}
                      />
                      {childrenOf(r.id).map((c) => (
                        <AgentRow
                          key={c.id}
                          a={c}
                          isRoot={false}
                          selected={selectedAgentId === c.id}
                          onSelect={() => onSelect(selectedAgentId === c.id ? null : c.id)}
                          onOpenDetail={() => setDetailAgent(c)}
                        />
                      ))}
                    </div>
                  ))}
                  {orphans.map((o) => (
                    <AgentRow
                      key={o.id}
                      a={o}
                      isRoot={false}
                      selected={selectedAgentId === o.id}
                      onSelect={() => onSelect(selectedAgentId === o.id ? null : o.id)}
                      onOpenDetail={() => setDetailAgent(o)}
                    />
                  ))}
                </>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
      <AgentDetailSheet
        sessionId={sessionId}
        agent={detailAgent}
        onOpenChange={(o) => !o && setDetailAgent(null)}
      />
    </>
  );
}

function AgentRow({
  a,
  isRoot,
  selected,
  onSelect,
  onOpenDetail,
}: {
  a: SessionAgent;
  isRoot: boolean;
  selected: boolean;
  onSelect: () => void;
  onOpenDetail: () => void;
}) {
  const active = ACTIVE_STATUSES.includes(a.status);
  return (
    <div
      className={`group flex items-center gap-2 border-b border-border/30 px-3 py-2 text-xs transition-colors ${
        selected ? 'bg-primary/10' : 'hover:bg-muted/30'
      } ${isRoot ? '' : 'pl-7'}`}
    >
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <span className="shrink-0">
          {active && a.runningToolCallCount > 0 ? (
            <LiveDot />
          ) : active ? (
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          ) : (
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                a.status === 'failed' ? 'bg-red-500' : 'bg-zinc-600'
              }`}
            />
          )}
        </span>
        <span className="truncate font-mono">{a.name}</span>
        {a.role && (
          <Badge variant="outline" className="shrink-0 px-1 py-0 text-[9px] text-muted-foreground">
            {a.role}
          </Badge>
        )}
      </button>
      <div className="flex shrink-0 items-center gap-1.5">
        {a.dmCount > 0 && (
          <span className="rounded-sm bg-sky-500/15 px-1 text-[9px] text-sky-400" title="direct messages">
            ✉ {a.dmCount}
          </span>
        )}
        {a.runningToolCallCount > 0 && (
          <span className="rounded-sm bg-emerald-500/15 px-1 text-[9px] text-emerald-400">
            {a.runningToolCallCount}●
          </span>
        )}
        {a.toolCallCount > 0 && (
          <span className="text-[9px] text-muted-foreground tabular-nums">{a.toolCallCount}</span>
        )}
        <Badge variant="outline" className={`px-1 py-0 text-[9px] ${statusClasses(a.status)}`}>
          {a.status.replace('_', ' ')}
        </Badge>
        <button
          type="button"
          onClick={onOpenDetail}
          aria-label="open agent detail"
          className="rounded-sm p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 focus:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Info className="h-3 w-3" />
        </button>
        <ChevronRight
          className={`h-3 w-3 text-muted-foreground transition-opacity ${
            selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-60'
          }`}
        />
      </div>
    </div>
  );
}
