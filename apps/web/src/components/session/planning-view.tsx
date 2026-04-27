'use client';
import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, GanttChart, ListChecks } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { listAgentTasks, type AgentTaskItem, type AgentTaskStatus } from '@/lib/api';
import { useSession } from '@/components/session-context';
import { usePollingInterval } from '@/lib/use-polling';

const STATUS_COLOR: Record<AgentTaskStatus, string> = {
  planned: 'bg-zinc-500/40 border-zinc-500/60 text-zinc-300',
  in_progress: 'bg-emerald-500/40 border-emerald-500/60 text-emerald-200',
  blocked: 'bg-amber-500/40 border-amber-500/60 text-amber-200',
  completed: 'bg-blue-500/30 border-blue-500/60 text-blue-200',
  cancelled: 'bg-red-500/30 border-red-500/60 text-red-200',
};

/**
 * Build a derived "live" task view by folding the SessionProvider event
 * stream over the snapshot fetched from REST. Lets the Gantt + calendar
 * tick in real time without a full poll round-trip.
 */
type MutableTask = { -readonly [K in keyof AgentTaskItem]: AgentTaskItem[K] };

function foldEventsOverTasks(snapshot: AgentTaskItem[], events: ReadonlyArray<{ type: string } & Record<string, unknown>>): AgentTaskItem[] {
  const byId = new Map<string, MutableTask>(snapshot.map((t) => [t.id, { ...t } as MutableTask]));
  for (const e of events) {
    if (e.type === 'agent.task.planned') {
      const taskId = String(e.taskId);
      if (!byId.has(taskId)) {
        byId.set(taskId, {
          id: taskId,
          sessionId: String(e.sessionId),
          agentId: String(e.agentId),
          agentName: String(e.agentName ?? e.agentId),
          title: String(e.title ?? ''),
          description: typeof e.description === 'string' ? e.description : null,
          status: 'planned',
          progressPct: 0,
          plannedStart: String(e.plannedStart),
          plannedEnd: String(e.plannedEnd),
          actualStart: null,
          actualEnd: null,
          dependencies: Array.isArray(e.dependencies) ? (e.dependencies as string[]) : [],
          createdAt: String(e.at),
          updatedAt: String(e.at),
        });
      }
    } else if (e.type === 'agent.task.started') {
      const t = byId.get(String(e.taskId));
      if (t) { t.status = 'in_progress'; t.actualStart = t.actualStart ?? String(e.at); t.updatedAt = String(e.at); }
    } else if (e.type === 'agent.task.progressed') {
      const t = byId.get(String(e.taskId));
      if (t) {
        if (typeof e.progressPct === 'number') t.progressPct = e.progressPct as number;
        if (typeof e.status === 'string') t.status = e.status as AgentTaskStatus;
        t.updatedAt = String(e.at);
      }
    } else if (e.type === 'agent.task.completed') {
      const t = byId.get(String(e.taskId));
      if (t) {
        t.status = (e.status as AgentTaskStatus | undefined) ?? 'completed';
        if (t.status === 'completed') t.progressPct = 100;
        t.actualEnd = String(e.at);
        t.updatedAt = String(e.at);
      }
    }
  }
  return [...byId.values()].sort((a, b) => a.plannedStart.localeCompare(b.plannedStart));
}

