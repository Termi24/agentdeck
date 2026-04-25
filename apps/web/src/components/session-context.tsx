'use client';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { AgentDeckEvent } from '@agentdeck/shared';
import { useSessionEvents } from '@/hooks/use-session-events';

export interface PendingInputRequest {
  waitId: string;
  agentId: string | null;
  agentName: string | null;
  prompt: string | null;
  since: string;
}

interface SessionContextValue {
  sessionId: string;
  events: AgentDeckEvent[];
  connected: boolean;
  totalEvents: number;
  scrubIndex: number | null;
  setScrubIndex: (idx: number | null) => void;
  isLive: boolean;
  pendingInputs: PendingInputRequest[];
}

const SessionContext = createContext<SessionContextValue | null>(null);

function foldPendingInputs(events: AgentDeckEvent[]): PendingInputRequest[] {
  const open = new Map<string, PendingInputRequest>();
  for (const e of events) {
    if (e.type === 'user.input.awaiting') {
      open.set(e.waitId, {
        waitId: e.waitId,
        agentId: e.agentId ?? null,
        agentName: e.agentName ?? null,
        prompt: e.prompt ?? null,
        since: e.at,
      });
    } else if (e.type === 'user.input.resolved') {
      open.delete(e.waitId);
    }
  }
  return Array.from(open.values());
}

export function SessionProvider({ sessionId, children }: { sessionId: string; children: ReactNode }) {
  const { events, connected } = useSessionEvents(sessionId);
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);

  const value = useMemo<SessionContextValue>(() => {
    const isLive = scrubIndex === null;
    const sliced = isLive ? events : events.slice(0, Math.min(scrubIndex + 1, events.length));
    return {
      sessionId,
      events: sliced,
      connected,
      totalEvents: events.length,
      scrubIndex,
      setScrubIndex,
      isLive,
      pendingInputs: isLive ? foldPendingInputs(events) : foldPendingInputs(sliced),
    };
  }, [sessionId, events, connected, scrubIndex]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
