'use client';
import { FileText, FlaskConical, MessageCircle, Send, Users, type LucideIcon } from 'lucide-react';
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
      if (e.type === 'doc.published') {
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

  const counts = {
    docs: docs.length,
    tests: tests.length,
    channel: messages.length,
    agents: agents.length,
    dms: dms.length,
  };

  return (
    <section className="px-6 pb-6">
      <Card className="border-border/60 bg-card/40">
        <Tabs defaultValue="agents">
          <CardHeader className="border-b border-border/40 px-4 py-2.5">
            <CardTitle className="sr-only">Session details</CardTitle>
            <TabsList className="h-8 w-full justify-start bg-transparent p-0">
              <TabTrigger value="agents" icon={Users} label="Agents & context" count={counts.agents} />
              <TabTrigger value="dms" icon={Send} label="DMs" count={counts.dms} />
              <TabTrigger value="docs" icon={FileText} label="Docs" count={counts.docs} />
              <TabTrigger value="tests" icon={FlaskConical} label="Tests" count={counts.tests} />
              <TabTrigger value="channel" icon={MessageCircle} label="Channel history" count={counts.channel} />
            </TabsList>
          </CardHeader>

          <CardContent className="p-0">
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
                        className="group flex w-full items-start gap-2 rounded-md border border-border/60 bg-muted/20 p-3 text-left text-xs transition-colors hover:border-primary/60"
                      >
                        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-mono text-foreground/90">{d.path}</p>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">
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
                <ScrollArea className="max-h-[400px]">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-card/90 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <tr className="border-b border-border/40">
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
                          className="cursor-pointer border-b border-border/30 transition-colors hover:bg-muted/30 focus:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <td className="px-4 py-2">
                            <StatusPill status={t.status} />
                          </td>
                          <td className="px-4 py-2 font-mono">{t.suite}</td>
                          <td className="px-4 py-2">{t.caseName}</td>
                          <td className="max-w-md px-4 py-2 truncate text-muted-foreground">{t.message ?? '—'}</td>
                          <td className="px-4 py-2 text-right text-muted-foreground tabular-nums">
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
                <ScrollArea className="max-h-[400px]">
                  <ul className="flex flex-col">
                    {messages.map((m) => (
                      <li key={m.messageId} className="flex items-start gap-3 border-b border-border/30 px-4 py-2 text-xs last:border-0">
                        <span className="shrink-0 font-mono text-[11px] text-foreground/90">{m.fromAgentName}</span>
                        <span className="flex-1 whitespace-pre-wrap break-words text-foreground/80">{m.content}</span>
                        <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">
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
      className="h-8 gap-2 rounded-none border-b-2 border-transparent bg-transparent px-3 text-xs data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
      {count > 0 && (
        <Badge variant="outline" className="ml-1 px-1 py-0 text-[9px] text-muted-foreground">
          {count}
        </Badge>
      )}
    </TabsTrigger>
  );
}

function StatusPill({ status }: { status: 'passed' | 'failed' | 'skipped' }) {
  const cls =
    status === 'passed'
      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
      : status === 'failed'
        ? 'bg-red-500/15 text-red-400 border-red-500/30'
        : 'bg-amber-500/15 text-amber-400 border-amber-500/30';
  return (
    <Badge variant="outline" className={`text-[10px] ${cls}`}>
      {status}
    </Badge>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <p className="p-6 text-center text-xs text-muted-foreground">{text}</p>;
}

function AgentTile({ a, onOpen }: { a: SessionAgent; onOpen: () => void }) {
  const active = ACTIVE_STATUSES.includes(a.status);
  const isRoot = a.parentAgentId === null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full flex-col gap-2 rounded-md border border-border/60 bg-muted/10 p-3 text-left text-xs transition-colors hover:border-primary/50 hover:bg-muted/30"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {active && a.runningToolCallCount > 0 ? (
            <LiveDot />
          ) : (
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                active ? 'bg-emerald-500' : a.status === 'failed' ? 'bg-red-500' : 'bg-zinc-600'
              }`}
            />
          )}
          <span className="truncate font-mono text-sm">{a.name}</span>
        </div>
        <Badge
          variant="outline"
          className={`shrink-0 text-[9px] ${isRoot ? 'border-primary/40 text-primary' : statusClasses(a.status)}`}
        >
          {isRoot ? 'orchestrator' : 'sub-agent'}
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-1 text-[10px]">
        {a.role && (
          <Badge variant="outline" className="px-1 py-0 text-[9px]">
            {a.role}
          </Badge>
        )}
        <Badge variant="outline" className={`px-1 py-0 text-[9px] ${statusClasses(a.status)}`}>
          {a.status.replace('_', ' ')}
        </Badge>
        {a.model && (
          <span className="ml-1 font-mono text-muted-foreground">{a.model}</span>
        )}
      </div>
      {a.prompt && (
        <p className="line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">
          {a.prompt.slice(0, 200)}
        </p>
      )}
      <div className="flex items-center justify-between border-t border-border/30 pt-1.5 text-[9px] text-muted-foreground">
        <span className="flex gap-2">
          <span>✉ {a.dmCount}</span>
          <span>💬 {a.channelMessageCount}</span>
          <span>🔧 {a.toolCallCount}</span>
        </span>
        <span className="text-primary opacity-0 transition-opacity group-hover:opacity-100">
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
      <aside className="max-h-[400px] overflow-y-auto border-r border-border/40">
        {conversations.map((c) => {
          const key = `${c.aId}::${c.bId}`;
          const last = c.msgs[c.msgs.length - 1]!;
          return (
            <button
              type="button"
              key={key}
              onClick={() => setSelectedKey(key)}
              className={`block w-full border-b border-border/30 px-3 py-2 text-left text-xs transition-colors hover:bg-muted/30 ${
                selectedKey === key ? 'bg-primary/10' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="truncate font-mono text-[11px]">
                  {agentName(c.aId)} ↔ {agentName(c.bId)}
                </span>
                <Badge variant="outline" className="shrink-0 px-1 py-0 text-[9px]">
                  {c.msgs.length}
                </Badge>
              </div>
              <p className="mt-0.5 line-clamp-1 text-[10px] text-muted-foreground">{last.content}</p>
            </button>
          );
        })}
      </aside>
      <ScrollArea className="max-h-[400px]">
        {selected ? (
          <ul className="flex flex-col gap-1.5 p-4">
            {selected.msgs.map((m) => (
              <li
                key={m.id}
                className={`rounded-md border p-2 text-xs ${
                  m.fromAgentId === selected.aId
                    ? 'border-border/40 bg-muted/10'
                    : 'ml-8 border-primary/30 bg-primary/5'
                }`}
              >
                <div className="mb-0.5 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                  <span className="font-mono text-foreground/80">{m.fromAgentName}</span>
                  <span className="tabular-nums">{relativeTime(m.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap break-words text-foreground/90">{m.content}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-6 text-xs text-muted-foreground">select a conversation</p>
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
