'use client';
import {
  CheckCircle2,
  CircleDot,
  FileText,
  MessageSquare,
  Power,
  Send,
  UserPlus,
  Wrench,
  XCircle,
  ChevronDown,
  CircleDashed,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentDeckEvent } from '@agentdeck/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSession } from '@/components/session-context';
import { relativeTime } from './shared';

export type Filter = 'all' | 'channel' | 'tools' | 'docs' | 'tests' | 'agents';

export interface FeedItem {
  key: string;
  at: string;
  category: Exclude<Filter, 'all'> | 'session';
  icon: LucideIcon;
  tone: 'blue' | 'purple' | 'emerald' | 'amber' | 'red' | 'slate';
  fromAgentName?: string | null;
  title: string;
  body?: string | null;
  rightBadge?: string | null;
}

export const TONE_CLASSES: Record<FeedItem['tone'], string> = {
  blue: 'bg-sky-400/10 text-sky-200 border-sky-300/30',
  purple: 'bg-violet-400/10 text-violet-200 border-violet-300/30',
  emerald: 'bg-emerald-400/10 text-emerald-200 border-emerald-300/30',
  amber: 'bg-amber-400/10 text-amber-200 border-amber-300/30',
  red: 'bg-rose-400/10 text-rose-200 border-rose-300/30',
  slate: 'bg-white/5 text-white/65 border-white/15',
};

interface Props {
  agentFilterId: string | null;
  agentFilterName?: string | null;
  onClearAgentFilter: () => void;
}

