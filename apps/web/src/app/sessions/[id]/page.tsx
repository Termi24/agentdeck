'use client';
import Link from 'next/link';
import { ArrowLeft, PlugZap } from 'lucide-react';
import { use, useCallback, useMemo, useState } from 'react';
import type { AgentDeckEvent } from '@agentdeck/shared';
import { SessionProvider, useSession } from '@/components/session-context';
import { UserInputBar } from '@/components/user-input-bar';
import { AwaitingInputBanner } from '@/components/awaiting-input-banner';
import { ReplayScrubber } from '@/components/replay-scrubber';
import { SessionHeader } from '@/components/session/session-header';
import { KpiStrip } from '@/components/session/kpi-strip';
import { AgentTree } from '@/components/session/agent-tree';
import { ActivityFeed } from '@/components/session/activity-feed';
import {
  ActivityFeedVirtualized,
  VIRTUALIZE_THRESHOLD,
} from '@/components/session/activity-feed-virtualized';
import { SessionTabs } from '@/components/session/session-tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getSession, listSessionAgents, type SessionAgent, type SessionListItem } from '@/lib/api';
import { usePollingInterval } from '@/lib/use-polling';

type LoadState = 'loading' | 'found' | 'missing';

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <SessionProvider sessionId={id}>
      <SessionDashboard sessionId={id} />
    </SessionProvider>
  );
}

