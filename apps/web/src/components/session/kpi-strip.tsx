'use client';
import { Users, Wrench, MessageSquare, FlaskConical } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { SessionListItem } from '@/lib/api';

interface Props {
  session: SessionListItem | null;
  testBreakdown: { passed: number; failed: number; skipped: number };
}

export function KpiStrip({ session, testBreakdown }: Props) {
  const a = session?.runningAgentCount ?? 0;
  const at = session?.agentCount ?? 0;
  const t = session?.runningToolCallCount ?? 0;
  const tt = session?.toolCallCount ?? 0;
  const msg = session?.channelMessageCount ?? 0;
  const docs = session?.docCount ?? 0;

  return (
    <section aria-label="session kpis" className="grid grid-cols-2 gap-3 px-6 pt-4 md:grid-cols-4">
      <Kpi
        icon={Users}
        label="sub-agents"
        value={a}
        total={at}
        highlight={a > 0}
        hint={a > 0 ? `${a} active` : `${at} total`}
      />
      <Kpi
        icon={Wrench}
        label="tool calls"
        value={t}
        total={tt}
        highlight={t > 0}
        hint={t > 0 ? 'running now' : `${tt} completed`}
      />
      <Kpi icon={MessageSquare} label="channel" value={msg} hint={`${msg} message${msg === 1 ? '' : 's'}`} />
      <Kpi
        icon={FlaskConical}
        label="tests"
        value={session?.testResultCount ?? 0}
        breakdown={
          testBreakdown.passed + testBreakdown.failed + testBreakdown.skipped > 0 ? testBreakdown : undefined
        }
        suffix={
          docs > 0 ? <span className="text-[10px] text-muted-foreground">+{docs} doc{docs > 1 ? 's' : ''}</span> : null
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
  suffix,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  total?: number;
  highlight?: boolean;
  hint?: string;
  breakdown?: { passed: number; failed: number; skipped: number };
  suffix?: React.ReactNode;
}) {
  const display = total !== undefined && total !== value ? `${value}/${total}` : `${value}`;
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
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-baseline gap-2">
            <span
              className={`text-2xl font-semibold tabular-nums ${highlight ? 'text-emerald-400' : 'text-foreground'}`}
            >
              {display}
            </span>
            {suffix}
          </div>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
          {breakdown ? (
            <div className="mt-0.5 flex gap-2 text-[10px]">
              <span className="text-emerald-400">{breakdown.passed}✓</span>
              {breakdown.failed > 0 && <span className="text-red-400">{breakdown.failed}✗</span>}
              {breakdown.skipped > 0 && <span className="text-muted-foreground">{breakdown.skipped}○</span>}
            </div>
          ) : hint ? (
            <span className="mt-0.5 text-[10px] text-muted-foreground">{hint}</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
