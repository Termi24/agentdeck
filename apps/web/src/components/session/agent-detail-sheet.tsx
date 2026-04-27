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
      <SheetContent side="right" className="flex w-[90vw] flex-col gap-0 border-white/10 bg-[#0a0814] p-0 sm:max-w-2xl">
        {agent && (
          <>
            <SheetHeader className="border-b border-white/10 p-6 pb-4 text-left">
              <div className="flex items-start justify-between gap-3">
                <SheetTitle className="font-mono flex items-center gap-2 text-base">
                  {active && <LiveDot />}
                  {agent.name}
                </SheetTitle>
                <div className="flex shrink-0 items-center gap-1">
                  <Badge variant="outline" className={`rounded-full px-2 py-0 text-[10px] capitalize ${statusClasses(agent.status)}`}>
                    {agent.status.replace('_', ' ')}
                  </Badge>
                  {agent.role && (
                    <Badge variant="outline" className="rounded-full border-white/15 bg-white/5 px-2 py-0 text-[10px] text-white/70">
                      {agent.role}
                    </Badge>
                  )}
                  {agent.parentAgentId === null ? (
                    <Badge variant="outline" className="grad-accent rounded-full border-0 px-2 py-0 text-[10px] text-white">
                      orchestrator
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="rounded-full border-white/15 bg-white/5 px-2 py-0 text-[10px] text-white/70">
                      sub-agent
                    </Badge>
                  )}
                </div>
              </div>
              <SheetDescription className="font-mono tabular flex flex-wrap gap-3 pt-1 text-[11px] text-white/55">
                <span>
                  started {relativeTime(agent.startedAt)}
                </span>
                {agent.endedAt && (
                  <span>
                    ended {relativeTime(agent.endedAt)}
                  </span>
                )}
                {agent.model && (
                  <span>
                    model {agent.model}
                  </span>
                )}
                <span>
                  tokens {agent.tokensIn.toLocaleString()}↓ {agent.tokensOut.toLocaleString()}↑
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

                <Separator className="bg-white/10" />

                <section>
                  <h3 className="mb-2 text-[10px] font-medium uppercase tracking-wider text-white/55">
                    Context / skill / prompt
                  </h3>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    {agent.prompt ? (
                      <pre className="font-mono whitespace-pre-wrap break-words text-[11.5px] leading-relaxed text-white/85">
                        {agent.prompt}
                      </pre>
                    ) : (
                      <p className="text-[12px] italic text-white/45">no prompt recorded</p>
                    )}
                  </div>
                </section>

                <Separator className="bg-white/10" />

                <section>
                  <h3 className="mb-2 flex items-center gap-2 text-[10px] font-medium uppercase tracking-wider text-white/55">
                    Direct messages
                    {agent.dmCount > 0 && (
                      <span className="font-mono tabular rounded-full border border-white/15 bg-white/5 px-1.5 py-0 text-[10px] text-white/70">
                        {agent.dmCount}
                      </span>
                    )}
                  </h3>
                  {loadingDms && dms.length === 0 ? (
                    <p className="text-xs text-white/45">loading…</p>
                  ) : dms.length === 0 ? (
                    <p className="text-xs text-white/45">
                      no direct messages involving this agent yet
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-2">
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
    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
      <p
        className={`${mono ? 'font-mono' : 'font-mono tabular'} text-[15px] font-semibold ${
          highlight ? 'text-emerald-200' : 'text-white'
        }`}
      >
        {value}
      </p>
      <p className="text-[9px] uppercase tracking-wider text-white/45">{label}</p>
      {subvalue !== undefined && subvalue > 0 && (
        <p className="font-mono tabular mt-0.5 text-[10px] text-emerald-200">
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
      className={`rounded-2xl border p-3 text-xs ${
        outgoing ? 'border-violet-300/25 bg-violet-500/10' : 'border-white/10 bg-white/5'
      }`}
    >
      <div className="mb-1 flex items-center justify-between gap-2 text-[10px] text-white/45">
        <span>
          <span className="font-mono text-white/85">{m.fromAgentName}</span>
          <span className="mx-1">→</span>
          <span className="font-mono text-white/55">
            {outgoing ? m.toAgentId.slice(0, 8) : 'me'}
          </span>
        </span>
        <span className="font-mono tabular">{relativeTime(m.createdAt)}</span>
      </div>
      <p className="whitespace-pre-wrap break-words text-white/85">{m.content}</p>
    </li>
  );
}
