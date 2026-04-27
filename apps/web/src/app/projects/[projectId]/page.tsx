'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Activity,
  ChevronLeft,
  Folder,
  LayoutGrid,
  List as ListIcon,
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ACTIVE_STATUSES, LiveDot } from '@/components/session/shared';
import { SessionCard, SessionTable } from '@/components/hub/session-views';
import { TeamList } from '@/components/projects/team-list';
import {
  listProjectSessions,
  startSession,
  type SessionListItem,
} from '@/lib/api';
import { usePollingInterval } from '@/lib/use-polling';
import { cn } from '@/lib/utils';

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

  // /projects/default is killed at the Next.js config level (308 redirect to
  // /, see apps/web/next.config.ts). The dynamic route below only ever
  // renders for real, named projects.

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
    <main className="mx-auto flex min-h-screen max-w-[1400px] flex-col px-6">
      <header className="sticky top-0 z-30 -mx-6 px-6 pt-5">
        <div className="glass ring-soft flex h-14 items-center gap-3 rounded-2xl border border-white/10 px-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12.5px] text-white/70 hover:bg-white/5 hover:text-white"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            All projects
          </Link>
          <div className="h-5 w-px bg-white/10" />
          <div className="grad-accent grid size-7 place-items-center rounded-lg shadow-soft-pop">
            <Folder className="size-4 text-white" />
          </div>
          <div>
            <h1 className="font-mono text-[14px] font-semibold leading-tight">{projectId}</h1>
            <p className="text-[10.5px] uppercase tracking-wider text-white/45">
              {sessions.length} session{sessions.length !== 1 ? 's' : ''} · scoped to this project
            </p>
          </div>

          <div className="flex-1" />

          {stats.live > 0 && (
            <div className="hidden items-center gap-1.5 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2.5 py-1 text-[11.5px] text-emerald-200 md:flex">
              <span className="pulse-dot size-1.5 rounded-full bg-emerald-300" aria-hidden />
              <span className="font-mono tabular">live · {stats.live}</span>
            </div>
          )}
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 pt-8 md:grid-cols-4">
        <KpiCard icon={Plug} label="active sessions" value={stats.active} suffix={`/ ${sessions.length} total`} tone="violet" />
        <KpiCard icon={Users} label="agents running" value={stats.runningAgents} tone="pink" />
        <KpiCard icon={Wrench} label="tools running" value={stats.runningTools} tone="cyan" />
        <KpiCard icon={Activity} label="live now" value={stats.live} suffix={`last ${LIVE_WINDOW_MS / 1000}s`} tone="emerald" showLiveDot={stats.live > 0} />
      </section>

      <div className="mt-6 mb-5 flex flex-wrap items-center gap-3">
        <div className="glass ring-soft flex h-10 w-full items-center gap-2 rounded-full border border-white/10 px-3 sm:w-80">
          <Search className="size-4 text-white/50" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title / id…"
            className="flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-white/40"
          />
        </div>

        <div className="glass ring-soft flex h-10 items-center rounded-full border border-white/10 p-1">
          {(['active', 'past', 'all'] as const).map((k) => (
            <button
              type="button"
              key={k}
              onClick={() => setStatusFilter(k)}
              className={cn(
                'h-8 rounded-full px-3.5 text-[12.5px] capitalize transition-colors',
                statusFilter === k ? 'grad-accent text-white' : 'text-white/70 hover:text-white',
              )}
            >
              {k}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setLiveOnly(!liveOnly)}
          className={cn(
            'inline-flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-[12.5px] transition-colors',
            liveOnly
              ? 'border-emerald-300/40 bg-emerald-400/10 text-emerald-200'
              : 'glass ring-soft border-white/10 text-white/70 hover:text-white',
          )}
        >
          {liveOnly && <LiveDot />}
          live only
          {stats.live > 0 && !liveOnly && (
            <span className="font-mono tabular ml-1 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-1.5 text-[10px] text-emerald-200">
              {stats.live}
            </span>
          )}
        </button>

        <div className="ml-auto flex items-center gap-2">
          <div className="glass ring-soft flex h-10 items-center rounded-full border border-white/10 p-1">
            <button
              type="button"
              onClick={() => setView('grid')}
              aria-label="grid view"
              className={cn(
                'grid size-8 place-items-center rounded-full transition-colors',
                view === 'grid' ? 'grad-accent text-white' : 'text-white/55 hover:text-white',
              )}
            >
              <LayoutGrid className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setView('list')}
              aria-label="list view"
              className={cn(
                'grid size-8 place-items-center rounded-full transition-colors',
                view === 'list' ? 'grad-accent text-white' : 'text-white/55 hover:text-white',
              )}
            >
              <ListIcon className="size-3.5" />
            </button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void refresh()}
            className="h-10 rounded-full px-3 text-[12.5px] text-white/70 hover:bg-white/5 hover:text-white"
          >
            <RefreshCw className="mr-1.5 size-3.5" />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => setShowForm((v) => !v)}
            className={cn(
              'h-10 rounded-full px-4 text-[12.5px] font-medium',
              showForm
                ? 'border border-white/15 bg-white/10 text-white hover:bg-white/15'
                : 'grad-accent text-white shadow-soft-pop',
            )}
          >
            {showForm ? 'Cancel' : (
              <>
                <Plus className="size-3.5" />
                New SDK
              </>
            )}
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="mb-4">
          <Card className="glass ring-soft rounded-2xl border-rose-300/30 bg-rose-500/5">
            <CardContent className="py-3 text-sm text-rose-200">
              Proxy unreachable: <code className="rounded bg-black/30 px-1 text-xs">{loadError}</code>
            </CardContent>
          </Card>
        </div>
      )}

      {showForm && (
        <div className="glass ring-soft mb-6 rounded-2xl border border-white/10 p-5">
          <div className="mb-3">
            <h2 className="text-[14px] font-medium text-white">Start a new SDK session in {projectId}</h2>
            <p className="mt-1 text-[12px] text-white/55">
              CLI-bridged sessions appear automatically when a Claude CLI invokes any{' '}
              <code className="font-mono rounded bg-white/10 px-1 text-[11px]">mcp__agentdeck__*</code> tool with this project id.
            </p>
          </div>
          <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="prompt" className="text-[11px] uppercase tracking-wider text-white/55">
                Prompt
              </Label>
              <Textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={2}
                className="rounded-2xl border-white/10 bg-white/5 text-[13px] text-white placeholder:text-white/40 focus-visible:ring-violet-300/40"
                required
              />
            </div>
            <Button
              type="submit"
              disabled={submitting || !prompt.trim()}
              size="sm"
              className="grad-accent h-10 rounded-full border-0 px-4 text-[13px] font-medium text-white shadow-soft-pop disabled:opacity-50 disabled:shadow-none"
            >
              {submitting ? 'Starting…' : 'Start'}
            </Button>
          </form>
          {formError && <p className="mt-2 text-xs text-rose-300">{formError}</p>}
        </div>
      )}

      <TeamList projectId={projectId} sessions={sessions} />

      <section className="flex-1 pb-12">
        {filtered.length === 0 ? (
          <div className="glass ring-soft rounded-2xl border border-dashed border-white/15 p-12">
            <div className="mx-auto flex max-w-md flex-col items-center gap-3 text-center">
              <p className="text-[15px] font-medium">No session matches.</p>
              <p className="text-[13px] text-white/55">
                {sessions.length === 0
                  ? `No session exists yet under "${projectId}". Open a Claude CLI or start an SDK session to populate this project.`
                  : 'Try a different status filter, clear the search, or disable "live only".'}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-[11px] uppercase tracking-wider text-white/45">
              {filtered.length} shown · {sessions.length} total
            </p>
            {view === 'grid' ? (
              <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
  const ORB: Record<string, string> = {
    violet: 'bg-violet-500/15',
    pink: 'bg-pink-500/15',
    cyan: 'bg-cyan-400/15',
    emerald: 'bg-emerald-400/15',
  };
  return (
    <div className="glass ring-soft relative overflow-hidden rounded-2xl border border-white/10 p-4">
      <div className={cn('absolute -right-6 -top-6 size-24 rounded-full blur-2xl', ORB[tone])} aria-hidden />
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/55">
        <Icon className="size-3.5" />
        <span>{label}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span
          className={cn(
            'font-mono tabular text-[28px] font-semibold leading-none tracking-tight',
            value > 0 ? 'text-white' : 'text-white/45',
          )}
        >
          {value.toString().padStart(2, '0')}
        </span>
        {showLiveDot && <LiveDot />}
        {suffix && <span className="font-mono tabular text-[11px] text-white/45">{suffix}</span>}
      </div>
    </div>
  );
}
