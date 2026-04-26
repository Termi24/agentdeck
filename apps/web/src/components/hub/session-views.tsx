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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ACTIVE_STATUSES, LiveDot, relativeTime, statusClasses } from '@/components/session/shared';
import { listSessionAgents, type SessionAgent, type SessionListItem } from '@/lib/api';
import { usePollingInterval } from '@/lib/use-polling';

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

export function CompactAgentRow({ a }: { a: SessionAgent }) {
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

export function SessionTable({ sessions }: { sessions: SessionListItem[] }) {
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
                    <Link href={`/sessions/${s.id}`} className="flex items-center gap-2 group-hover:underline">
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
