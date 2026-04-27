'use client';
import { CalendarRange, Users, Wrench, MessageSquare, FlaskConical } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { SessionListItem } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Props {
  session: SessionListItem | null;
  testBreakdown: { passed: number; failed: number; skipped: number };
  planningBreakdown: { planned: number; inProgress: number; completed: number; blocked: number };
}

type Tone = 'violet' | 'pink' | 'cyan' | 'emerald' | 'amber';

const TONE_ORB: Record<Tone, string> = {
  violet: 'bg-violet-500/15',
  pink: 'bg-pink-500/15',
  cyan: 'bg-cyan-400/15',
  emerald: 'bg-emerald-400/15',
  amber: 'bg-amber-400/15',
};

export function KpiStrip({ session, testBreakdown, planningBreakdown }: Props) {
  const a = session?.runningAgentCount ?? 0;
  const at = session?.agentCount ?? 0;
  const t = session?.runningToolCallCount ?? 0;
  const tt = session?.toolCallCount ?? 0;
  const msg = session?.channelMessageCount ?? 0;
  const docs = session?.docCount ?? 0;
  const planTotal =
    planningBreakdown.planned +
    planningBreakdown.inProgress +
    planningBreakdown.completed +
    planningBreakdown.blocked;

  return (
    <section aria-label="session kpis" className="grid grid-cols-2 gap-3 pt-5 md:grid-cols-5">
      <Kpi
        icon={Users}
        label="sub-agents"
        value={a}
        total={at}
        highlight={a > 0}
        hint={a > 0 ? `${a} active` : `${at} total`}
        tone="violet"
      />
      <Kpi
        icon={Wrench}
        label="tool calls"
        value={t}
        total={tt}
        highlight={t > 0}
        hint={t > 0 ? 'running now' : `${tt} completed`}
        tone="pink"
      />
      <Kpi
        icon={CalendarRange}
        label="planning"
        value={planTotal}
        highlight={planningBreakdown.inProgress > 0 || planningBreakdown.blocked > 0}
        planning={planTotal > 0 ? planningBreakdown : undefined}
        tone="cyan"
      />
      <Kpi
        icon={MessageSquare}
        label="channel"
        value={msg}
        hint={`${msg} message${msg === 1 ? '' : 's'}`}
        tone="amber"
      />
      <Kpi
        icon={FlaskConical}
        label="tests"
        value={session?.testResultCount ?? 0}
        breakdown={
          testBreakdown.passed + testBreakdown.failed + testBreakdown.skipped > 0 ? testBreakdown : undefined
        }
        tone="emerald"
        suffix={
          docs > 0 ? <span className="text-[10px] text-white/45">+{docs} doc{docs > 1 ? 's' : ''}</span> : null
        }
      />
    </section>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  total,
  highlight,
  hint,
  breakdown,
  planning,
  suffix,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  total?: number;
  highlight?: boolean;
  hint?: string;
  breakdown?: { passed: number; failed: number; skipped: number };
  planning?: { planned: number; inProgress: number; completed: number; blocked: number };
  suffix?: React.ReactNode;
  tone: Tone;
}) {
  const display = total !== undefined && total !== value ? `${value}/${total}` : `${value}`;
  return (
    <div className="glass ring-soft relative overflow-hidden rounded-2xl border border-white/10 p-4">
      <div className={cn('absolute -right-6 -top-6 size-24 rounded-full blur-2xl', TONE_ORB[tone])} aria-hidden />
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-white/55">
        <Icon className="size-3.5" />
        <span>{label}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span
          className={cn(
            'font-mono tabular text-[26px] font-semibold leading-none tracking-tight',
            highlight ? 'text-emerald-200' : value > 0 ? 'text-white' : 'text-white/45',
          )}
        >
          {display}
        </span>
        {suffix}
      </div>
      {breakdown ? (
        <div className="mt-2 flex gap-2 text-[11px]">
          <span className="text-emerald-200">{breakdown.passed} ✓</span>
          {breakdown.failed > 0 && <span className="text-rose-300">{breakdown.failed} ✗</span>}
          {breakdown.skipped > 0 && <span className="text-white/45">{breakdown.skipped} ○</span>}
        </div>
      ) : planning ? (
        <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
          {planning.inProgress > 0 && <span className="text-emerald-200">{planning.inProgress} ▸</span>}
          {planning.blocked > 0 && <span className="text-amber-200">{planning.blocked} !</span>}
          {planning.completed > 0 && <span className="text-cyan-200">{planning.completed} ✓</span>}
          {planning.planned > 0 && <span className="text-white/55">{planning.planned} ○</span>}
        </div>
      ) : hint ? (
        <span className="mt-2 block text-[11px] text-white/55">{hint}</span>
      ) : null}
    </div>
  );
}
