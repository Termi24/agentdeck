'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Bug,
  ChevronDown,
  FlaskConical,
  Folder,
  MessageSquare,
  Plug,
  Plus,
  RefreshCw,
  Search,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  ACTIVE_STATUSES,
  LiveDot,
  relativeTime,
  statusClasses,
  statusDotClass,
  statusGlow,
} from '@/components/session/shared';
import { TeamList } from '@/components/projects/team-list';
import {
  getFindingsSummary,
  listProjectSessions,
  listProjects,
  type FindingsSummary,
  type ProjectListItem,
  type SessionListItem,
} from '@/lib/api';
import { usePollingInterval } from '@/lib/use-polling';
import { cn } from '@/lib/utils';

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
    <main className="mx-auto flex min-h-screen max-w-[1400px] flex-col px-6">
      <Header findingsOpenHigh={findingsSummary?.openHighSeverity ?? 0} liveCount={globalStats.live} />

      <Hero live={globalStats.live} />

      <GlobalKpiBar stats={globalStats} totalProjects={projects.length} />

      <Toolbar
        search={search}
        onSearch={setSearch}
        statusFilter={statusFilter}
        onStatusFilter={setStatusFilter}
        onRefresh={() => void refresh()}
      />

      {loadError && (
        <div className="mb-4">
          <Card className="glass ring-soft border-rose-300/30 bg-rose-500/5">
            <CardContent className="py-3 text-sm text-rose-200">
              Proxy unreachable: <code className="rounded bg-black/30 px-1 text-xs">{loadError}</code> — is{' '}
              <code>start.cmd</code> / <code>pnpm dev</code> running on port 4317?
            </CardContent>
          </Card>
        </div>
      )}

      <section className="flex-1 pb-12">
        {filtered.length === 0 ? (
          <EmptyState
            hasProjects={projects.length > 0}
            hasActive={globalStats.activeProjects > 0}
            statusFilter={statusFilter}
          />
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-[11px] uppercase tracking-wider text-white/45">
              {filtered.length} shown · {projects.length} total
            </p>
            <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((p) => (
                <ProjectCard key={p.projectId} p={p} autoExpandTeams={projects.length === 1} />
              ))}
            </ul>
          </div>
        )}
      </section>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/*  Header                                                                     */
/* -------------------------------------------------------------------------- */