function SessionDashboard({ sessionId }: { sessionId: string }) {
  const { events } = useSession();
  const [session, setSession] = useState<SessionListItem | null>(null);
  const [agents, setAgents] = useState<SessionAgent[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  // Poll the REST aggregates — the Socket.IO stream fires deltas but not the
  // pre-computed counts, so we refresh the header + KPI strip here. Pauses
  // automatically when the tab is hidden (Page Visibility API).
  usePollingInterval(
    async () => {
      try {
        const [s, a] = await Promise.all([getSession(sessionId), listSessionAgents(sessionId)]);
        if (s === null) {
          setLoadState('missing');
          setSession(null);
          setAgents([]);
          return;
        }
        setSession(s);
        setAgents(a);
        setLoadState('found');
      } catch (err) {
        // Differentiate "session was deleted" (Promise.all reject from a 404
        // bubble or a 410 Gone, e.g. when listSessionAgents fires before
        // getSession returns null) from generic network errors. The former
        // needs to swap the dashboard to the SessionNotFound view so polling
        // stops; the latter is a transient proxy outage where we keep the
        // last snapshot.
        const msg = err instanceof Error ? err.message : String(err);
        if (/(404|410)/.test(msg)) {
          setLoadState('missing');
        }
      }
    },
    8_000,
    [sessionId],
  );

  // Whether the session just pushed an event within the last 5 s — powers the
  // live dot in the header and is also surfaced as the "last event" chip.
  const lastActivityMs = session?.lastActivityAt
    ? Date.now() - new Date(session.lastActivityAt).getTime()
    : Infinity;
  const isActive =
    session?.status === 'running' || session?.status === 'waiting_tool' || session?.status === 'pending';
  const isLive = isActive && lastActivityMs < 5_000;

  // Test result breakdown for the KPI strip — folded live from the event stream.
  const testBreakdown = useMemo(() => {
    const b = { passed: 0, failed: 0, skipped: 0 };
    for (const e of events as ReadonlyArray<AgentDeckEvent>) {
      if (e.type !== 'test.result.reported') continue;
      if (e.status === 'passed') b.passed++;
      else if (e.status === 'failed') b.failed++;
      else b.skipped++;
    }
    return b;
  }, [events]);

  // Planning breakdown — same fold pattern. Surfaces task progression at the
  // top of the dashboard so users notice the Planning surface even before
  // drilling into the bottom tabs (FB-02).
  const planningBreakdown = useMemo(() => {
    const status = new Map<string, 'planned' | 'in_progress' | 'completed' | 'blocked' | 'cancelled'>();
    for (const e of events as ReadonlyArray<AgentDeckEvent>) {
      if (e.type === 'agent.task.planned') status.set(e.taskId, 'planned');
      else if (e.type === 'agent.task.started') status.set(e.taskId, 'in_progress');
      else if (e.type === 'agent.task.progressed') {
        if (e.status) status.set(e.taskId, e.status);
      } else if (e.type === 'agent.task.completed') {
        status.set(e.taskId, e.status ?? 'completed');
      }
    }
    const b = { planned: 0, inProgress: 0, completed: 0, blocked: 0 };
    for (const s of status.values()) {
      if (s === 'planned') b.planned++;
      else if (s === 'in_progress') b.inProgress++;
      else if (s === 'completed') b.completed++;
      else if (s === 'blocked') b.blocked++;
    }
    return b;
  }, [events]);

  const sessionEnded = session?.status === 'completed' || session?.status === 'failed' || session?.status === 'cancelled';
  const selectedAgentName = useMemo(() => {
    if (!selectedAgentId) return null;
    return agents.find((a) => a.id === selectedAgentId)?.name ?? null;
  }, [agents, selectedAgentId]);

  const clearFilter = useCallback(() => setSelectedAgentId(null), []);

  // ActivityFeed virtualization — auto-switch above VIRTUALIZE_THRESHOLD or
  // explicitly via ?virtualize=1 / ?virtualize=0 URL param (override). The
  // virtualized variant uses react-window v2 with useDynamicRowHeight, the
  // non-virtualized variant keeps the simpler scroll-area path. Both share
  // foldEvents + FeedRow exports so the rendered output is identical.
  const useVirtualizedFeed = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const param = new URLSearchParams(window.location.search).get('virtualize');
    if (param === '1') return true;
    if (param === '0') return false;
    return events.length >= VIRTUALIZE_THRESHOLD;
  }, [events.length]);

  // IMPORTANT: keep this early-return AFTER every hook above so React never
  // sees a different hook count between renders. Triggering on `missing`
  // swaps the whole rendered tree to the 404 view.
  if (loadState === 'missing') {
    return <SessionNotFound sessionId={sessionId} />;
  }

  return (
    <main className="flex min-h-screen flex-col">
      <SessionHeader
        session={session}
        sessionId={sessionId}
        isLive={isLive}
        lastActivityMs={lastActivityMs}
      />

      <AwaitingInputBanner />

      <ReplayScrubber />

      <KpiStrip
        session={session}
        testBreakdown={testBreakdown}
        planningBreakdown={planningBreakdown}
      />

      {/* Main pair — agents tree | activity feed.
          The legacy "Running tools" side panel was removed (FB-04): the same
          info is already surfaced as runningToolCallCount in the KPI strip
          and as live tool_call events in the activity feed itself. */}
      <section className="grid grid-cols-12 gap-4 px-6 pt-4" style={{ minHeight: '520px' }}>
        <div className="col-span-12 md:col-span-3 md:h-[520px]">
          <AgentTree
            sessionId={sessionId}
            selectedAgentId={selectedAgentId}
            onSelect={setSelectedAgentId}
          />
        </div>
        <div className="col-span-12 md:col-span-9 md:h-[520px]">
          {useVirtualizedFeed ? (
            <ActivityFeedVirtualized
              agentFilterId={selectedAgentId}
              agentFilterName={selectedAgentName}
              onClearAgentFilter={clearFilter}
            />
          ) : (
            <ActivityFeed
              agentFilterId={selectedAgentId}
              agentFilterName={selectedAgentName}
              onClearAgentFilter={clearFilter}
            />
          )}
        </div>
      </section>

      <SessionTabs sessionId={sessionId} />

      <div className="sticky bottom-0 z-10 border-t border-border/60 bg-background/80 backdrop-blur">
        <UserInputBar sessionId={sessionId} disabled={sessionEnded} />
      </div>
    </main>
  );
}

function SessionNotFound({ sessionId }: { sessionId: string }) {
  return (
    <main className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border/60 bg-background/80 px-6 backdrop-blur">
        <Link
          href="/"
          aria-label="Back to hub"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          hub
        </Link>
      </header>
      <section className="flex flex-1 items-center justify-center p-6">
        <Card className="max-w-lg border-border/60 bg-card/40">
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/30">
              <PlugZap className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <h1 className="text-base font-semibold">Session not found</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                No session with id{' '}
                <code className="rounded bg-muted/40 px-1 py-0.5 font-mono text-xs">
                  {sessionId.slice(0, 8)}…{sessionId.slice(-4)}
                </code>{' '}
                exists on this proxy.
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                Common causes: the UUID in the URL is truncated or copied from a different host, or the
                session was deleted. Check the hub for the current list of sessions.
              </p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/">
                <ArrowLeft className="mr-1 h-3.5 w-3.5" />
                Back to hub
              </Link>
            </Button>
            <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">{sessionId}</p>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
