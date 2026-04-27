'use client';
import Link from 'next/link';
import { useState } from 'react';
import {
  FileText,
  FlaskConical,
  MessageSquare,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  ACTIVE_STATUSES,
  LiveDot,
  relativeTime,
  statusClasses,
  statusGlow,
} from '@/components/session/shared';
import { listSessionAgents, type SessionAgent, type SessionListItem } from '@/lib/api';
import { usePollingInterval } from '@/lib/use-polling';
import { cn } from '@/lib/utils';

const LIVE_WINDOW_MS = 10_000;

export function SessionCard({ s }: { s: SessionListItem }) {
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
      <article
        className={cn(
          'glass ring-soft relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 p-5 transition-all',
          'hover:border-white/20 hover:bg-white/[0.06]',
          isLive && statusGlow(s.status, true),
        )}
      >
        <div
          className={cn(
            'pointer-events-none absolute -right-12 -top-12 size-40 rounded-full blur-3xl',
            isLive ? 'bg-emerald-500/15' : 'bg-violet-500/10',
          )}
          aria-hidden
        />

        <div className="flex items-start gap-2">
          <Link href={`/sessions/${s.id}`} className="flex min-w-0 flex-1 items-center gap-2 hover:underline">
            {isLive && <LiveDot />}
            <h3 className="line-clamp-1 text-[15px] font-medium leading-tight">
              {s.title || s.id.slice(0, 8)}
            </h3>
          </Link>
          <div className="flex shrink-0 gap-1.5">
            <span
              className={cn(
                'inline-flex h-6 items-center rounded-full border px-2 text-[10.5px] capitalize',
                statusClasses(s.status),
              )}
            >
              {s.status.replace('_', ' ')}
            </span>
            <span className="font-mono inline-flex h-6 items-center rounded-full border border-white/15 bg-white/5 px-2 text-[10.5px] uppercase tracking-wider text-white/65">
              {s.isBridge ? 'CLI' : 'SDK'}
            </span>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-white/55">
          <span className="font-mono">{s.projectId}</span>
          <span>started {relativeTime(s.startedAt)}</span>
          {isActive && s.lastActivityAt && (
            <span className={isLive ? 'text-emerald-200' : ''}>
              last event {relativeTime(s.lastActivityAt)}
            </span>
          )}
          {s.endedAt && !isActive && <span>ended {relativeTime(s.endedAt)}</span>}
        </div>

        <div className="mt-5 grid grid-cols-4 gap-3">
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
          <div className="mt-5 border-t border-white/10 pt-4">
            <div className="mb-1.5 flex items-center justify-between gap-2 text-[10.5px] uppercase tracking-wider text-white/45">
              <span>last channel</span>
              <span className="normal-case tracking-normal">{relativeTime(s.lastChannelMessage.at)}</span>
            </div>
            <p className="line-clamp-2 text-[13px] text-white/85">
              <span className="font-mono text-white/60">{s.lastChannelMessage.fromAgentName}</span>
              <span className="text-white/30"> → </span>
              {s.lastChannelMessage.content}
            </p>
          </div>
        )}

        {s.testResultCount > 0 && (
          <div className="mt-3 flex items-center gap-1.5 text-[11.5px] text-white/55">
            <FlaskConical className="h-3 w-3" />
            <span>{s.testResultCount} test result{s.testResultCount > 1 ? 's' : ''}</span>
          </div>
        )}

        <div className="mt-auto flex items-center justify-between border-t border-white/10 pt-3">
          <button
            type="button"
            className="text-[11px] text-white/55 underline-offset-2 hover:text-white hover:underline disabled:no-underline disabled:opacity-50"
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
            className="text-[11px] text-white/55 hover:text-white"
          >
            dashboard →
          </Link>
        </div>

        {expanded && (
          <div className="mt-3 flex flex-col gap-1 rounded-2xl border border-white/10 bg-white/5 p-3">
            {agents === null ? (
              <p className="text-[11px] text-white/45">loading…</p>
            ) : agents.length === 0 ? (
              <p className="text-[11px] text-white/45">no agents</p>
            ) : (
              agents.map((a) => <CompactAgentRow key={a.id} a={a} />)
            )}
          </div>
        )}

        <p className="font-mono mt-3 text-[10px] text-white/30">{s.id}</p>
      </article>
    </li>
  );
}

export function MicroStat({
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

export function CompactAgentRow({ a }: { a: SessionAgent }) {
  const active = ACTIVE_STATUSES.includes(a.status);
  const isSub = a.parentAgentId !== null;
  return (
    <div className="flex items-center justify-between gap-2 text-[11px]">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="shrink-0 text-white/45">{isSub ? '└─' : '●'}</span>
        <span className="font-mono truncate text-white/85">{a.name}</span>
        {a.role && <span className="shrink-0 text-[9px] text-white/45">({a.role})</span>}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {a.runningToolCallCount > 0 && (
          <span className="rounded-full bg-emerald-400/15 px-1.5 text-[9px] text-emerald-200">
            {a.runningToolCallCount}●
          </span>
        )}
        <Badge variant="outline" className={`rounded-full px-1.5 py-0 text-[9px] capitalize ${statusClasses(a.status)}`}>
          {active ? a.status.replace('_', ' ') : a.status}
        </Badge>
      </div>
    </div>
  );
}

export function SessionTable({ sessions }: { sessions: SessionListItem[] }) {
  return (
    <Card className="glass ring-soft overflow-hidden rounded-2xl border-white/10 bg-transparent">
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead className="border-b border-white/10 text-[10px] uppercase tracking-wider text-white/50">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Session</th>
              <th className="px-4 py-2.5 text-left font-medium">Project</th>
              <th className="px-4 py-2.5 text-left font-medium">Status</th>
              <th className="px-4 py-2.5 text-right font-medium">Agents</th>
              <th className="px-4 py-2.5 text-right font-medium">Tools</th>
              <th className="px-4 py-2.5 text-right font-medium">Msgs</th>
              <th className="px-4 py-2.5 text-right font-medium">Docs</th>
              <th className="px-4 py-2.5 text-right font-medium">Last event</th>
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
                  className="group cursor-pointer border-b border-white/5 transition-colors hover:bg-white/5"
                >
                  <td className="px-4 py-2">
                    <Link href={`/sessions/${s.id}`} className="flex items-center gap-2 group-hover:underline">
                      {isLive && <LiveDot />}
                      <span className="max-w-[28ch] truncate text-white">{s.title || s.id.slice(0, 8)}</span>
                      <span className="font-mono inline-flex h-5 items-center rounded-full border border-white/15 bg-white/5 px-1.5 text-[10px] uppercase tracking-wider text-white/65">
                        {s.isBridge ? 'CLI' : 'SDK'}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <span className="font-mono text-white/55">{s.projectId}</span>
                  </td>
                  <td className="px-4 py-2">
                    <Badge variant="outline" className={`rounded-full px-2 py-0 text-[10px] capitalize ${statusClasses(s.status)}`}>
                      {s.status.replace('_', ' ')}
                    </Badge>
                  </td>
                  <TableNum value={s.runningAgentCount} total={s.agentCount} highlight />
                  <TableNum value={s.runningToolCallCount} total={s.toolCallCount} highlight />
                  <TableNum value={s.channelMessageCount} />
                  <TableNum value={s.docCount} />
                  <td className="font-mono px-4 py-2 text-right tabular text-white/55">
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
    highlight && value > 0 ? 'text-emerald-200' : value > 0 ? 'text-white' : 'text-white/45';
  return <td className={`font-mono px-4 py-2 text-right tabular ${cls}`}>{display}</td>;
}
