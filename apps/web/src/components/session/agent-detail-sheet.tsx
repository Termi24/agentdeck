'use client';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { listSessionDms, type DirectMessage, type SessionAgent } from '@/lib/api';
import { usePollingInterval } from '@/lib/use-polling';
import { LiveDot, relativeTime, statusClasses, ACTIVE_STATUSES } from './shared';

interface Props {
  sessionId: string;
  agent: SessionAgent | null;
  onOpenChange: (open: boolean) => void;
}

export function AgentDetailSheet({ sessionId, agent, onOpenChange }: Props) {
  const [dms, setDms] = useState<DirectMessage[]>([]);
  const [loadingDms, setLoadingDms] = useState(false);

  usePollingInterval(
    async () => {
      if (!agent) return;
      setLoadingDms(true);
      try {
        const rows = await listSessionDms(sessionId, { agentId: agent.id, limit: 200 });
        setDms(rows);
      } catch {
        setDms([]);
      } finally {
        setLoadingDms(false);
      }
    },
    10_000,
    [agent?.id, sessionId],
  );

  const active = agent ? ACTIVE_STATUSES.includes(agent.status) : false;

  return (
    <Sheet open={!!agent} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[90vw] flex-col gap-0 p-0 sm:max-w-2xl">
        {agent && (
          <>
            <SheetHeader className="border-b border-border/40 p-6 pb-4 text-left">
              <div className="flex items-start justify-between gap-3">
                <SheetTitle className="flex items-center gap-2 font-mono text-base">
                  {active && <LiveDot />}
                  {agent.name}
                </SheetTitle>
                <div className="flex shrink-0 items-center gap-1">
                  <Badge variant="outline" className={`text-[10px] ${statusClasses(agent.status)}`}>
                    {agent.status.replace('_', ' ')}
                  </Badge>
                  {agent.role && (
                    <Badge variant="outline" className="text-[10px]">
                      {agent.role}
                    </Badge>
                  )}
                  {agent.parentAgentId === null ? (
                    <Badge variant="outline" className="text-[10px] text-primary">
                      orchestrator
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      sub-agent
                    </Badge>
                  )}
                </div>
              </div>
              <SheetDescription className="flex flex-wrap gap-3 pt-1 text-[11px]">
                <span>
                  started <span className="tabular-nums">{relativeTime(agent.startedAt)}</span>
                </span>
                {agent.endedAt && (
                  <span>
                    ended <span className="tabular-nums">{relativeTime(agent.endedAt)}</span>
                  </span>
                )}
                {agent.model && (
                  <span>
                    model <span className="font-mono">{agent.model}</span>
                  </span>
                )}
                <span>
                  tokens{' '}
                  <span className="font-mono tabular-nums">
                    {agent.tokensIn.toLocaleString()}↓ {agent.tokensOut.toLocaleString()}↑
                  </span>
                </span>
              </SheetDescription>
            </SheetHeader>

            <ScrollArea className="flex-1">
              <div className="flex flex-col gap-5 p-6">
                <div className="grid grid-cols-4 gap-2">
                  <DetailStat label="channel" value={agent.channelMessageCount} />
                  <DetailStat label="DMs" value={agent.dmCount} highlight={agent.dmCount > 0} />
                  <DetailStat
                    label="tool calls"
                    value={agent.toolCallCount}
                    subvalue={agent.runningToolCallCount}
                    subLabel="running"
                    highlight={agent.runningToolCallCount > 0}
                  />
                  <DetailStat label="id" mono value={agent.id.slice(0, 8)} />
                </div>

                <Separator />

                <section>
                  <h3 className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Context / skill / prompt
                  </h3>
                  <div className="rounded-md border border-border/60 bg-muted/20 p-3 font-mono text-[11px] leading-relaxed">
                    {agent.prompt ? (
                      <pre className="whitespace-pre-wrap break-words">{agent.prompt}</pre>
                    ) : (
                      <p className="italic text-muted-foreground">no prompt recorded</p>
                    )}
                  </div>
                </section>

                <Separator />

                <section>
                  <h3 className="mb-2 flex items-center gap-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Direct messages
                    {agent.dmCount > 0 && (
                      <Badge variant="outline" className="text-[9px]">
                        {agent.dmCount}
                      </Badge>
                    )}
                  </h3>
                  {loadingDms && dms.length === 0 ? (
                    <p className="text-xs text-muted-foreground">loading…</p>
                  ) : dms.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      no direct messages involving this agent yet
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {dms.map((m) => (
                        <DmRow key={m.id} m={m} selfId={agent.id} />
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DetailStat({
  label,
  value,
  subvalue,
  subLabel,
  mono,
  highlight,
}: {
  label: string;
  value: number | string;
  subvalue?: number;
  subLabel?: string;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-md border border-border/50 bg-muted/20 px-2 py-1.5">
      <p
        className={`${mono ? 'font-mono' : 'tabular-nums'} text-sm font-semibold ${
          highlight ? 'text-emerald-400' : 'text-foreground'
        }`}
      >
        {value}
      </p>
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
      {subvalue !== undefined && subvalue > 0 && (
        <p className="mt-0.5 text-[9px] text-emerald-400 tabular-nums">
          {subvalue} {subLabel}
        </p>
      )}
    </div>
  );
}

function DmRow({ m, selfId }: { m: DirectMessage; selfId: string }) {
  const outgoing = m.fromAgentId === selfId;
  return (
    <li
      className={`rounded-md border border-border/40 p-2 text-xs ${
        outgoing ? 'bg-primary/5' : 'bg-muted/10'
      }`}
    >
      <div className="mb-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span>
          <span className="font-mono text-foreground/80">{m.fromAgentName}</span>
          <span className="mx-1">→</span>
          <span className="font-mono text-foreground/60">
            {outgoing ? m.toAgentId.slice(0, 8) : 'me'}
          </span>
        </span>
        <span className="tabular-nums">{relativeTime(m.createdAt)}</span>
      </div>
      <p className="whitespace-pre-wrap break-words text-foreground/90">{m.content}</p>
    </li>
  );
}
