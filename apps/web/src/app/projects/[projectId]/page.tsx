'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Activity,
  ChevronLeft,
  FlaskConical,
  LayoutGrid,
  List,
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
import { ACTIVE_STATUSES, LiveDot } from '@/components/session/shared';
import { SessionCard, SessionTable } from '@/components/hub/session-views';
import {
  listProjectSessions,
  startSession,
  type SessionListItem,
} from '@/lib/api';
import { usePollingInterval } from '@/lib/use-polling';

const LIVE_WINDOW_MS = 10_000;

export default function ProjectPage() {
  const router = useRouter();
  const params = useParams<{ projectId: string }>();
  const projectId = decodeURIComponent(params.projectId);

  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'past'>('active');
  const [liveOnly, setLiveOnly] = useState(false);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [showForm, setShowForm] = useState(false);

  const [prompt, setPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const rows = await listProjectSessions(projectId);
      setSessions(rows);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }, [projectId]);

  usePollingInterval(refresh, 8_000, [refresh]);

  const [, setTick] = useState(0);
  useEffect(() => {
    const h = setInterval(() => setTick((t) => t + 1), 1_000);
    return () => clearInterval(h);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sessions.filter((s) => {
      const isActive = ACTIVE_STATUSES.includes(s.status);
      if (statusFilter === 'active' && !isActive) return false;
      if (statusFilter === 'past' && isActive) return false;
      if (liveOnly) {
        const lastMs = s.lastActivityAt ? Date.now() - new Date(s.lastActivityAt).getTime() : Infinity;
        if (!isActive || lastMs > LIVE_WINDOW_MS) return false;
      }
      if (q) {
        const hay = `${s.title} ${s.id}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [sessions, search, statusFilter, liveOnly]);

  const stats = useMemo(() => {
    let active = 0;
    let runningAgents = 0;
    let runningTools = 0;
    let live = 0;
    for (const s of sessions) {
      if (ACTIVE_STATUSES.includes(s.status)) {
        active++;
        runningAgents += s.runningAgentCount;
        runningTools += s.runningToolCallCount;
        const lastMs = s.lastActivityAt ? Date.now() - new Date(s.lastActivityAt).getTime() : Infinity;
        if (lastMs < LIVE_WINDOW_MS) live++;
      }
    }
    return { active, runningAgents, runningTools, live };
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
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border/60 bg-background/80 px-6 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1 rounded-md p-1.5 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            aria-label="back to hub"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
            <Plug className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-tight font-mono">{projectId}</h1>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">project sessions</p>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 px-6 pt-4 md:grid-cols-4">
        <KpiCard icon={Plug} label="active sessions" value={stats.active} suffix={`/${sessions.length} total`} highlight={stats.active > 0} />
        <KpiCard icon={Users} label="agents running" value={stats.runningAgents} highlight={stats.runningAgents > 0} />
        <KpiCard icon={Wrench} label="tools running" value={stats.runningTools} highlight={stats.runningTools > 0} />
        <KpiCard icon={Activity} label="live now" value={stats.live} suffix={`last ${LIVE_WINDOW_MS / 1000}s`} highlight={stats.live > 0} showLiveDot={stats.live > 0} />
      </section>

      <section className="flex flex-wrap items-center gap-2 px-6 py-4">
        <div className="relative min-w-[220px] flex-1 md:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title / id…"
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
          {stats.live > 0 && !liveOnly && (
            <Badge variant="outline" className="border-emerald-500/30 text-[9px] text-emerald-400">
              {stats.live}
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
          <Button variant="ghost" size="sm" onClick={() => void refresh()} className="h-8 text-xs">
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setShowForm((v) => !v)} className="h-8 text-xs">
            {showForm ? (
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

      {loadError && (
        <div className="mx-6 mb-4">
          <Card className="border-red-500/40 bg-red-500/5">
            <CardContent className="py-3 text-sm text-red-400">
              Proxy unreachable: <code className="rounded bg-background/40 px-1 text-xs">{loadError}</code>
            </CardContent>
          </Card>
        </div>
      )}

      {showForm && (
        <div className="mx-6 mb-4">
          <Card className="border-border/60 bg-card/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Start a new SDK session in {projectId}</CardTitle>
              <CardDescription className="text-xs">
                CLI-bridged sessions appear automatically when a Claude CLI invokes any{' '}
                <code>mcp__agentdeck__*</code> tool with this project id.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="prompt" className="text-xs">Prompt</Label>
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
          <Card className="border-dashed border-border/60 bg-transparent">
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-sm font-medium">No session matches.</p>
              <p className="max-w-md text-xs text-muted-foreground">
                {sessions.length === 0
                  ? `No session exists yet under "${projectId}". Open a Claude CLI or start an SDK session to populate this project.`
                  : 'Try a different status filter, clear the search, or disable "live only".'}
              </p>
            </CardContent>
          </Card>
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

function KpiCard({
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
            <span className={`text-2xl font-semibold tabular-nums ${highlight ? 'text-emerald-400' : 'text-foreground'}`}>
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
