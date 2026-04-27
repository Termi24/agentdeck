'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Bug,
  FlaskConical,
  Folder,
  MessageSquare,
  Plug,
  RefreshCw,
  Search,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { ACTIVE_STATUSES, LiveDot, relativeTime, statusClasses } from '@/components/session/shared';
import { getFindingsSummary, listProjects, type FindingsSummary, type ProjectListItem } from '@/lib/api';
import { usePollingInterval } from '@/lib/use-polling';

const LIVE_WINDOW_MS = 10_000;

export default function HubPage() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'past'>('active');

  const [findingsSummary, setFindingsSummary] = useState<FindingsSummary | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [rows, summary] = await Promise.all([
        listProjects(),
        getFindingsSummary().catch(() => null),
      ]);
      setProjects(rows);
      setFindingsSummary(summary);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  usePollingInterval(refresh, 8_000, [refresh]);

  // Tick state to force re-renders every 1 s so relative-time chips + live dot
  // react to the passage of time even when no new project data arrives.
  const [, setTick] = useState(0);
  useEffect(() => {
    const h = setInterval(() => setTick((t) => t + 1), 1_000);
    return () => clearInterval(h);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects.filter((p) => {
      if (statusFilter !== 'all') {
        const isActive = p.activeSessionCount > 0;
        if (statusFilter === 'active' && !isActive) return false;
        if (statusFilter === 'past' && isActive) return false;
      }
      if (q && !p.projectId.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [projects, search, statusFilter]);

  const globalStats = useMemo(() => {
    let activeProjects = 0;
    let totalSessions = 0;
    let activeSessions = 0;
    let runningAgents = 0;
    let runningTools = 0;
    let live = 0;
    for (const p of projects) {
      totalSessions += p.sessionCount;
      activeSessions += p.activeSessionCount;
      runningAgents += p.runningAgentCount;
      runningTools += p.runningToolCallCount;
      if (p.activeSessionCount > 0) activeProjects++;
      const lastMs = p.lastActivityAt ? Date.now() - new Date(p.lastActivityAt).getTime() : Infinity;
      if (p.activeSessionCount > 0 && lastMs < LIVE_WINDOW_MS) live++;
    }
    return { activeProjects, totalSessions, activeSessions, runningAgents, runningTools, live };
  }, [projects]);

  return (
    <main className="flex min-h-screen flex-col">
      <Header findingsOpenHigh={findingsSummary?.openHighSeverity ?? 0} />
      <GlobalKpiBar stats={globalStats} totalProjects={projects.length} />

      <section className="flex flex-wrap items-center gap-2 px-6 py-4">
        <div className="relative min-w-[220px] flex-1 md:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search project…"
            className="h-8 pl-8 text-sm"
          />
        </div>

        <Separator orientation="vertical" className="hidden h-6 md:block" />

        <div className="flex items-center gap-1 rounded-md border border-border/60 p-0.5">
          {(['active', 'past', 'all'] as const).map((k) => (
            <button
              type="button"
              key={k}
              onClick={() => setStatusFilter(k)}
              className={`rounded px-2 py-1 text-xs capitalize transition-colors ${
                statusFilter === k
                  ? 'bg-primary/15 text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {k}
            </button>
          ))}
        </div>

        <div className="ml-auto">
          <Button variant="ghost" size="sm" onClick={() => void refresh()} className="h-8 text-xs">
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </section>

      {loadError && (
        <div className="mx-6 mb-4">
          <Card className="border-red-500/40 bg-red-500/5">
            <CardContent className="py-3 text-sm text-red-400">
              Proxy unreachable: <code className="rounded bg-background/40 px-1 text-xs">{loadError}</code> — is{' '}
              <code>start.cmd</code> / <code>pnpm dev</code> running on port 4317?
            </CardContent>
          </Card>
        </div>
      )}

      <section className="flex-1 px-6 pb-10">
        {filtered.length === 0 ? (
          <EmptyState
            hasProjects={projects.length > 0}
            hasActive={globalStats.activeProjects > 0}
            statusFilter={statusFilter}
          />
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {filtered.length} shown · {projects.length} total
            </p>
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((p) => (
                <ProjectCard key={p.projectId} p={p} />
              ))}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}

function Header({ findingsOpenHigh }: { findingsOpenHigh: number }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border/60 bg-background/80 px-6 backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
          <Plug className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h1 className="text-sm font-semibold leading-tight">agentdeck</h1>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">all projects · cross-project hub</p>
        </div>
      </div>
      <nav className="flex items-center gap-3">
        <Link
          href="/campaigns"
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        >
          <FlaskConical className="h-3.5 w-3.5" />
          QA Campaigns
        </Link>
        <Link
          href="/internal/findings"
          className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
            findingsOpenHigh > 0
              ? 'border border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
              : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
          }`}
          title={
            findingsOpenHigh > 0
              ? `${findingsOpenHigh} open critical/error finding${findingsOpenHigh > 1 ? 's' : ''}`
              : 'agentdeck self-bug-tracker'
          }
        >
          <Bug className="h-3.5 w-3.5" />
          Findings
          {findingsOpenHigh > 0 && (
            <span className="rounded-full bg-amber-500/30 px-1.5 text-[9px] tabular-nums">
              {findingsOpenHigh}
            </span>
          )}
        </Link>
      </nav>
    </header>
  );
}

function GlobalKpiBar({
  stats,
  totalProjects,
}: {
  stats: {
    activeProjects: number;
    totalSessions: number;
    activeSessions: number;
    runningAgents: number;
    runningTools: number;
    live: number;
  };
  totalProjects: number;
}) {
  return (
    <section className="grid grid-cols-2 gap-3 px-6 pt-4 md:grid-cols-4">
      <GlobalKpi
        icon={Folder}
        label="active projects"
        value={stats.activeProjects}
        suffix={`/${totalProjects} total`}
        highlight={stats.activeProjects > 0}
      />
      <GlobalKpi
        icon={Plug}
        label="active sessions"
        value={stats.activeSessions}
        suffix={`/${stats.totalSessions} total`}
        highlight={stats.activeSessions > 0}
      />
      <GlobalKpi
        icon={Wrench}
        label="tool calls running"
        value={stats.runningTools}
        highlight={stats.runningTools > 0}
      />
      <GlobalKpi
        icon={Activity}
        label="live right now"
        value={stats.live}
        suffix={`last ${LIVE_WINDOW_MS / 1000}s`}
        highlight={stats.live > 0}
        showLiveDot={stats.live > 0}
      />
    </section>
  );
}

function GlobalKpi({
  icon: Icon,
  label,
  value,
  suffix,
  highlight,
  showLiveDot,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  suffix?: string;
  highlight?: boolean;
  showLiveDot?: boolean;
}) {
  return (
    <Card className="border-border/60 bg-card/40">
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border ${
            highlight
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              : 'border-border/60 bg-muted/20 text-muted-foreground'
          }`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex min-w-0 flex-col">
          <div className="flex items-baseline gap-2">
            <span
              className={`text-2xl font-semibold tabular-nums ${
                highlight ? 'text-emerald-400' : 'text-foreground'
              }`}
            >
              {value}
            </span>
            {showLiveDot && <LiveDot />}
            {suffix && <span className="text-[10px] text-muted-foreground">{suffix}</span>}
          </div>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function ProjectCard({ p }: { p: ProjectListItem }) {
  const isActive = p.activeSessionCount > 0;
  const lastActivityMs = p.lastActivityAt ? Date.now() - new Date(p.lastActivityAt).getTime() : Infinity;
  const isLive = isActive && lastActivityMs < LIVE_WINDOW_MS;

  // Single-session projects: clicking the card jumps straight to the session
  // dashboard. Multi-session: jumps to /projects/[id] which lists them.
  const primaryHref = (
    p.sessionCount === 1 && p.latestSessionId
      ? `/sessions/${p.latestSessionId}`
      : `/projects/${encodeURIComponent(p.projectId)}`
  ) as never;

  return (
    <li>
      <Card
        className={`flex h-full flex-col overflow-hidden border-border/60 bg-card/40 transition-colors ${
          isLive ? 'ring-1 ring-emerald-500/20' : ''
        }`}
      >
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <Link
              href={primaryHref}
              className="flex min-w-0 flex-1 items-center gap-2 hover:underline"
            >
              <Folder className={`h-4 w-4 shrink-0 ${isLive ? 'text-emerald-400' : 'text-muted-foreground'}`} />
              {isLive && <LiveDot />}
              <CardTitle className="line-clamp-1 text-sm font-medium font-mono">
                {p.projectId}
              </CardTitle>
            </Link>
            {p.latestStatus && (
              <Badge variant="outline" className={`text-[10px] ${statusClasses(p.latestStatus)}`}>
                {p.latestStatus.replace('_', ' ')}
              </Badge>
            )}
          </div>
          <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
            <span>
              {p.sessionCount} session{p.sessionCount !== 1 ? 's' : ''}
              {p.activeSessionCount > 0 && (
                <span className="text-emerald-400"> · {p.activeSessionCount} active</span>
              )}
            </span>
            {p.startedAt && <span>first {relativeTime(p.startedAt)}</span>}
            {p.lastActivityAt && (
              <span className={isLive ? 'text-emerald-400' : 'text-muted-foreground'}>
                last event {relativeTime(p.lastActivityAt)}
              </span>
            )}
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-1 flex-col gap-3 pt-0">
          <div className="grid grid-cols-4 gap-1.5">
            <MicroStat
              icon={Users}
              value={p.runningAgentCount}
              total={p.agentCount}
              label="agents"
              highlight={p.runningAgentCount > 0}
            />
            <MicroStat
              icon={Wrench}
              value={p.runningToolCallCount}
              total={p.toolCallCount}
              label="tools"
              highlight={p.runningToolCallCount > 0}
            />
            <MicroStat icon={FlaskConical} value={p.testResultCount} label="tests" />
            <MicroStat icon={Plug} value={p.activeSessionCount} total={p.sessionCount} label="sess" highlight={p.activeSessionCount > 0} />
          </div>

          {p.lastChannelMessage && (
            <div className="rounded-md border border-border/40 bg-muted/20 p-2 text-xs">
              <div className="mb-0.5 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                <span className="font-mono">
                  <MessageSquare className="mr-1 inline h-2.5 w-2.5" />
                  {p.lastChannelMessage.fromAgentName}
                </span>
                <span>{relativeTime(p.lastChannelMessage.at)}</span>
              </div>
              <p className="line-clamp-2 text-foreground/80">{p.lastChannelMessage.content}</p>
            </div>
          )}

          {p.latestSessionTitle && p.sessionCount > 1 && (
            <div className="text-[11px] text-muted-foreground">
              latest: <span className="text-foreground/80">{p.latestSessionTitle}</span>
            </div>
          )}

          <div className="mt-auto flex items-center justify-between border-t border-border/30 pt-2">
            <span className="text-[10px] text-muted-foreground">
              {(p.totalTokensIn + p.totalTokensOut).toLocaleString()} tok
            </span>
            <Link
              href={`/projects/${encodeURIComponent(p.projectId)}`}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              open project →
            </Link>
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

function MicroStat({
  icon: Icon,
  value,
  total,
  label,
  highlight,
}: {
  icon: LucideIcon;
  value: number;
  total?: number;
  label: string;
  highlight?: boolean;
}) {
  const display = total !== undefined && total !== value ? `${value}/${total}` : `${value}`;
  return (
    <div
      className={`flex flex-col items-center justify-center gap-0.5 rounded-md border px-2 py-1.5 ${
        highlight ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border/40 bg-muted/10'
      }`}
    >
      <div className="flex items-center gap-1">
        <Icon className={`h-3 w-3 ${highlight ? 'text-emerald-400' : 'text-muted-foreground'}`} />
        <span
          className={`text-xs font-semibold tabular-nums ${
            highlight ? 'text-emerald-400' : value > 0 ? 'text-foreground' : 'text-muted-foreground'
          }`}
        >
          {display}
        </span>
      </div>
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
  );
}

function EmptyState({
  hasProjects,
  hasActive,
  statusFilter,
}: {
  hasProjects: boolean;
  hasActive: boolean;
  statusFilter: 'all' | 'active' | 'past';
}) {
  return (
    <Card className="border-dashed border-border/60 bg-transparent">
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/30">
          <Folder className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium">
            {!hasProjects
              ? 'No project yet'
              : statusFilter === 'active' && !hasActive
                ? 'No active project'
                : 'Nothing matches your filters'}
          </p>
          <p className="mt-1 max-w-md text-xs text-muted-foreground">
            {!hasProjects
              ? 'Every time a Claude CLI invokes an agentdeck MCP tool, or an SDK session is started, the project appears here. Sessions of the same projectId collapse into one card.'
              : statusFilter === 'active' && !hasActive
                ? 'Open a Claude CLI or start an SDK session to see a live project.'
                : 'Try a different status filter or clear the search.'}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
