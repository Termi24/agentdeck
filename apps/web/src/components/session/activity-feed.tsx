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

type Filter = 'all' | 'channel' | 'tools' | 'docs' | 'tests' | 'agents';

interface FeedItem {
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

const TONE_CLASSES: Record<FeedItem['tone'], string> = {
  blue: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
  purple: 'bg-violet-500/10 text-violet-400 border-violet-500/30',
  emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  amber: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  red: 'bg-red-500/10 text-red-400 border-red-500/30',
  slate: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/30',
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
    <Card className="flex h-full flex-col overflow-hidden border-border/60 bg-card/40">
      <CardHeader className="space-y-2 border-b border-border/40 px-4 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Activity ({visible.length}
            {visible.length !== items.length && `/${items.length}`})
          </h2>
          {agentFilterId && (
            <button
              type="button"
              className="text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              onClick={onClearAgentFilter}
            >
              filter: {agentFilterName ?? agentFilterId.slice(0, 6)} ×
            </button>
          )}
        </div>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList className="h-7 w-full justify-start bg-transparent p-0">
            {(['all', 'channel', 'tools', 'docs', 'tests', 'agents'] as const).map((f) => (
              <TabsTrigger
                key={f}
                value={f}
                className="h-7 rounded-none border-b-2 border-transparent bg-transparent px-2 text-[11px] data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
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
              <div className="p-6 text-center text-xs text-muted-foreground">
                no activity yet — waiting for events…
              </div>
            ) : (
              visible.map((it) => <FeedRow key={it.key} item={it} />)
            )}
          </div>
        </ScrollArea>
        {!autoScroll && newSinceScroll > 0 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
            <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" onClick={jumpToLatest}>
              <ChevronDown className="h-3.5 w-3.5" />
              {newSinceScroll} new
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FeedRow({ item }: { item: FeedItem }) {
  const Icon = item.icon;
  return (
    <div className="flex items-start gap-3 border-b border-border/30 px-4 py-2.5 text-xs animate-in fade-in-0 slide-in-from-bottom-1 duration-150 last:border-0">
      <div
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${TONE_CLASSES[item.tone]}`}
      >
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-baseline gap-2">
          {item.fromAgentName && <span className="shrink-0 font-mono text-[11px] text-foreground/90">{item.fromAgentName}</span>}
          <span className="truncate text-foreground/70">{item.title}</span>
          <span className="ml-auto shrink-0 tabular-nums text-[10px] text-muted-foreground">{relativeTime(item.at)}</span>
        </div>
        {item.body && <p className="whitespace-pre-wrap break-words text-foreground/80">{item.body}</p>}
        {item.rightBadge && (
          <div className="mt-1">
            <Badge variant="outline" className="text-[10px] text-muted-foreground">
              {item.rightBadge}
            </Badge>
          </div>
        )}
      </div>
    </div>
  );
}

function foldEvents(events: ReadonlyArray<AgentDeckEvent>, filterAgentId: string | null): FeedItem[] {
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
