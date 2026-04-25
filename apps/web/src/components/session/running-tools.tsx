'use client';
import { useEffect, useState } from 'react';
import { CheckCircle2, Wrench, XCircle, Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { listSessionToolCalls, type ToolCall } from '@/lib/api';
import { usePollingInterval } from '@/lib/use-polling';
import { formatDuration, relativeTime } from './shared';

export function RunningTools({ sessionId }: { sessionId: string }) {
  const [running, setRunning] = useState<ToolCall[]>([]);
  const [recent, setRecent] = useState<ToolCall[]>([]);
  const [now, setNow] = useState<number>(Date.now());

  usePollingInterval(
    async () => {
      try {
        const [r, c] = await Promise.all([
          listSessionToolCalls(sessionId, { status: 'running', limit: 20 }),
          listSessionToolCalls(sessionId, { limit: 10 }),
        ]);
        setRunning(r);
        setRecent(c.filter((x) => x.status !== 'running').slice(0, 5));
      } catch {
        /* ignore */
      }
    },
    8_000,
    [sessionId],
  );

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(tick);
  }, []);

  return (
    <Card className="flex h-full flex-col overflow-hidden border-border/60 bg-card/40">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 border-b border-border/40 px-4 py-2.5">
        <CardTitle className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Running tools
          {running.length > 0 && (
            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-400">
              {running.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full">
          <div className="flex flex-col p-3">
            {running.length === 0 ? (
              <p className="px-1 py-2 text-xs text-muted-foreground">no tool calls running</p>
            ) : (
              running.map((tc) => <RunningRow key={tc.id} tc={tc} now={now} />)
            )}

            {recent.length > 0 && (
              <>
                <Separator className="my-3" />
                <p className="mb-2 px-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  Recent completed
                </p>
                {recent.map((tc) => (
                  <RecentRow key={tc.id} tc={tc} />
                ))}
              </>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function RunningRow({ tc, now }: { tc: ToolCall; now: number }) {
  const elapsed = now - new Date(tc.startedAt).getTime();
  return (
    <div className="mb-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 p-2 text-xs last:mb-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-emerald-400" />
          <span className="truncate font-mono text-foreground">{tc.toolName}</span>
        </div>
        <span className="shrink-0 tabular-nums text-[10px] text-emerald-400">{formatDuration(elapsed)}</span>
      </div>
      <p className="mt-1 truncate text-[10px] text-muted-foreground">
        by <span className="font-mono">{tc.agentName}</span>
      </p>
      <p className="mt-1 line-clamp-2 font-mono text-[10px] text-muted-foreground/80">
        {summarize(tc.input)}
      </p>
    </div>
  );
}

function RecentRow({ tc }: { tc: ToolCall }) {
  const Icon: LucideIcon = tc.status === 'completed' ? CheckCircle2 : tc.status === 'failed' ? XCircle : Wrench;
  const tone = tc.status === 'completed' ? 'text-zinc-400' : tc.status === 'failed' ? 'text-red-400' : 'text-muted-foreground';
  return (
    <div className="flex items-center justify-between gap-2 py-1 text-[11px]">
      <div className="flex min-w-0 items-center gap-1.5">
        <Icon className={`h-3 w-3 shrink-0 ${tone}`} />
        <span className="truncate font-mono">{tc.toolName}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2 text-[10px] text-muted-foreground">
        <span className="tabular-nums">{formatDuration(tc.durationMs)}</span>
        <span>{relativeTime(tc.endedAt ?? tc.startedAt)}</span>
      </div>
    </div>
  );
}

function summarize(x: unknown): string {
  if (x === null || x === undefined) return '';
  if (typeof x === 'string') return x.slice(0, 120);
  try {
    const s = JSON.stringify(x);
    return s.slice(0, 120);
  } catch {
    return '';
  }
}
