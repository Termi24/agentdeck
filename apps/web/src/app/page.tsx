'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Activity,
  FileText,
  FlaskConical,
  LayoutGrid,
  List,
  MessageSquare,
  Plug,
  Plus,
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
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { ACTIVE_STATUSES, LiveDot, relativeTime, statusClasses } from '@/components/session/shared';
import {
  listSessionAgents,
  listSessions,
  startSession,
  type SessionAgent,
  type SessionListItem,
  type SessionStatus,
} from '@/lib/api';
import { usePollingInterval } from '@/lib/use-polling';

const LIVE_WINDOW_MS = 10_000;

export default function HubPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'past'>('active');
  const [liveOnly, setLiveOnly] = useState(false);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [showForm, setShowForm] = useState(false);

  const [projectId, setProjectId] = useState('demo');
  const [prompt, setPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const rows = await listSessions(200);
      setSessions(rows);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  usePollingInterval(refresh, 8_000, [refresh]);

  // Tick state to force re-renders every 1 s so relative-time chips + live dot
  // react to the passage of time even when no new session data arrives.
  const [, setTick] = useState(0);
  useEffect(() => {
    const h = setInterval(() => setTick((t) => t + 1), 1_000);
    return () => clearInterval(h);
  }, []);

  const projects = useMemo(() => {
    const set = new Set(sessions.map((s) => s.projectId));
    return Array.from(set).sort();
  }, [sessions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sessions.filter((s) => {
      if (projectFilter !== 'all' && s.projectId !== projectFilter) return false;
      const isActive = ACTIVE_STATUSES.includes(s.status);
      if (statusFilter === 'active' && !isActive) return false;
      if (statusFilter === 'past' && isActive) return false;
      if (liveOnly) {
        const lastMs = s.lastActivityAt ? Date.now() - new Date(s.lastActivityAt).getTime() : Infinity;
        if (!isActive || lastMs > LIVE_WINDOW_MS) return false;
      }
      if (q) {
        const hay = `${s.title} ${s.projectId} ${s.id}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [sessions, search, projectFilter, statusFilter, liveOnly]);

  const globalStats = useMemo(() => {
    let active = 0;
    let runningAgents = 0;
    let runningTools = 0;
    let live = 0;
    let totalMessages = 0;
    let totalDocs = 0;
    for (const s of sessions) {
      if (ACTIVE_STATUSES.includes(s.status)) {
        active++;
        runningAgents += s.runningAgentCount;
        runningTools += s.runningToolCallCount;
        const lastMs = s.lastActivityAt ? Date.now() - new Date(s.lastActivityAt).getTime() : Infinity;
        if (lastMs < LIVE_WINDOW_MS) live++;
      }
      totalMessages += s.channelMessageCount;
      totalDocs += s.docCount;
    }
    return { active, runningAgents, runningTools, live, totalMessages, totalDocs };
  }, [sessions]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const { sessionId } = await startSession({ projectId, prompt });
      router.push(`/sessions/${sessionId}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col">
      <Header />

      <GlobalKpiBar stats={globalStats} sessionsCount={sessions.length} />

      <Toolbar
        search={search}
        setSearch={setSearch}
        projects={projects}
        projectFilter={projectFilter}
        setProjectFilter={setProjectFilter}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        liveOnly={liveOnly}
        setLiveOnly={setLiveOnly}
        liveCount={globalStats.live}
        view={view}
        setView={setView}
        onRefresh={() => void refresh()}
        onToggleForm={() => setShowForm((v) => !v)}
        formOpen={showForm}
      />

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

      {showForm && (
        <div className="mx-6 mb-4">
          <Card className="border-border/60 bg-card/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Start a new SDK session</CardTitle>
              <CardDescription className="text-xs">
                CLI-bridged sessions appear here automatically when a Claude CLI invokes any{' '}
                <code>mcp__agentdeck__*</code> tool — no form needed.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-[200px_1fr_auto] md:items-end">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="projectId" className="text-xs">
                    Project
                  </Label>
                  <Input
                    id="projectId"
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    className="h-8 text-sm"
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="prompt" className="text-xs">
                    Prompt
                  </Label>
                  <Textarea
                    id="prompt"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={2}
                    className="text-sm"
                    required
                  />
                </div>
                <Button type="submit" disabled={submitting || !prompt.trim()} size="sm">
                  {submitting ? 'Starting…' : 'Start'}
                </Button>
              </form>
              {formError && <p className="mt-2 text-xs text-red-400">{formError}</p>}
            </CardContent>
          </Card>
        </div>
      )}

      <section className="flex-1 px-6 pb-10">
        {filtered.length === 0 ? (
          <EmptyState
            hasSessions={sessions.length > 0}
            hasActive={globalStats.active > 0}
            statusFilter={statusFilter}
          />
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {filtered.length} shown · {sessions.length} total
            </p>
            {view === 'grid' ? (
              <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {filtered.map((s) => (
                  <SessionCard key={s.id} s={s} />
                ))}
              </ul>
            ) : (
              <SessionTable sessions={filtered} />
            )}
          </div>
        )}
      </section>
    </main>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border/60 bg-background/80 px-6 backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
          <Plug className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h1 className="text-sm font-semibold leading-tight">agentdeck</h1>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">MCP connections hub</p>
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
      </nav>
    </header>
  );
}

function GlobalKpiBar({
  stats,
  sessionsCount,
}: {
  stats: {
    active: number;
    runningAgents: number;
    runningTools: number;
    live: number;
    totalMessages: number;
    totalDocs: number;
  };
  sessionsCount: number;
}) {
  return (
    <section className="grid grid-cols-2 gap-3 px-6 pt-4 md:grid-cols-4">
      <GlobalKpi
        icon={Plug}
        label="active"
        value={stats.active}
        suffix={`/${sessionsCount} total`}
        highlight={stats.active > 0}
      />
      <GlobalKpi
        icon={Users}
        label="agents running"
        value={stats.runningAgents}
        highlight={stats.runningAgents > 0}
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

function Toolbar({
  search,
  setSearch,
  projects,
  projectFilter,
  setProjectFilter,
  statusFilter,
  setStatusFilter,
  liveOnly,
  setLiveOnly,
  liveCount,
  view,
  setView,
  onRefresh,
  onToggleForm,
  formOpen,
}: {
  search: string;
  setSearch: (s: string) => void;
  projects: string[];
  projectFilter: string;
  setProjectFilter: (p: string) => void;
  statusFilter: 'all' | 'active' | 'past';
  setStatusFilter: (s: 'all' | 'active' | 'past') => void;
  liveOnly: boolean;
  setLiveOnly: (v: boolean) => void;
  liveCount: number;
  view: 'grid' | 'list';
  setView: (v: 'grid' | 'list') => void;
  onRefresh: () => void;
  onToggleForm: () => void;
  formOpen: boolean;
}) {
  return (
    <section className="flex flex-wrap items-center gap-2 px-6 py-4">
      <div className="relative min-w-[220px] flex-1 md:max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title / project / id…"
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

      {projects.length > 1 && (
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="h-8 rounded-md border border-border bg-background px-3 text-xs text-foreground"
        >
          <option value="all">All projects</option>
          {projects.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      )}

      <button
        type="button"
        onClick={() => setLiveOnly(!liveOnly)}
        className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors ${
          liveOnly
            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
            : 'border-border/60 text-muted-foreground hover:text-foreground'
        }`}
      >
        {liveOnly && <LiveDot />}
        live only
        {liveCount > 0 && !liveOnly && (
          <Badge variant="outline" className="border-emerald-500/30 text-[9px] text-emerald-400">
            {liveCount}
          </Badge>
        )}
      </button>

      <div className="ml-auto flex items-center gap-1">
        <div className="flex items-center gap-0 rounded-md border border-border/60 p-0.5">
          <button
            type="button"
            onClick={() => setView('grid')}
            aria-label="grid view"
            className={`rounded p-1 transition-colors ${view === 'grid' ? 'bg-primary/15 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setView('list')}
            aria-label="list view"
            className={`rounded p-1 transition-colors ${view === 'list' ? 'bg-primary/15 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <List className="h-3.5 w-3.5" />
          </button>
        </div>
        <Button variant="ghost" size="sm" onClick={onRefresh} className="h-8 text-xs">
          <RefreshCw className="mr-1 h-3.5 w-3.5" />
          Refresh
        </Button>
        <Button size="sm" onClick={onToggleForm} className="h-8 text-xs">
          {formOpen ? (
            'Cancel'
          ) : (
            <>
              <Plus className="mr-1 h-3.5 w-3.5" />
              New SDK
            </>
          )}
        </Button>
      </div>
    </section>
  );
}

function SessionCard({ s }: { s: SessionListItem }) {
  const [expanded, setExpanded] = useState(false);
  const [agents, setAgents] = useState<SessionAgent[] | null>(null);

  const isActive = ACTIVE_STATUSES.includes(s.status);
  const lastActivityMs = s.lastActivityAt ? Date.now() - new Date(s.lastActivityAt).getTime() : Infinity;
  const isLive = isActive && lastActivityMs < LIVE_WINDOW_MS;

  usePollingInterval(
    async () => {
      if (!expanded) return;
      try {
        const rows = await listSessionAgents(s.id);
        setAgents(rows);
      } catch {
        /* ignore */
      }
    },
    10_000,
    [expanded, s.id],
  );

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
              href={`/sessions/${s.id}`}
              className="flex min-w-0 flex-1 items-center gap-2 hover:underline"
            >
              {isLive && <LiveDot />}
              <CardTitle className="line-clamp-1 text-sm font-medium">
                {s.title || s.id.slice(0, 8)}
              </CardTitle>
            </Link>
            <div className="flex shrink-0 gap-1">
              <Badge variant="outline" className={`text-[10px] ${statusClasses(s.status)}`}>
                {s.status.replace('_', ' ')}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {s.isBridge ? 'CLI' : 'SDK'}
              </Badge>
            </div>
          </div>
          <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
            <span className="font-mono text-foreground/70">{s.projectId}</span>
            <span>started {relativeTime(s.startedAt)}</span>
            {isActive && s.lastActivityAt && (
              <span className={isLive ? 'text-emerald-400' : 'text-muted-foreground'}>
                last event {relativeTime(s.lastActivityAt)}
              </span>
            )}
            {s.endedAt && !isActive && <span>ended {relativeTime(s.endedAt)}</span>}
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-1 flex-col gap-3 pt-0">
          <div className="grid grid-cols-4 gap-1.5">
            <MicroStat
              icon={Users}
              value={s.runningAgentCount}
              total={s.agentCount}
              label="agents"
              highlight={s.runningAgentCount > 0}
            />
            <MicroStat
              icon={Wrench}
              value={s.runningToolCallCount}
              total={s.toolCallCount}
              label="tools"
              highlight={s.runningToolCallCount > 0}
            />
            <MicroStat icon={MessageSquare} value={s.channelMessageCount} label="msgs" />
            <MicroStat icon={FileText} value={s.docCount} label="docs" />
          </div>

          {s.lastChannelMessage && (
            <div className="rounded-md border border-border/40 bg-muted/20 p-2 text-xs">
              <div className="mb-0.5 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                <span className="font-mono">{s.lastChannelMessage.fromAgentName}</span>
                <span>{relativeTime(s.lastChannelMessage.at)}</span>
              </div>
              <p className="line-clamp-2 text-foreground/80">{s.lastChannelMessage.content}</p>
            </div>
          )}

          {s.testResultCount > 0 && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <FlaskConical className="h-3 w-3" />
              <span>{s.testResultCount} test result{s.testResultCount > 1 ? 's' : ''}</span>
            </div>
          )}

          <div className="mt-auto flex items-center justify-between border-t border-border/30 pt-2">
            <button
              type="button"
              className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:no-underline disabled:opacity-50"
              onClick={() => setExpanded((v) => !v)}
              disabled={s.agentCount === 0}
            >
              {s.agentCount === 0
                ? 'no agents'
                : expanded
                  ? `hide ${s.agentCount}`
                  : `show ${s.agentCount} agent${s.agentCount > 1 ? 's' : ''}`}
            </button>
            <Link
              href={`/sessions/${s.id}`}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              dashboard →
            </Link>
          </div>

          {expanded && (
            <div className="flex flex-col gap-1 rounded-md border border-border/30 bg-muted/10 p-2">
              {agents === null ? (
                <p className="text-[11px] text-muted-foreground">loading…</p>
              ) : agents.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">no agents</p>
              ) : (
                agents.map((a) => <CompactAgentRow key={a.id} a={a} />)
              )}
            </div>
          )}

          <p className="font-mono text-[10px] text-muted-foreground">{s.id}</p>
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
        highlight
          ? 'border-emerald-500/30 bg-emerald-500/5'
          : 'border-border/40 bg-muted/10'
      }`}
    >
      <div className="flex items-center gap-1">
        <Icon
          className={`h-3 w-3 ${highlight ? 'text-emerald-400' : 'text-muted-foreground'}`}
        />
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

function CompactAgentRow({ a }: { a: SessionAgent }) {
  const active = ACTIVE_STATUSES.includes(a.status);
  const isSub = a.parentAgentId !== null;
  return (
    <div className="flex items-center justify-between gap-2 text-[11px]">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="shrink-0 text-muted-foreground">{isSub ? '└─' : '●'}</span>
        <span className="truncate font-mono">{a.name}</span>
        {a.role && <span className="shrink-0 text-[9px] text-muted-foreground">({a.role})</span>}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {a.runningToolCallCount > 0 && (
          <span className="rounded-sm bg-emerald-500/15 px-1 text-[9px] text-emerald-400">
            {a.runningToolCallCount}●
          </span>
        )}
        <Badge variant="outline" className={`px-1 py-0 text-[9px] ${statusClasses(a.status)}`}>
          {active ? a.status.replace('_', ' ') : a.status}
        </Badge>
      </div>
    </div>
  );
}

function SessionTable({ sessions }: { sessions: SessionListItem[] }) {
  return (
    <Card className="overflow-hidden border-border/60 bg-card/40">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="border-b border-border/40 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Session</th>
              <th className="px-4 py-2 text-left font-medium">Project</th>
              <th className="px-4 py-2 text-left font-medium">Status</th>
              <th className="px-4 py-2 text-right font-medium">Agents</th>
              <th className="px-4 py-2 text-right font-medium">Tools</th>
              <th className="px-4 py-2 text-right font-medium">Msgs</th>
              <th className="px-4 py-2 text-right font-medium">Docs</th>
              <th className="px-4 py-2 text-right font-medium">Last event</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => {
              const isActive = ACTIVE_STATUSES.includes(s.status);
              const lastMs = s.lastActivityAt ? Date.now() - new Date(s.lastActivityAt).getTime() : Infinity;
              const isLive = isActive && lastMs < LIVE_WINDOW_MS;
              return (
                <tr
                  key={s.id}
                  className="group cursor-pointer border-b border-border/30 transition-colors hover:bg-muted/30"
                >
                  <td className="px-4 py-2">
                    <Link
                      href={`/sessions/${s.id}`}
                      className="flex items-center gap-2 group-hover:underline"
                    >
                      {isLive && <LiveDot />}
                      <span className="max-w-[28ch] truncate">{s.title || s.id.slice(0, 8)}</span>
                      <Badge variant="outline" className="shrink-0 text-[9px]">
                        {s.isBridge ? 'CLI' : 'SDK'}
                      </Badge>
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <span className="font-mono text-muted-foreground">{s.projectId}</span>
                  </td>
                  <td className="px-4 py-2">
                    <Badge variant="outline" className={`text-[9px] ${statusClasses(s.status)}`}>
                      {s.status.replace('_', ' ')}
                    </Badge>
                  </td>
                  <TableNum value={s.runningAgentCount} total={s.agentCount} highlight />
                  <TableNum value={s.runningToolCallCount} total={s.toolCallCount} highlight />
                  <TableNum value={s.channelMessageCount} />
                  <TableNum value={s.docCount} />
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                    {s.lastActivityAt ? relativeTime(s.lastActivityAt) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function TableNum({
  value,
  total,
  highlight,
}: {
  value: number;
  total?: number;
  highlight?: boolean;
}) {
  const display = total !== undefined && total !== value ? `${value}/${total}` : `${value}`;
  const cls =
    highlight && value > 0 ? 'text-emerald-400' : value > 0 ? 'text-foreground' : 'text-muted-foreground';
  return <td className={`px-4 py-2 text-right tabular-nums ${cls}`}>{display}</td>;
}

function EmptyState({
  hasSessions,
  hasActive,
  statusFilter,
}: {
  hasSessions: boolean;
  hasActive: boolean;
  statusFilter: 'all' | 'active' | 'past';
}) {
  return (
    <Card className="border-dashed border-border/60 bg-transparent">
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/30">
          <Plug className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium">
            {!hasSessions
              ? 'No MCP connection yet'
              : statusFilter === 'active' && !hasActive
                ? 'No active connection'
                : 'Nothing matches your filters'}
          </p>
          <p className="mt-1 max-w-md text-xs text-muted-foreground">
            {!hasSessions
              ? 'Every time a Claude CLI invokes an agentdeck MCP tool, or an SDK session is started, it appears here.'
              : statusFilter === 'active' && !hasActive
                ? 'Open a Claude CLI or start an SDK session above to see a live connection.'
                : 'Try a different status filter, clear the search, or switch project.'}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