function Header({ findingsOpenHigh, liveCount }: { findingsOpenHigh: number; liveCount: number }) {
  return (
    <header className="sticky top-0 z-30 -mx-6 px-6 pt-5">
      <div className="glass ring-soft flex h-14 items-center gap-3 rounded-2xl border border-white/10 px-4">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="grad-accent grid size-7 place-items-center rounded-lg shadow-soft-pop">
            <Plug className="size-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-[15px] font-semibold tracking-tight">agentdeck</span>
          <span className="font-mono rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10.5px] text-white/60">
            v0.0.8
          </span>
        </Link>

        <nav className="ml-3 flex items-center gap-1">
          <Link
            href="/"
            className="grid h-8 place-items-center rounded-lg border border-white/10 bg-white/10 px-3 text-[13px]"
          >
            Hub
          </Link>
          <Link
            href="/campaigns"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] text-white/70 transition-colors hover:bg-white/5 hover:text-white"
          >
            <FlaskConical className="size-3.5" />
            <span>Campaigns</span>
          </Link>
        </nav>

        <div className="flex-1" />

        {liveCount > 0 && (
          <div className="hidden items-center gap-1.5 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2.5 py-1 text-[11.5px] text-emerald-200 md:flex">
            <span className="pulse-dot size-1.5 rounded-full bg-emerald-300" aria-hidden />
            <span className="font-mono tabular">live · {liveCount}</span>
          </div>
        )}

        <Link
          href="/internal/findings"
          className={cn(
            'flex h-8 items-center gap-2 rounded-full border px-2.5 text-[12.5px] transition-colors',
            findingsOpenHigh > 0
              ? 'border-amber-300/40 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20'
              : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white',
          )}
          title={
            findingsOpenHigh > 0
              ? `${findingsOpenHigh} open critical/error finding${findingsOpenHigh > 1 ? 's' : ''}`
              : 'agentdeck self-bug-tracker'
          }
        >
          {findingsOpenHigh > 0 && (
            <span className="pulse-dot size-1.5 rounded-full bg-amber-300" aria-hidden />
          )}
          <Bug className="size-3.5" />
          <span>Findings</span>
          {findingsOpenHigh > 0 && (
            <span className="font-mono rounded-full bg-amber-300/30 px-1.5 text-[11px] tabular text-amber-100">
              {findingsOpenHigh}
            </span>
          )}
        </Link>

        <Button
          variant="default"
          size="sm"
          className="grad-accent h-8 rounded-full border-0 px-3.5 text-[13px] font-medium text-white shadow-soft-pop hover:opacity-95"
          asChild
        >
          <Link href="/campaigns">
            <Plus className="size-3.5" />
            New session
          </Link>
        </Button>
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/*  Hero                                                                       */
/* -------------------------------------------------------------------------- */

function Hero({ live }: { live: number }) {
  return (
    <div className="flex items-end justify-between pt-10 pb-8">
      <div>
        <div className="mb-2 flex items-center gap-2 text-[12.5px] text-white/60">
          <span
            className={cn(
              'size-2 rounded-full',
              live > 0 ? 'pulse-dot bg-emerald-300' : 'bg-white/30',
            )}
            aria-hidden
          />
          <span className="font-mono tabular">
            {live > 0 ? `live · ${live} project${live > 1 ? 's' : ''} streaming` : 'idle · waiting for sessions'}
          </span>
        </div>
        <h1 className="text-[34px] font-semibold leading-tight tracking-tight">
          Watch your agents <span className="grad-text">think, talk, test.</span>
        </h1>
        <p className="mt-2 max-w-xl text-[14px] text-white/60">
          A real-time mission deck for every Claude SDK orchestrator and CLI bridge running on your machine.
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Global KPI bar                                                             */
/* -------------------------------------------------------------------------- */

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
    <section className="grid grid-cols-2 gap-3 pb-8 md:grid-cols-4">
      <GlobalKpi
        icon={Folder}
        label="active projects"
        value={stats.activeProjects}
        suffix={`/ ${totalProjects} total`}
        tone="violet"
      />
      <GlobalKpi
        icon={Plug}
        label="active sessions"
        value={stats.activeSessions}
        suffix={`/ ${stats.totalSessions} total`}
        tone="pink"
      />
      <GlobalKpi
        icon={Wrench}
        label="tool calls running"
        value={stats.runningTools}
        suffix={stats.runningAgents > 0 ? `${stats.runningAgents} agents` : undefined}
        tone="cyan"
      />
      <GlobalKpi
        icon={Activity}
        label="live right now"
        value={stats.live}
        suffix={`last ${LIVE_WINDOW_MS / 1000}s`}
        tone="emerald"
        showLiveDot={stats.live > 0}
      />
    </section>
  );
}

const TONE_ORB: Record<string, string> = {
  violet: 'bg-violet-500/15',
  pink: 'bg-pink-500/15',
  cyan: 'bg-cyan-400/15',
  emerald: 'bg-emerald-400/15',
};

const TONE_VALUE: Record<string, string> = {
  violet: 'text-white',
  pink: 'text-white',
  cyan: 'text-white',
  emerald: 'text-emerald-200',
};

function GlobalKpi({
  icon: Icon,
  label,
  value,
  suffix,
  tone,
  showLiveDot,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  suffix?: string;
  tone: 'violet' | 'pink' | 'cyan' | 'emerald';
  showLiveDot?: boolean;
}) {
  return (
    <div className="glass ring-soft relative overflow-hidden rounded-2xl border border-white/10 p-4">
      <div className={cn('absolute -right-6 -top-6 size-24 rounded-full blur-2xl', TONE_ORB[tone])} aria-hidden />
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/55">
        <Icon className="size-3.5" />
        <span>{label}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <div className={cn('font-mono tabular text-[30px] font-semibold leading-none tracking-tight', TONE_VALUE[tone])}>
          {value.toString().padStart(2, '0')}
        </div>
        {showLiveDot && <LiveDot />}
        {suffix && <span className="font-mono tabular text-[11px] text-white/45">{suffix}</span>}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Toolbar                                                                    */
/* -------------------------------------------------------------------------- */

function Toolbar({
  search,
  onSearch,
  statusFilter,
  onStatusFilter,
  onRefresh,
}: {
  search: string;
  onSearch: (v: string) => void;
  statusFilter: 'all' | 'active' | 'past';
  onStatusFilter: (v: 'all' | 'active' | 'past') => void;
  onRefresh: () => void;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <div className="glass ring-soft flex h-10 w-full items-center gap-2 rounded-full border border-white/10 px-3 sm:w-80">
        <Search className="size-4 text-white/50" />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Find a project, session, agent…"
          className="flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-white/40"
        />
        <kbd className="font-mono rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] text-white/50">⌘K</kbd>
      </div>

      <div className="glass ring-soft flex h-10 items-center rounded-full border border-white/10 p-1">
        {(['active', 'past', 'all'] as const).map((k) => (
          <button
            type="button"
            key={k}
            onClick={() => onStatusFilter(k)}
            className={cn(
              'h-8 rounded-full px-3.5 text-[12.5px] capitalize transition-colors',
              statusFilter === k ? 'grad-accent text-white' : 'text-white/70 hover:text-white',
            )}
          >
            {k}
          </button>
        ))}
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={onRefresh}
        className="ml-auto h-10 rounded-full px-3 text-[12.5px] text-white/70 hover:bg-white/5 hover:text-white"
      >
        <RefreshCw className="mr-1.5 size-3.5" />
        Refresh
      </Button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Project card                                                               */
/* -------------------------------------------------------------------------- */

function ProjectCard({ p, autoExpandTeams }: { p: ProjectListItem; autoExpandTeams: boolean }) {
  const isActive = p.activeSessionCount > 0;
  const lastActivityMs = p.lastActivityAt ? Date.now() - new Date(p.lastActivityAt).getTime() : Infinity;
  const isLive = isActive && lastActivityMs < LIVE_WINDOW_MS;
  const status = p.latestStatus;
  const isStatusActive = status ? ACTIVE_STATUSES.includes(status) : false;

  // Two-page model: hub + session. Clicking a project card always jumps to
  // its latest session dashboard. Earlier sessions of the same project remain
  // reachable via the inline Teams expander below.
  const primaryHref = (p.latestSessionId ? `/sessions/${p.latestSessionId}` : '/') as never;

  const totalTokens = p.totalTokensIn + p.totalTokensOut;
  const showTeamsToggle = p.sessionCount > 0;

  // Expand state — auto-expand when this is the only project (so single-CLI
  // users see the team rows immediately). Multi-project mode defaults to
  // collapsed for hub density.
  const [expanded, setExpanded] = useState(autoExpandTeams);
  const [sessions, setSessions] = useState<SessionListItem[] | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  // Re-sync expand state if the user goes from N>1 projects back to a single
  // project (or vice-versa) without remounting.
  useEffect(() => {
    setExpanded(autoExpandTeams);
  }, [autoExpandTeams]);

  // Lazy fetch the project's sessions on first expand. Re-poll while expanded
  // so live status dots stay fresh on the embedded TeamList rows.
  useEffect(() => {
    if (!expanded || !showTeamsToggle) return;
    let cancelled = false;
    const load = async () => {
      try {
        const rows = await listProjectSessions(p.projectId);
        if (!cancelled) setSessions(rows);
      } catch {
        if (!cancelled && sessions === null) setSessions([]);
      }
    };
    if (sessions === null) setSessionsLoading(true);
    void load().finally(() => {
      if (!cancelled) setSessionsLoading(false);
    });
    const id = setInterval(load, 8_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [expanded, p.projectId, showTeamsToggle, sessions]);

  return (
    <li>
      <article
        className={cn(
          'glass ring-soft relative h-full overflow-hidden rounded-2xl border border-white/10 transition-all',
          'hover:border-white/20',
          status && isLive && statusGlow(status, true),
        )}
      >
        {/* ambient orb */}
        <div
          className={cn(
            'pointer-events-none absolute -right-12 -top-12 size-40 rounded-full blur-3xl',
            isLive ? 'bg-emerald-500/15' : 'bg-violet-500/10',
          )}
          aria-hidden
        />

        {/* Top zone — clicks navigate to session/project page */}
        <Link href={primaryHref} className="group block p-5">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="mb-1.5 flex items-center gap-2 text-[11.5px] text-white/55">
                <Folder className="size-3.5" />
                <span className="font-mono truncate">{p.projectId}</span>
              </div>
              <h3 className="truncate text-[15px] font-medium leading-tight">
                {p.latestSessionTitle || `${p.sessionCount} session${p.sessionCount > 1 ? 's' : ''}`}
              </h3>
            </div>
            {status && (
              <span
                className={cn(
                  'flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2 text-[11px]',
                  statusClasses(status),
                )}
              >
                {isStatusActive && (
                  <span className={cn('pulse-dot size-1.5 rounded-full', statusDotClass(status))} aria-hidden />
                )}
                {status.replace('_', ' ')}
              </span>
            )}
          </div>

          <div className="mt-5 grid grid-cols-4 gap-3">
            <MicroStat icon={Users} value={p.runningAgentCount} total={p.agentCount} label="agents" highlight={p.runningAgentCount > 0} />
            <MicroStat icon={Wrench} value={p.runningToolCallCount} total={p.toolCallCount} label="tools" highlight={p.runningToolCallCount > 0} />
            <MicroStat icon={FlaskConical} value={p.testResultCount} label="tests" />
            <MicroStat icon={Plug} value={p.activeSessionCount} total={p.sessionCount} label="sess" highlight={p.activeSessionCount > 0} />
          </div>

          {p.lastChannelMessage && (
            <div className="mt-5 border-t border-white/10 pt-4">
              <div className="mb-1.5 flex items-center justify-between gap-2 text-[10.5px] uppercase tracking-wider text-white/45">
                <span className="flex items-center gap-1.5">
                  <MessageSquare className="size-3" />
                  last channel
                </span>
                <span className="normal-case tracking-normal">{relativeTime(p.lastChannelMessage.at)}</span>
              </div>
              <p className="line-clamp-2 text-[13px] text-white/85">
                <span className="font-mono text-white/60">{p.lastChannelMessage.fromAgentName}</span>
                <span className="text-white/30"> → </span>
                {p.lastChannelMessage.content}
              </p>
            </div>
          )}
        </Link>

        {/* Teams expand zone — outside the Link so its toggle/contents
            can be clicked without navigating. */}
        {showTeamsToggle && (
          <div className="border-t border-white/10">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="flex w-full items-center justify-between gap-2 px-5 py-2.5 text-[11.5px] text-white/55 transition-colors hover:bg-white/[0.04] hover:text-white"
            >
              <span className="flex items-center gap-1.5">
                <Users className="size-3.5" />
                {expanded ? 'Hide' : 'Show'} {p.sessionCount} team{p.sessionCount > 1 ? 's' : ''}
              </span>
              <ChevronDown
                className={cn('size-3.5 transition-transform', expanded && 'rotate-180')}
                aria-hidden
              />
            </button>
            {expanded && (
              <div className="border-t border-white/10">
                {sessionsLoading && sessions === null ? (
                  <p className="px-5 py-3 text-[11.5px] text-white/45">loading teams…</p>
                ) : sessions && sessions.length > 0 ? (
                  <TeamList sessions={sessions} />
                ) : (
                  <p className="px-5 py-3 text-[11.5px] text-white/45">no teams yet</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Footer — totalTokens + first-seen meta. */}
        <div className="flex items-center justify-between border-t border-white/10 px-5 py-3 text-[11px] text-white/45">
          <span className="font-mono tabular">{totalTokens.toLocaleString()} tok</span>
          {p.startedAt && (
            <span>
              first <span className="font-mono">{relativeTime(p.startedAt)}</span>
            </span>
          )}
        </div>
      </article>
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
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1 text-[10.5px] uppercase tracking-wider text-white/45">
        <Icon className="size-3" />
        <span>{label}</span>
      </div>
      <div
        className={cn(
          'font-mono tabular text-[18px] font-semibold leading-none',
          highlight ? 'text-emerald-200' : value > 0 ? 'text-white' : 'text-white/35',
        )}
      >
        {display}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Empty state                                                                */
/* -------------------------------------------------------------------------- */

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
    <div className="glass ring-soft rounded-2xl border border-dashed border-white/15 p-12">
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 text-center">
        <div className="grad-accent grid size-12 place-items-center rounded-2xl shadow-soft-pop">
          <Folder className="size-5 text-white" />
        </div>
        <p className="text-[15px] font-medium">
          {!hasProjects
            ? 'No project yet'
            : statusFilter === 'active' && !hasActive
              ? 'No active project'
              : 'Nothing matches your filters'}
        </p>
        <p className="text-[13px] text-white/55">
          {!hasProjects
            ? 'Every time a Claude CLI invokes an agentdeck MCP tool, or an SDK session is started, the project appears here. Sessions of the same projectId collapse into one card.'
            : statusFilter === 'active' && !hasActive
              ? 'Open a Claude CLI or start an SDK session to see a live project.'
              : 'Try a different status filter or clear the search.'}
        </p>
      </div>
    </div>
  );
}