export function ActivityFeed({ agentFilterId, agentFilterName, onClearAgentFilter }: Props) {
  const { events } = useSession();
  const [filter, setFilter] = useState<Filter>('all');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [newSinceScroll, setNewSinceScroll] = useState(0);

  const items = useMemo(() => foldEvents(events, agentFilterId), [events, agentFilterId]);

  const visible = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter((it) => it.category === filter);
  }, [items, filter]);

  const prevCountRef = useRef(0);
  useEffect(() => {
    const viewport = scrollRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
    if (!viewport) return;
    if (autoScroll) {
      viewport.scrollTop = viewport.scrollHeight;
      setNewSinceScroll(0);
    } else if (visible.length > prevCountRef.current) {
      setNewSinceScroll((n) => n + (visible.length - prevCountRef.current));
    }
    prevCountRef.current = visible.length;
  }, [visible.length, autoScroll]);

  const onScroll = () => {
    const viewport = scrollRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
    if (!viewport) return;
    const atBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 24;
    if (atBottom && !autoScroll) {
      setAutoScroll(true);
      setNewSinceScroll(0);
    } else if (!atBottom && autoScroll) {
      setAutoScroll(false);
    }
  };

  const jumpToLatest = () => {
    const viewport = scrollRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
      setAutoScroll(true);
      setNewSinceScroll(0);
    }
  };

  return (
    <Card className="glass ring-soft flex h-full flex-col overflow-hidden rounded-2xl border-white/10 bg-transparent">
      <CardHeader className="space-y-2 border-b border-white/10 px-4 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[11px] font-medium uppercase tracking-wider text-white/55">
            Activity ({visible.length}
            {visible.length !== items.length && `/${items.length}`})
          </h2>
          {agentFilterId && (
            <button
              type="button"
              className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] text-white/70 hover:bg-white/10 hover:text-white"
              onClick={onClearAgentFilter}
            >
              filter: {agentFilterName ?? agentFilterId.slice(0, 6)} ×
            </button>
          )}
        </div>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList className="h-7 w-full justify-start gap-1 bg-transparent p-0">
            {(['all', 'channel', 'tools', 'docs', 'tests', 'agents'] as const).map((f) => (
              <TabsTrigger
                key={f}
                value={f}
                className="h-7 rounded-full border border-transparent bg-transparent px-2.5 text-[11px] capitalize text-white/55 data-[state=active]:border-white/15 data-[state=active]:bg-white/10 data-[state=active]:text-white data-[state=active]:shadow-none"
              >
                {f}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className="relative flex-1 overflow-hidden p-0">
        <ScrollArea ref={scrollRef} className="h-full" onScrollCapture={onScroll}>
          <div className="flex flex-col">
            {visible.length === 0 ? (
              <div className="p-6 text-center text-[12px] text-white/45">
                no activity yet — waiting for events…
              </div>
            ) : (
              visible.map((it) => <FeedRow key={it.key} item={it} />)
            )}
          </div>
        </ScrollArea>
        {!autoScroll && newSinceScroll > 0 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
            <Button
              size="sm"
              variant="outline"
              className="grad-accent h-7 gap-1 rounded-full border-0 px-3 text-[11px] font-medium text-white shadow-soft-pop"
              onClick={jumpToLatest}
            >
              <ChevronDown className="h-3.5 w-3.5" />
              {newSinceScroll} new
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function FeedRow({ item }: { item: FeedItem }) {
  const Icon = item.icon;
  return (
    <div className="flex items-start gap-3 border-b border-white/5 px-4 py-2.5 text-[12.5px] animate-in fade-in-0 slide-in-from-bottom-1 duration-150 last:border-0">
      <div
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border ${TONE_CLASSES[item.tone]}`}
      >
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-baseline gap-2">
          {item.fromAgentName && <span className="font-mono shrink-0 text-[11px] text-white/85">{item.fromAgentName}</span>}
          <span className="truncate text-white/70">{item.title}</span>
          <span className="font-mono ml-auto shrink-0 text-[10px] tabular text-white/45">{relativeTime(item.at)}</span>
        </div>
        {item.body && <p className="whitespace-pre-wrap break-words text-white/85">{item.body}</p>}
        {item.rightBadge && (
          <div className="mt-1">
            <Badge variant="outline" className="rounded-full border-white/15 bg-white/5 px-2 py-0 text-[10px] text-white/70">
              {item.rightBadge}
            </Badge>
          </div>
        )}
      </div>
    </div>
  );
}

export function foldEvents(events: ReadonlyArray<AgentDeckEvent>, filterAgentId: string | null): FeedItem[] {
  const items: FeedItem[] = [];
  // agentId → name cache built as we walk events (so tool calls know their agent)
  const nameFor: Record<string, string> = {};

  for (const e of events) {
    switch (e.type) {
      case 'session.started':
        items.push({
          key: `${e.type}:${e.at}`,
          at: e.at,
          category: 'session',
          icon: Power,
          tone: 'slate',
          title: `session started in ${e.projectId}`,
        });
        break;
      case 'session.ended':
        items.push({
          key: `${e.type}:${e.at}`,
          at: e.at,
          category: 'session',
          icon: Power,
          tone: e.status === 'completed' ? 'slate' : e.status === 'failed' ? 'red' : 'amber',
          title: `session ${e.status}`,
        });
        break;
      case 'agent.spawned':
        nameFor[e.agentId] = e.name;
        if (filterAgentId && e.agentId !== filterAgentId) break;
        items.push({
          key: `${e.type}:${e.agentId}`,
          at: e.at,
          category: 'agents',
          icon: UserPlus,
          tone: 'slate',
          fromAgentName: e.name,
          title: e.parentAgentId === null ? 'orchestrator spawned' : 'sub-agent spawned',
          body: e.prompt?.slice(0, 160),
          rightBadge: e.role ?? undefined,
        });
        break;
      case 'agent.stopped':
        if (filterAgentId && e.agentId !== filterAgentId) break;
        items.push({
          key: `${e.type}:${e.agentId}:${e.at}`,
          at: e.at,
          category: 'agents',
          icon: e.status === 'completed' ? CheckCircle2 : e.status === 'failed' ? XCircle : CircleDashed,
          tone: e.status === 'completed' ? 'slate' : e.status === 'failed' ? 'red' : 'amber',
          fromAgentName: nameFor[e.agentId] ?? e.agentId.slice(0, 6),
          title: `agent ${e.status}`,
        });
        break;
      case 'agent.tool.use.start':
        if (filterAgentId && e.agentId !== filterAgentId) break;
        items.push({
          key: `tool:${e.toolCallId}:start`,
          at: e.at,
          category: 'tools',
          icon: Wrench,
          tone: 'purple',
          fromAgentName: nameFor[e.agentId] ?? e.agentId.slice(0, 6),
          title: `→ ${e.toolName}`,
          body: summarizeJson(e.input, 180),
        });
        break;
      case 'agent.tool.use.result':
        if (filterAgentId && e.agentId !== filterAgentId) break;
        items.push({
          key: `tool:${e.toolCallId}:result`,
          at: e.at,
          category: 'tools',
          icon: e.isError ? XCircle : CheckCircle2,
          tone: e.isError ? 'red' : 'purple',
          fromAgentName: nameFor[e.agentId] ?? e.agentId.slice(0, 6),
          title: e.isError ? '✗ tool error' : `✓ tool ok · ${e.durationMs}ms`,
          body: summarizeJson(e.output, 180),
        });
        break;
      case 'channel.message.posted':
        if (filterAgentId && e.fromAgentId !== filterAgentId) break;
        items.push({
          key: `ch:${e.messageId}`,
          at: e.at,
          category: 'channel',
          icon: MessageSquare,
          tone: 'blue',
          fromAgentName: e.fromAgentName,
          title: 'channel',
          body: e.content,
        });
        break;
      case 'dm.message.posted':
        if (filterAgentId && e.fromAgentId !== filterAgentId && e.toAgentId !== filterAgentId) break;
        items.push({
          key: `dm:${e.messageId}`,
          at: e.at,
          category: 'channel',
          icon: Send,
          tone: 'blue',
          fromAgentName: e.fromAgentName,
          title: `DM → ${nameFor[e.toAgentId] ?? e.toAgentId.slice(0, 6)}`,
          body: e.content,
        });
        break;
      case 'doc.published':
      case 'doc.updated':
        if (filterAgentId && e.byAgentId !== filterAgentId) break;
        items.push({
          key: `doc:${e.docId}:${e.at}`,
          at: e.at,
          category: 'docs',
          icon: FileText,
          tone: 'emerald',
          fromAgentName: nameFor[e.byAgentId] ?? e.byAgentId.slice(0, 6),
          title: `${e.type === 'doc.updated' ? 'doc updated' : 'doc'} · ${e.path}`,
        });
        break;
      case 'test.result.reported':
        if (filterAgentId && e.agentId !== filterAgentId) break;
        items.push({
          key: `test:${e.resultId}`,
          at: e.at,
          category: 'tests',
          icon: e.status === 'passed' ? CheckCircle2 : e.status === 'failed' ? XCircle : CircleDot,
          tone: e.status === 'passed' ? 'emerald' : e.status === 'failed' ? 'red' : 'amber',
          fromAgentName: nameFor[e.agentId] ?? e.agentId.slice(0, 6),
          title: `${e.suite} · ${e.caseName}`,
          body: e.message ?? null,
          rightBadge: e.status,
        });
        break;
      case 'user.input.submitted':
        items.push({
          key: `input:${e.inputId}`,
          at: e.at,
          category: 'channel',
          icon: Send,
          tone: 'amber',
          fromAgentName: 'user',
          title: 'user input',
          body: e.content,
        });
        break;
      case 'agent.stuck.warning':
        if (filterAgentId && e.agentId !== filterAgentId) break;
        items.push({
          key: `stuck-warn:${e.agentId}:${e.at}`,
          at: e.at,
          category: 'agents',
          icon: CircleDashed,
          tone: 'amber',
          fromAgentName: 'watchdog',
          title: `${e.agentName} silent ${e.stuckMinutes} min`,
          body: e.lastEventType ? `last activity: ${e.lastEventType}` : 'no prior activity',
          rightBadge: 'warning',
        });
        break;
      case 'agent.stuck.intervention':
        if (filterAgentId && e.agentId !== filterAgentId) break;
        items.push({
          key: `stuck-act:${e.agentId}:${e.at}`,
          at: e.at,
          category: 'agents',
          icon: XCircle,
          tone: 'red',
          fromAgentName: 'watchdog',
          title: `${e.agentName} stuck ${e.stuckMinutes} min — auto-cancel`,
          body: e.incidentDocPath ? `incident doc: ${e.incidentDocPath}` : null,
          rightBadge: 'intervention',
        });
        break;
      default:
        // skip noisy deltas, sandbox changes, screenshots, memory updates
        break;
    }
  }
  return items;
}

function summarizeJson(x: unknown, max: number): string {
  if (x === null || x === undefined) return '';
  if (typeof x === 'string') return x.length > max ? x.slice(0, max) + '…' : x;
  try {
    const s = JSON.stringify(x);
    return s.length > max ? s.slice(0, max) + '…' : s;
  } catch {
    return String(x).slice(0, max);
  }
}
