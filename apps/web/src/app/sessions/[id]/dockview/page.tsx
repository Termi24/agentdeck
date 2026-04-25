'use client';
import Link from 'next/link';
import { use, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { DockviewLayout } from '@/components/dockview-layout';
import { SessionProvider, useSession } from '@/components/session-context';
import { UserInputBar } from '@/components/user-input-bar';
import { AwaitingInputBanner } from '@/components/awaiting-input-banner';
import { ReplayScrubber } from '@/components/replay-scrubber';
import { cancelSession } from '@/lib/api';

/**
 * Classic tiling-panels view — kept as a power-user alternative to the
 * primary dashboard at /sessions/[id]. All 9 fixed panels + per-subagent
 * panels remain available here. The dashboard is optimized for observing;
 * this is optimized for having everything open simultaneously.
 */
export default function SessionDockviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <SessionProvider sessionId={id}>
      <DockviewContents sessionId={id} />
    </SessionProvider>
  );
}

function DockviewContents({ sessionId }: { sessionId: string }) {
  const { events, connected } = useSession();

  const rootAgentId = useMemo(() => {
    const spawned = events.find((e) => e.type === 'agent.spawned' && e.parentAgentId === null);
    return spawned && spawned.type === 'agent.spawned' ? spawned.agentId : null;
  }, [events]);

  const projectId = useMemo(() => {
    const started = events.find((e) => e.type === 'session.started');
    return started && started.type === 'session.started' ? started.projectId : 'default';
  }, [events]);

  const sessionEnded = events.some((e) => e.type === 'session.ended');

  return (
    <main className="flex h-screen flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-3">
          <Link href={`/sessions/${sessionId}`} className="text-sm text-muted-foreground hover:text-foreground">
            ← dashboard
          </Link>
          <span className="font-mono text-xs text-muted-foreground">{sessionId.slice(0, 8)}</span>
          <span className="rounded-md bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase text-secondary-foreground">
            {projectId}
          </span>
          <span
            className={`rounded-md px-2 py-0.5 text-[10px] font-medium uppercase ${
              connected ? 'bg-emerald-500/20 text-emerald-200' : 'bg-muted text-muted-foreground'
            }`}
          >
            {connected ? 'live' : 'offline'}
          </span>
          {sessionEnded && (
            <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
              ended
            </span>
          )}
        </div>
        {!sessionEnded && (
          <Button size="sm" variant="outline" onClick={() => cancelSession(sessionId)}>
            Cancel session
          </Button>
        )}
      </header>

      <AwaitingInputBanner />

      <ReplayScrubber />

      <div className="min-h-0 flex-1">
        {rootAgentId ? (
          <DockviewLayout rootAgentId={rootAgentId} projectId={projectId} />
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">Waiting for orchestrator spawn…</p>
          </div>
        )}
      </div>

      <UserInputBar sessionId={sessionId} disabled={sessionEnded} />
    </main>
  );
}
