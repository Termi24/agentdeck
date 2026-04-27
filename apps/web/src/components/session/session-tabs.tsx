'use client';
import { CalendarRange, FileText, FlaskConical, MessageCircle, Send, Users, type LucideIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { AgentDeckEvent } from '@agentdeck/shared';
import { useSession } from '@/components/session-context';
import {
  listSessionAgents,
  listSessionDms,
  type DirectMessage,
  type SessionAgent,
} from '@/lib/api';
import { usePollingInterval } from '@/lib/use-polling';
import { AgentDetailSheet } from './agent-detail-sheet';
import { PlanningView } from './planning-view';
import { ACTIVE_STATUSES, LiveDot, relativeTime, statusClasses } from './shared';

interface Doc {
  path: string;
  byAgentId: string;
  at: string;
}

interface TestResult {
  resultId: string;
  suite: string;
  caseName: string;
  status: 'passed' | 'failed' | 'skipped';
  message?: string | null;
  agentId: string;
  at: string;
}

interface ChannelMsg {
  messageId: string;
  fromAgentName: string;
  content: string;
  at: string;
}

export function SessionTabs({ sessionId }: { sessionId: string }) {
  const { events } = useSession();

  const { docs, tests, messages } = useMemo(() => {
    const d = new Map<string, Doc>();
    const t: TestResult[] = [];
    const m: ChannelMsg[] = [];
    for (const e of events as ReadonlyArray<AgentDeckEvent>) {
      if (e.type === 'doc.published' || e.type === 'doc.updated') {
        // last-write-wins per path: republishing a doc keeps it as one entry
        // in the tab listing but bumps `at` so the sort order surfaces it.
        d.set(e.path, { path: e.path, byAgentId: e.byAgentId, at: e.at });
      } else if (e.type === 'test.result.reported') {
        t.push({
          resultId: e.resultId,
          suite: e.suite,
          caseName: e.caseName,
          status: e.status,
          message: e.message ?? null,
          agentId: e.agentId,
          at: e.at,
        });
      } else if (e.type === 'channel.message.posted') {
        m.push({ messageId: e.messageId, fromAgentName: e.fromAgentName, content: e.content, at: e.at });
      }
    }
    return { docs: [...d.values()].sort((a, b) => b.at.localeCompare(a.at)), tests: t, messages: m };
  }, [events]);

  const [agents, setAgents] = useState<SessionAgent[]>([]);
  const [dms, setDms] = useState<DirectMessage[]>([]);
  usePollingInterval(
    async () => {
      try {
        const [a, d] = await Promise.all([
          listSessionAgents(sessionId),
          listSessionDms(sessionId, { limit: 500 }),
        ]);
        setAgents(a);
        setDms(d);
      } catch {
        /* ignore */
      }
    },
    8_000,
    [sessionId],
  );

  const [openDoc, setOpenDoc] = useState<Doc | null>(null);
  const [openTest, setOpenTest] = useState<TestResult | null>(null);
  const [openAgent, setOpenAgent] = useState<SessionAgent | null>(null);

  const planningCount = useMemo(() => {
    let n = 0;
    for (const e of events as ReadonlyArray<AgentDeckEvent>) {
      if (e.type === 'agent.task.planned') n++;
    }
    return n;
  }, [events]);

  const counts = {
    docs: docs.length,
    tests: tests.length,
    channel: messages.length,
    agents: agents.length,
    dms: dms.length,
    planning: planningCount,
  };

  // Controlled value so we can capture/restore scrollY around tab switches.
  // Without this, switching from a tall tab (e.g. Tests with many rows) to a
  // short one (e.g. empty Planning) shrinks page height, the browser clamps
  // scrollY, and the user perceives it as a "scroll to top" jump (FB-08).
  // The min-h on CardContent below holds the page height constant for the
  // common range, this handler covers the residual case.
  const [tab, setTab] = useState('agents');
  const onTabChange = (next: string) => {
    if (typeof window === 'undefined') {
      setTab(next);
      return;
    }
    const y = window.scrollY;
    setTab(next);
    requestAnimationFrame(() => window.scrollTo({ top: y }));
  };

  return (
    <section className="pt-4 pb-6">
      <Card className="glass ring-soft rounded-2xl border-white/10 bg-transparent">
        <Tabs value={tab} onValueChange={onTabChange}>
          <CardHeader className="border-b border-white/10 px-4 py-2.5">
            <CardTitle className="sr-only">Session details</CardTitle>
            <TabsList className="h-9 w-full justify-start gap-1 bg-transparent p-0">
              <TabTrigger value="agents" icon={Users} label="Agents & context" count={counts.agents} />
              <TabTrigger value="planning" icon={CalendarRange} label="Planning" count={counts.planning} />
              <TabTrigger value="dms" icon={Send} label="DMs" count={counts.dms} />
              <TabTrigger value="docs" icon={FileText} label="Docs" count={counts.docs} />
              <TabTrigger value="tests" icon={FlaskConical} label="Tests" count={counts.tests} />
              <TabTrigger value="channel" icon={MessageCircle} label="Channel history" count={counts.channel} />
            </TabsList>
          </CardHeader>

          <CardContent className="min-h-[480px] p-0">
            <TabsContent value="agents" className="m-0">
              {agents.length === 0 ? (
                <EmptyHint text="no agents yet — waiting for the orchestrator to spawn" />
              ) : (
                <ul className="grid gap-2 p-4 md:grid-cols-2 xl:grid-cols-3">
                  {agents.map((a) => (
                    <li key={a.id}>
                      <AgentTile a={a} onOpen={() => setOpenAgent(a)} />
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="planning" className="m-0">
              <PlanningView sessionId={sessionId} />
            </TabsContent>

            <TabsContent value="dms" className="m-0">
              {dms.length === 0 ? (
                <EmptyHint text="no direct messages yet — orchestrator ↔ sub-agents privates will show here" />
              ) : (
                <DmConversations dms={dms} agents={agents} />
              )}
            </TabsContent>

            <TabsContent value="docs" className="m-0">
              {docs.length === 0 ? (
                <EmptyHint text="no docs published yet" />
              ) : (
                <ul className="grid gap-2 p-4 md:grid-cols-2 xl:grid-cols-3">
                  {docs.map((d) => (
                    <li key={d.path}>
                      <button
                        type="button"
                        onClick={() => setOpenDoc(d)}
                        className="group flex w-full items-start gap-2 rounded-2xl border border-white/10 bg-white/5 p-3 text-left text-xs transition-colors hover:border-white/20 hover:bg-white/[0.08]"
                      >
                        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                        <div className="min-w-0 flex-1">
                          <p className="font-mono truncate text-white/85">{d.path}</p>
                          <p className="mt-0.5 text-[10px] text-white/45">
                            by <span className="font-mono">{d.byAgentId.slice(0, 8)}</span> · {relativeTime(d.at)}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="tests" className="m-0">
              {tests.length === 0 ? (
                <EmptyHint text="no test results reported yet" />
              ) : (
                // h-[460px] (not max-h) so the radix viewport gets a resolved
                // height to scroll within. max-h alone left the viewport
                // unconstrained and overflow never triggered (FB-06).
                <ScrollArea className="h-[460px]">
                  <table className="w-full text-[12px]">
                    <thead className="sticky top-0 bg-[#0a0814]/90 text-[10px] uppercase tracking-wider text-white/50 backdrop-blur">
                      <tr className="border-b border-white/10">
                        <th className="px-4 py-2 text-left font-medium">Status</th>
                        <th className="px-4 py-2 text-left font-medium">Suite</th>
                        <th className="px-4 py-2 text-left font-medium">Case</th>
                        <th className="px-4 py-2 text-left font-medium">Message</th>
                        <th className="px-4 py-2 text-right font-medium">When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tests.map((t) => (
                        <tr
                          key={t.resultId}
                          role="button"
                          tabIndex={0}
                          aria-label={`open test result ${t.suite} / ${t.caseName}`}
                          onClick={() => setOpenTest(t)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setOpenTest(t);
                            }
                          }}
                          className="cursor-pointer border-b border-white/5 transition-colors hover:bg-white/5 focus:bg-white/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/50"
                        >
                          <td className="px-4 py-2">
                            <StatusPill status={t.status} />
                          </td>
                          <td className="font-mono px-4 py-2 text-white/85">{t.suite}</td>
                          <td className="px-4 py-2 text-white/85">{t.caseName}</td>
                          <td className="max-w-md px-4 py-2 truncate text-white/55">{t.message ?? '—'}</td>
                          <td className="font-mono px-4 py-2 text-right tabular text-white/55">
                            {relativeTime(t.at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              )}
            </TabsContent>

            <TabsContent value="channel" className="m-0">
              {messages.length === 0 ? (
                <EmptyHint text="no channel messages yet" />
              ) : (
                <ScrollArea className="h-[460px]">
                  <ul className="flex flex-col">
                    {messages.map((m) => (
                      <li key={m.messageId} className="flex items-start gap-3 border-b border-white/5 px-4 py-2 text-xs last:border-0">
                        <span className="font-mono shrink-0 text-[11px] text-white/85">{m.fromAgentName}</span>
                        <span className="flex-1 whitespace-pre-wrap break-words text-white/80">{m.content}</span>
                        <span className="font-mono shrink-0 text-[10px] tabular text-white/45">
                          {relativeTime(m.at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              )}
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>

      <AgentDetailSheet
        sessionId={sessionId}
        agent={openAgent}
        onOpenChange={(o) => !o && setOpenAgent(null)}
      />

      <Sheet open={!!openDoc} onOpenChange={(o) => !o && setOpenDoc(null)}>
        <SheetContent side="right" className="w-[90vw] sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle className="font-mono">{openDoc?.path}</SheetTitle>
            <SheetDescription>
              by <span className="font-mono">{openDoc?.byAgentId.slice(0, 8)}</span> · {relativeTime(openDoc?.at)}
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className="mt-4 h-[calc(100vh-10rem)]">
            <DocContent sessionId={sessionId} path={openDoc?.path ?? null} />
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <Sheet open={!!openTest} onOpenChange={(o) => !o && setOpenTest(null)}>
        <SheetContent side="right" className="w-[90vw] sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{openTest?.caseName}</SheetTitle>
            <SheetDescription className="font-mono">{openTest?.suite}</SheetDescription>
          </SheetHeader>
          {openTest && (
            <div className="mt-4 flex flex-col gap-3 text-xs">
              <div>
                <StatusPill status={openTest.status} />
                <span className="ml-2 text-muted-foreground">{relativeTime(openTest.at)}</span>
              </div>
              {openTest.message && (
                <div>
                  <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Message</p>
                  <p className="whitespace-pre-wrap break-words rounded-md bg-muted/30 p-3 font-mono">
                    {openTest.message}
                  </p>
                </div>
              )}
              <div>
                <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Agent</p>
                <p className="font-mono">{openTest.agentId}</p>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}

function TabTrigger({
  value,
  icon: Icon,
  label,
  count,
}: {
  value: string;
  icon: LucideIcon;
  label: string;
  count: number;
}) {
  return (
    <TabsTrigger
      value={value}
      className="h-8 gap-2 rounded-full border border-transparent bg-transparent px-3 text-[12px] text-white/55 data-[state=active]:border-white/15 data-[state=active]:bg-white/10 data-[state=active]:text-white data-[state=active]:shadow-none"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
      {count > 0 && (
        <span className="font-mono tabular ml-1 rounded-full border border-white/15 bg-white/5 px-1.5 py-0 text-[10px] text-white/70">
          {count}
        </span>
      )}
    </TabsTrigger>
  );
}

function StatusPill({ status }: { status: 'passed' | 'failed' | 'skipped' }) {
  const cls =
    status === 'passed'
      ? 'bg-emerald-400/15 text-emerald-200 border-emerald-300/30'
      : status === 'failed'
        ? 'bg-rose-400/15 text-rose-200 border-rose-300/30'
        : 'bg-amber-400/15 text-amber-200 border-amber-300/30';
  return (
    <Badge variant="outline" className={`rounded-full px-2 py-0 text-[10px] capitalize ${cls}`}>
      {status}
    </Badge>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <p className="p-8 text-center text-[12px] text-white/45">{text}</p>;
}

function AgentTile({ a, onOpen }: { a: SessionAgent; onOpen: () => void }) {
  const active = ACTIVE_STATUSES.includes(a.status);
  const isRoot = a.parentAgentId === null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-4 text-left text-xs transition-colors hover:border-white/20 hover:bg-white/[0.08]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {active && a.runningToolCallCount > 0 ? (
            <LiveDot />
          ) : (
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                active ? 'bg-emerald-300' : a.status === 'failed' ? 'bg-rose-400' : 'bg-white/30'
              }`}
            />
          )}
          <span className="font-mono truncate text-[13px] text-white">{a.name}</span>
        </div>
        <Badge
          variant="outline"
          className={`shrink-0 rounded-full px-2 py-0 text-[10px] ${isRoot ? 'grad-accent border-0 text-white' : statusClasses(a.status)}`}
        >
          {isRoot ? 'orchestrator' : 'sub-agent'}
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-1 text-[10px]">
        {a.role && (
          <Badge variant="outline" className="rounded-full border-white/15 bg-white/5 px-2 py-0 text-[10px] text-white/70">
            {a.role}
          </Badge>
        )}
        <Badge variant="outline" className={`rounded-full px-2 py-0 text-[10px] capitalize ${statusClasses(a.status)}`}>
          {a.status.replace('_', ' ')}
        </Badge>
        {a.model && (
          <span className="font-mono ml-1 text-white/55">{a.model}</span>
        )}
      </div>
      {a.prompt && (
        <p className="line-clamp-2 text-[11px] leading-relaxed text-white/55">
          {a.prompt.slice(0, 200)}
        </p>
      )}
      <div className="flex items-center justify-between border-t border-white/10 pt-2 text-[10px] text-white/45">
        <span className="font-mono tabular flex gap-3">
          <span>✉ {a.dmCount}</span>
          <span>💬 {a.channelMessageCount}</span>
          <span>🔧 {a.toolCallCount}</span>
        </span>
        <span className="text-white/85 opacity-0 transition-opacity group-hover:opacity-100">
          open →
        </span>
      </div>
    </button>
  );
}

function DmConversations({
  dms,
  agents,
}: {
  dms: DirectMessage[];
  agents: SessionAgent[];
}) {
  // Group DMs by "conversation" = unordered pair {from,to}
  const conversations = useMemo(() => {
    const map = new Map<string, { aId: string; bId: string; msgs: DirectMessage[] }>();
    for (const m of dms) {
      const [a, b] = [m.fromAgentId, m.toAgentId].sort();
      const key = `${a}::${b}`;
      const aId = a as string;
      const bId = b as string;
      const entry = map.get(key) ?? { aId, bId, msgs: [] };
      entry.msgs.push(m);
      map.set(key, entry);
    }
    return Array.from(map.values()).sort(
      (x, y) => y.msgs[y.msgs.length - 1]!.createdAt.localeCompare(x.msgs[x.msgs.length - 1]!.createdAt),
    );
  }, [dms]);

  const agentName = (id: string) => {
    const a = agents.find((x) => x.id === id);
    return a ? a.name : id.slice(0, 8);
  };

  const [selectedKey, setSelectedKey] = useState<string | null>(conversations[0] ? `${conversations[0].aId}::${conversations[0].bId}` : null);
  const selected = conversations.find((c) => `${c.aId}::${c.bId}` === selectedKey) ?? conversations[0];

  return (
    <div className="grid gap-0 md:grid-cols-[240px_1fr]">
      <aside className="h-[460px] overflow-y-auto border-r border-white/10">
        {conversations.map((c) => {
          const key = `${c.aId}::${c.bId}`;
          const last = c.msgs[c.msgs.length - 1]!;
          return (
            <button
              type="button"
              key={key}
              onClick={() => setSelectedKey(key)}
              className={`block w-full border-b border-white/5 px-3 py-2 text-left text-xs transition-colors hover:bg-white/5 ${
                selectedKey === key ? 'bg-white/10' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="font-mono truncate text-[11px] text-white/85">
                  {agentName(c.aId)} ↔ {agentName(c.bId)}
                </span>
                <span className="font-mono tabular shrink-0 rounded-full border border-white/15 bg-white/5 px-1.5 py-0 text-[10px] text-white/65">
                  {c.msgs.length}
                </span>
              </div>
              <p className="mt-0.5 line-clamp-1 text-[10px] text-white/45">{last.content}</p>
            </button>
          );
        })}
      </aside>
      <ScrollArea className="h-[460px]">
        {selected ? (
          <ul className="flex flex-col gap-2 p-4">
            {selected.msgs.map((m) => (
              <li
                key={m.id}
                className={`rounded-2xl border p-3 text-xs ${
                  m.fromAgentId === selected.aId
                    ? 'border-white/10 bg-white/5'
                    : 'ml-8 border-violet-300/25 bg-violet-500/10'
                }`}
              >
                <div className="mb-0.5 flex items-center justify-between gap-2 text-[10px] text-white/45">
                  <span className="font-mono text-white/85">{m.fromAgentName}</span>
                  <span className="font-mono tabular">{relativeTime(m.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap break-words text-white/85">{m.content}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-6 text-xs text-white/45">select a conversation</p>
        )}
      </ScrollArea>
    </div>
  );
}

function DocContent({ sessionId, path }: { sessionId: string | null; path: string | null }) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useMemo(() => {
    if (!path || !sessionId) return;
    const url = `${process.env.NEXT_PUBLIC_PROXY_URL ?? 'http://127.0.0.1:4317'}/sessions/${sessionId}/docs/${encodeURIComponent(path)}`;
    fetch(url, { cache: 'no-store' })
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${r.status}`))))
      .then((t) => {
        try {
          const parsed = JSON.parse(t) as { content?: string };
          setContent(parsed.content ?? t);
        } catch {
          setContent(t);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [sessionId, path]);

  if (error) return <p className="text-xs text-red-400">failed to load: {error}</p>;
  if (content === null) return <p className="text-xs text-muted-foreground">loading…</p>;
  return <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">{content}</pre>;
}