export function PlanningView({ sessionId }: { sessionId: string }) {
  const { events } = useSession();
  const [snapshot, setSnapshot] = useState<AgentTaskItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  usePollingInterval(
    async () => {
      try {
        const tasks = await listAgentTasks(sessionId);
        setSnapshot(tasks);
        setLoadError(null);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : String(err));
      }
    },
    8_000,
    [sessionId],
  );

  // Tick to keep "now" indicator current.
  const [, setTick] = useState(0);
  useEffect(() => {
    const h = setInterval(() => setTick((t) => t + 1), 5_000);
    return () => clearInterval(h);
  }, []);

  const tasks = useMemo(
    () => foldEventsOverTasks(snapshot, events as ReadonlyArray<{ type: string } & Record<string, unknown>>),
    [snapshot, events],
  );

  const overall = useMemo(() => {
    if (tasks.length === 0) return { pct: 0, completed: 0, inProgress: 0, planned: 0, blocked: 0 };
    let pct = 0;
    let completed = 0;
    let inProgress = 0;
    let planned = 0;
    let blocked = 0;
    for (const t of tasks) {
      pct += t.progressPct;
      if (t.status === 'completed') completed++;
      else if (t.status === 'in_progress') inProgress++;
      else if (t.status === 'blocked') blocked++;
      else if (t.status === 'planned') planned++;
    }
    return { pct: Math.round(pct / tasks.length), completed, inProgress, planned, blocked };
  }, [tasks]);

  if (loadError) {
    return <p className="p-6 text-center text-xs text-rose-300">failed to load tasks: {loadError}</p>;
  }
  if (tasks.length === 0) {
    return (
      <p className="p-6 text-center text-xs text-white/55">
        no tasks planned yet — agents announce their schedule via{' '}
        <code className="rounded bg-white/10 px-1">task_plan</code>.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <OverallProgress overall={overall} totalTasks={tasks.length} />
      <Tabs defaultValue="gantt">
        <TabsList className="h-8 bg-transparent p-0">
          <SubTab value="gantt" icon={<GanttChart className="h-3.5 w-3.5" />} label="Gantt" />
          <SubTab value="calendar" icon={<CalendarDays className="h-3.5 w-3.5" />} label="Calendar" />
          <SubTab value="progress" icon={<ListChecks className="h-3.5 w-3.5" />} label="Progress" />
        </TabsList>

        <TabsContent value="gantt" className="mt-3">
          <GanttChartView tasks={tasks} />
        </TabsContent>
        <TabsContent value="calendar" className="mt-3">
          <CalendarView tasks={tasks} />
        </TabsContent>
        <TabsContent value="progress" className="mt-3">
          <ProgressListView tasks={tasks} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SubTab({ value, icon, label }: { value: string; icon: React.ReactNode; label: string }) {
  return (
    <TabsTrigger
      value={value}
      className="h-8 gap-1.5 rounded-full border border-transparent bg-transparent px-3 text-xs data-[state=active]:border-white/15 data-[state=active]:bg-white/10 data-[state=active]:text-white data-[state=active]:shadow-none"
    >
      {icon}
      {label}
    </TabsTrigger>
  );
}

function OverallProgress({
  overall,
  totalTasks,
}: {
  overall: { pct: number; completed: number; inProgress: number; planned: number; blocked: number };
  totalTasks: number;
}) {
  return (
    <div className="rounded-md border glass ring-soft border-white/10 bg-transparent rounded-2xl p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wider text-white/55">overall progress</span>
        <span className="text-2xl font-semibold tabular-nums">
          {overall.pct}<span className="ml-1 text-base text-white/55">%</span>
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full bg-gradient-to-r from-emerald-500 to-blue-500 transition-all duration-500"
          style={{ width: `${overall.pct}%` }}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-wider text-white/55">
        <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
          {overall.completed} done
        </Badge>
        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/5 text-emerald-200">
          {overall.inProgress} in progress
        </Badge>
        {overall.blocked > 0 && (
          <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-300">
            {overall.blocked} blocked
          </Badge>
        )}
        <Badge variant="outline" className="border-zinc-500/30 bg-white/5 text-zinc-300">
          {overall.planned} planned
        </Badge>
        <span>· {totalTasks} tasks total</span>
      </div>
    </div>
  );
}

/* ──────────────── Gantt ──────────────── */

function GanttChartView({ tasks }: { tasks: AgentTaskItem[] }) {
  // Group tasks per agent for a swim-lane Gantt.
  const byAgent = useMemo(() => {
    const map = new Map<string, { name: string; rows: AgentTaskItem[] }>();
    for (const t of tasks) {
      const entry = map.get(t.agentId) ?? { name: t.agentName, rows: [] };
      entry.rows.push(t);
      map.set(t.agentId, entry);
    }
    return Array.from(map.entries());
  }, [tasks]);

  const { min, max } = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const t of tasks) {
      lo = Math.min(lo, new Date(t.plannedStart).getTime());
      hi = Math.max(hi, new Date(t.plannedEnd).getTime(), t.actualEnd ? new Date(t.actualEnd).getTime() : 0);
    }
    if (!isFinite(lo) || !isFinite(hi) || lo === hi) {
      hi = lo + 60 * 60 * 1000;
    }
    return { min: lo, max: hi };
  }, [tasks]);

  const span = Math.max(max - min, 1);
  const now = Date.now();
  const nowPct = Math.max(0, Math.min(100, ((now - min) / span) * 100));
  const showNow = now >= min && now <= max;

  return (
    <div className="flex flex-col gap-2 rounded-md border glass ring-soft border-white/10 bg-transparent rounded-2xl p-3">
      <TimeAxis min={min} max={max} />
      <div className="relative flex flex-col gap-3 pt-1">
        {showNow && (
          <div
            className="pointer-events-none absolute top-0 z-10 h-full w-px bg-red-500/70"
            style={{ left: `calc(140px + (100% - 140px) * ${nowPct / 100})` }}
            aria-hidden
          >
            <span className="absolute -top-4 -translate-x-1/2 whitespace-nowrap rounded bg-red-500/80 px-1 text-[9px] font-semibold text-white">
              now
            </span>
          </div>
        )}
        {byAgent.map(([agentId, group]) => (
          <div key={agentId} className="grid grid-cols-[140px_1fr] items-start gap-2">
            <div className="truncate pt-1 font-mono text-xs text-foreground/90" title={group.name}>
              {group.name}
            </div>
            <div className="relative flex flex-col gap-1.5">
              {group.rows.map((t) => (
                <GanttBar key={t.id} task={t} min={min} span={span} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GanttBar({ task, min, span }: { task: AgentTaskItem; min: number; span: number }) {
  const start = new Date(task.plannedStart).getTime();
  const end = new Date(task.plannedEnd).getTime();
  const leftPct = ((start - min) / span) * 100;
  const widthPct = Math.max(((end - start) / span) * 100, 0.5);
  const colorClass = STATUS_COLOR[task.status];

  return (
    <div
      className="relative h-6"
      title={`${task.title} — ${task.status} ${task.progressPct}%`}
    >
      <div
        className={`absolute top-0 flex h-6 items-center gap-1 overflow-hidden rounded-sm border px-1.5 text-[10px] font-medium ${colorClass}`}
        style={{ left: `${leftPct}%`, width: `${widthPct}%`, minWidth: '24px' }}
      >
        <div
          className="absolute inset-y-0 left-0 bg-white/15"
          style={{ width: `${task.progressPct}%` }}
          aria-hidden
        />
        <span className="relative truncate">{task.title}</span>
        <span className="relative ml-auto shrink-0 tabular-nums opacity-80">{task.progressPct}%</span>
      </div>
    </div>
  );
}

function TimeAxis({ min, max }: { min: number; max: number }) {
  const span = max - min;
  const ticks = 5;
  const labels = Array.from({ length: ticks + 1 }, (_, i) => {
    const t = min + (span * i) / ticks;
    const d = new Date(t);
    const sameDay = new Date(min).toDateString() === new Date(max).toDateString();
    return sameDay
      ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}h`;
  });
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 border-b border-white/10 pb-1">
      <div />
      <div className="flex justify-between text-[9px] uppercase tracking-wider text-white/55">
        {labels.map((l, i) => (
          <span key={i}>{l}</span>
        ))}
      </div>
    </div>
  );
}

/* ──────────────── Calendar ──────────────── */

function CalendarView({ tasks }: { tasks: AgentTaskItem[] }) {
  // Day grid of the planning span. One column per day, tasks listed under
  // the day they start. Compact and works for sub-day or multi-day plans.
  const days = useMemo(() => {
    const map = new Map<string, AgentTaskItem[]>();
    for (const t of tasks) {
      const key = new Date(t.plannedStart).toISOString().slice(0, 10);
      const list = map.get(key) ?? [];
      list.push(t);
      map.set(key, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [tasks]);

  if (days.length === 0) return null;

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {days.map(([day, list]) => {
        const date = new Date(day);
        const isToday = day === new Date().toISOString().slice(0, 10);
        return (
          <div
            key={day}
            className={`flex flex-col gap-1.5 rounded-md border bg-card/30 p-2 ${
              isToday ? 'border-emerald-500/40 ring-1 ring-emerald-500/20' : 'border-border/60'
            }`}
          >
            <div className="flex items-baseline justify-between border-b border-white/10 pb-1">
              <span className="text-[10px] uppercase tracking-wider text-white/55">
                {date.toLocaleDateString([], { weekday: 'short' })}
              </span>
              <span className={`text-base font-semibold tabular-nums ${isToday ? 'text-emerald-400' : ''}`}>
                {date.getDate()}/{date.getMonth() + 1}
              </span>
            </div>
            <ul className="flex flex-col gap-1">
              {list.map((t) => (
                <li
                  key={t.id}
                  className={`flex items-center gap-1.5 rounded border px-1.5 py-1 text-[10px] ${STATUS_COLOR[t.status]}`}
                  title={`${t.agentName} — ${t.status} ${t.progressPct}%`}
                >
                  <span className="truncate flex-1">{t.title}</span>
                  <span className="shrink-0 tabular-nums opacity-80">{t.progressPct}%</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/* ──────────────── Progress list ──────────────── */

function ProgressListView({ tasks }: { tasks: AgentTaskItem[] }) {
  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; rows: AgentTaskItem[] }>();
    for (const t of tasks) {
      const entry = map.get(t.agentId) ?? { name: t.agentName, rows: [] };
      entry.rows.push(t);
      map.set(t.agentId, entry);
    }
    return Array.from(map.entries());
  }, [tasks]);

  return (
    <div className="flex flex-col gap-3">
      {grouped.map(([agentId, g]) => {
        const avg = Math.round(g.rows.reduce((s, t) => s + t.progressPct, 0) / g.rows.length);
        return (
          <div key={agentId} className="rounded-md border glass ring-soft border-white/10 bg-transparent rounded-2xl p-3">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <span className="font-mono text-sm text-foreground/90">{g.name}</span>
              <span className="text-[10px] uppercase tracking-wider text-white/55">
                {g.rows.length} task{g.rows.length > 1 ? 's' : ''} · {avg}% avg
              </span>
            </div>
            <ul className="flex flex-col gap-2">
              {g.rows.map((t) => (
                <li key={t.id} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="truncate">{t.title}</span>
                    <span className="shrink-0 tabular-nums text-white/55">{t.progressPct}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                      <div
                        className={`h-full transition-all duration-500 ${
                          t.status === 'completed'
                            ? 'bg-blue-500'
                            : t.status === 'blocked'
                              ? 'bg-amber-500'
                              : t.status === 'cancelled'
                                ? 'bg-red-500'
                                : 'bg-emerald-500'
                        }`}
                        style={{ width: `${t.progressPct}%` }}
                      />
                    </div>
                    <Badge variant="outline" className={`shrink-0 px-1 py-0 text-[9px] ${STATUS_COLOR[t.status]}`}>
                      {t.status.replace('_', ' ')}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
