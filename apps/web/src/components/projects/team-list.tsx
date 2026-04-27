'use client';
/**
 * Teams view for the project page (FB-03). The product decision is "1 session
 * = 1 team", read-only. The card lists every session of the project; click
 * opens a side-sheet enumerating the agents (orchestrator + sub-agents) with
 * their full skill / prompt — same `AgentDetailSheet` pattern as the session
 * dashboard's row 3 "Agents & context" tab, just rooted on the project page.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Crown, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  listSessionAgents,
  type SessionAgent,
  type SessionListItem,
} from '@/lib/api';
import { ACTIVE_STATUSES, LiveDot, relativeTime, statusClasses } from '@/components/session/shared';

interface Props {
  projectId: string;
  sessions: SessionListItem[];
}

export function TeamList({ projectId, sessions }: Props) {
  const [openTeamId, setOpenTeamId] = useState<string | null>(null);

  const ordered = useMemo(
    () =>
      [...sessions].sort((a, b) => {
        const la = a.lastActivityAt ?? a.startedAt;
        const lb = b.lastActivityAt ?? b.startedAt;
        return lb.localeCompare(la);
      }),
    [sessions],
  );

  if (sessions.length === 0) return null;

  return (
    <section className="px-6 pb-6">
      <Card className="border-border/60 bg-card/40">
        <CardHeader className="border-b border-border/40 px-4 py-3">
          <CardTitle className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            Teams in {projectId}
            <Badge variant="outline" className="px-1.5 py-0 text-[9px]">
              {sessions.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-border/30">
            {ordered.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setOpenTeamId(s.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-xs transition-colors hover:bg-muted/30"
                >
                  <span className="shrink-0">
                    {ACTIVE_STATUSES.includes(s.status) &&
                    s.lastActivityAt &&
                    Date.now() - new Date(s.lastActivityAt).getTime() < 10_000 ? (
                      <LiveDot />
                    ) : (
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${
                          ACTIVE_STATUSES.includes(s.status)
                            ? 'bg-emerald-500'
                            : s.status === 'failed'
                              ? 'bg-red-500'
                              : 'bg-zinc-600'
                        }`}
                      />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{s.title || s.id.slice(0, 8)}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                      <span>
                        {s.agentCount} agent{s.agentCount === 1 ? '' : 's'}
                        {s.runningAgentCount > 0 && (
                          <span className="text-emerald-400"> · {s.runningAgentCount} running</span>
                        )}
                      </span>
                      <span>started {relativeTime(s.startedAt)}</span>
                      {s.lastActivityAt && (
                        <span>last event {relativeTime(s.lastActivityAt)}</span>
                      )}
                    </p>
                  </div>
                  <Badge variant="outline" className={`shrink-0 text-[9px] ${statusClasses(s.status)}`}>
                    {s.status.replace('_', ' ')}
                  </Badge>
                  <Badge variant="outline" className="shrink-0 text-[9px]">
                    {s.isBridge ? 'CLI' : 'SDK'}
                  </Badge>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <TeamSheet
        sessionId={openTeamId}
        sessionTitle={ordered.find((s) => s.id === openTeamId)?.title ?? null}
        onOpenChange={(o) => !o && setOpenTeamId(null)}
      />
    </section>
  );
}

function TeamSheet({
  sessionId,
  sessionTitle,
  onOpenChange,
}: {
  sessionId: string | null;
  sessionTitle: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [agents, setAgents] = useState<SessionAgent[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setAgents(null);
      setLoadError(null);
      return;
    }
    let cancelled = false;
    setAgents(null);
    setLoadError(null);
    listSessionAgents(sessionId)
      .then((rows) => {
        if (!cancelled) setAgents(rows);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const root = agents?.find((a) => a.parentAgentId === null) ?? null;
  const subs = agents?.filter((a) => a.parentAgentId !== null) ?? [];

  return (
    <Sheet open={!!sessionId} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[90vw] flex-col gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="border-b border-border/40 p-6 pb-4 text-left">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-primary" />
            {sessionTitle || 'Team'}
          </SheetTitle>
          <SheetDescription className="text-xs">
            {sessionId ? (
              <Link
                href={`/sessions/${sessionId}`}
                className="text-muted-foreground hover:text-foreground"
              >
                open session dashboard →
              </Link>
            ) : null}
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1 px-6 py-4">
          {loadError ? (
            <p className="text-xs text-red-400">failed to load agents: {loadError}</p>
          ) : agents === null ? (
            <p className="text-xs text-muted-foreground">loading…</p>
          ) : agents.length === 0 ? (
            <p className="text-xs text-muted-foreground">no agents in this team yet</p>
          ) : (
            <div className="flex flex-col gap-3">
              {root && <TeamMemberCard agent={root} isRoot />}
              {subs.length > 0 && (
                <>
                  <p className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                    Sub-agents ({subs.length})
                  </p>
                  {subs.map((a) => (
                    <TeamMemberCard key={a.id} agent={a} isRoot={false} />
                  ))}
                </>
              )}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function TeamMemberCard({ agent, isRoot }: { agent: SessionAgent; isRoot: boolean }) {
  const active = ACTIVE_STATUSES.includes(agent.status);
  return (
    <div className="rounded-md border border-border/60 bg-muted/10 p-3 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {isRoot ? (
            <Crown className="h-3.5 w-3.5 shrink-0 text-primary" />
          ) : (
            <span className="text-muted-foreground">└─</span>
          )}
          <span className="truncate font-mono text-sm">{agent.name}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {active && <LiveDot />}
          <Badge variant="outline" className={`text-[9px] ${statusClasses(agent.status)}`}>
            {agent.status.replace('_', ' ')}
          </Badge>
          {agent.role && (
            <Badge variant="outline" className="text-[9px]">
              {agent.role}
            </Badge>
          )}
        </div>
      </div>
      {agent.model && (
        <p className="mt-1 font-mono text-[10px] text-muted-foreground">{agent.model}</p>
      )}
      {agent.prompt && (
        <details className="mt-2 text-[11px]">
          <summary className="cursor-pointer text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground">
            instructions ({agent.prompt.length} chars)
          </summary>
          <pre className="mt-2 max-h-[300px] overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/20 p-2 font-mono text-[11px] leading-relaxed text-foreground/80">
            {agent.prompt}
          </pre>
        </details>
      )}
      <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
        <span>🔧 {agent.toolCallCount}</span>
        <span>💬 {agent.channelMessageCount}</span>
        <span>✉ {agent.dmCount}</span>
      </div>
    </div>
  );
}
