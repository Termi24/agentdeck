'use client';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronRight, Info } from 'lucide-react';
import type { AgentDeckEvent } from '@agentdeck/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useSession } from '@/components/session-context';
import { listSessionAgents, type SessionAgent } from '@/lib/api';
import { usePollingInterval } from '@/lib/use-polling';
import { AgentDetailSheet } from './agent-detail-sheet';
import { ACTIVE_STATUSES, LiveDot, relativeTime, statusClasses } from './shared';

type StuckLevel = 'ok' | 'warning' | 'intervention';
const WARN_MIN = 3;
const INTERVENE_MIN = 5;
const SELF_TYPES = new Set(['agent.stuck.warning', 'agent.stuck.intervention']);

/**
 * Client-side vigie (FB-01). Reads the per-agent `agentId`-bearing events
 * from the session event stream and computes stuck status in parallel with
 * the backend watchdog. Same thresholds (3 min warning / 5 min intervention)
 * — the user explicitly asked for redundancy ("double watchdog backend + UI")
 * so even if the backend dies the badge still surfaces.
 *
 * Self-emitted events (`agent.stuck.*`) are excluded from `lastEventAt` so
 * the watchdog speaking up doesn't reset its own clock.
 */
function useAgentStuckStatus(agents: SessionAgent[]): Map<string, { minutes: number; level: StuckLevel }> {
  const { events } = useSession();
  // Tick to refresh time-based decisions even between event arrivals.
  const [, setTick] = useState(0);
  useEffect(() => {
    const h = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(h);
  }, []);

  return useMemo(() => {
    const lastByAgent = new Map<string, string>();
    for (const e of events as ReadonlyArray<AgentDeckEvent>) {
      if (SELF_TYPES.has(e.type)) continue;
      const agentId = 'agentId' in e ? (e as { agentId: string }).agentId : null;
      if (!agentId) continue;
      const at = 'at' in e ? (e as { at: string }).at : null;
      if (!at) continue;
      const prev = lastByAgent.get(agentId);
      if (!prev || prev < at) lastByAgent.set(agentId, at);
    }
    const out = new Map<string, { minutes: number; level: StuckLevel }>();
    const now = Date.now();
    for (const a of agents) {
      if (!ACTIVE_STATUSES.includes(a.status)) continue;
      const last = lastByAgent.get(a.id) ?? a.startedAt;
      const t = Date.parse(last);
      if (Number.isNaN(t)) continue;
      const minutes = Math.floor((now - t) / 60_000);
      let level: StuckLevel = 'ok';
      if (minutes >= INTERVENE_MIN) level = 'intervention';
      else if (minutes >= WARN_MIN) level = 'warning';
      if (level !== 'ok') out.set(a.id, { minutes, level });
    }
    return out;
  }, [agents, events]);
}

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

  const stuck = useAgentStuckStatus(agents);
  const roots = agents.filter((a) => a.parentAgentId === null);
  const childrenOf = (id: string) => agents.filter((a) => a.parentAgentId === id);
  const orphans = agents.filter(
    (a) => a.parentAgentId !== null && !agents.some((x) => x.id === a.parentAgentId),
  );

  const runningCount = agents.filter((a) => ACTIVE_STATUSES.includes(a.status)).length;
  const stuckCount = stuck.size;

  return (
    <>
      <Card className="glass ring-soft flex h-full flex-col overflow-hidden rounded-2xl border-white/10 bg-transparent">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 border-b border-white/10 px-4 py-2.5">
          <CardTitle className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-white/55">
            Agents
            <Badge variant="outline" className="font-mono tabular border-white/15 bg-white/5 px-1.5 py-0 text-[10px] text-white/70">
              {runningCount}/{agents.length}
            </Badge>
            {stuckCount > 0 && (
              <Badge variant="outline" className="border-amber-300/30 bg-amber-400/10 px-1.5 py-0 text-[10px] text-amber-200">
                {stuckCount} stuck
              </Badge>
            )}
          </CardTitle>
          {selectedAgentId && (
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="text-[10px] text-white/55 hover:text-white"
            >
              clear filter
            </button>
          )}
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden p-0">
          <ScrollArea className="h-full">
            <div className="flex flex-col">
              {loading && agents.length === 0 ? (
                <div className="p-4 text-[11.5px] text-white/45">loading…</div>
              ) : agents.length === 0 ? (
                <div className="p-4 text-[11.5px] text-white/45">no agents yet</div>
              ) : (
                <>
                  {roots.map((r) => (
                    <div key={r.id}>
                      <AgentRow
                        a={r}
                        isRoot
                        selected={selectedAgentId === r.id}
                        stuck={stuck.get(r.id) ?? null}
                        onSelect={() => onSelect(selectedAgentId === r.id ? null : r.id)}
                        onOpenDetail={() => setDetailAgent(r)}
                      />
                      {childrenOf(r.id).map((c) => (
                        <AgentRow
                          key={c.id}
                          a={c}
                          isRoot={false}
                          selected={selectedAgentId === c.id}
                          stuck={stuck.get(c.id) ?? null}
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
                      stuck={stuck.get(o.id) ?? null}
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
  stuck,
  onSelect,
  onOpenDetail,
}: {
  a: SessionAgent;
  isRoot: boolean;
  selected: boolean;
  stuck: { minutes: number; level: StuckLevel } | null;
  onSelect: () => void;
  onOpenDetail: () => void;
}) {
  const active = ACTIVE_STATUSES.includes(a.status);
  return (
    <div
      className={`group flex items-center gap-2 border-b border-white/5 px-3 py-2 text-xs transition-colors ${
        selected ? 'bg-white/10 ring-1 ring-inset ring-violet-300/30' : 'hover:bg-white/5'
      } ${isRoot ? '' : 'pl-7'} ${stuck?.level === 'intervention' ? 'bg-rose-500/10' : stuck?.level === 'warning' ? 'bg-amber-400/5' : ''}`}
    >
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <span className="shrink-0">
          {active && a.runningToolCallCount > 0 ? (
            <LiveDot />
          ) : active ? (
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-300" />
          ) : (
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                a.status === 'failed' ? 'bg-rose-400' : 'bg-white/30'
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
        {stuck && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={`flex items-center gap-0.5 rounded-full px-1.5 text-[9px] ${
                    stuck.level === 'intervention'
                      ? 'bg-rose-400/15 text-rose-200'
                      : 'bg-amber-400/15 text-amber-200'
                  }`}
                >
                  <AlertTriangle className="h-2.5 w-2.5" />
                  {stuck.minutes}m
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {stuck.level === 'intervention'
                  ? `Stuck for ${stuck.minutes} min — backend watchdog should auto-cancel`
                  : `Silent for ${stuck.minutes} min — heads up`}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {a.dmCount > 0 && (
          <span className="rounded-full bg-sky-400/15 px-1.5 text-[9px] text-sky-200" title="direct messages">
            ✉ {a.dmCount}
          </span>
        )}
        {a.runningToolCallCount > 0 && (
          <span className="rounded-full bg-emerald-400/15 px-1.5 text-[9px] text-emerald-200">
            {a.runningToolCallCount}●
          </span>
        )}
        {a.toolCallCount > 0 && (
          <span className="font-mono text-[10px] tabular text-white/55">{a.toolCallCount}</span>
        )}
        <Badge variant="outline" className={`rounded-full border px-1.5 py-0 text-[9px] capitalize ${statusClasses(a.status)}`}>
          {a.status.replace('_', ' ')}
        </Badge>
        <button
          type="button"
          onClick={onOpenDetail}
          aria-label="open agent detail"
          className="rounded-sm p-0.5 text-white/55 opacity-0 transition-opacity hover:text-white group-hover:opacity-100 focus:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/50"
        >
          <Info className="h-3 w-3" />
        </button>
        <ChevronRight
          className={`h-3 w-3 text-white/55 transition-opacity ${
            selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-60'
          }`}
        />
      </div>
    </div>
  );
}
