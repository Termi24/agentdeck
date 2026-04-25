'use client';
import { useEffect, useState } from 'react';
import type { AgentDeckEvent } from '@agentdeck/shared';
import { getSocket } from '@/lib/socket';

export interface SessionEventState {
  events: AgentDeckEvent[];
  connected: boolean;
}

export function useSessionEvents(sessionId: string): SessionEventState {
  const [events, setEvents] = useState<AgentDeckEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    const socket = getSocket();

    const onConnect = () => {
      setConnected(true);
      socket.emit('session:join', sessionId);
    };
    const onDisconnect = () => setConnected(false);
    const onEvent = (event: AgentDeckEvent) => {
      if ('sessionId' in event && event.sessionId !== sessionId) return;
      setEvents((prev) => [...prev, event]);
    };
    // Initial replay arrives as a single batch from the proxy — append all
    // at once so React renders one update instead of 5000.
    const onBatch = (batch: AgentDeckEvent[]) => {
      const filtered = batch.filter((e) => !('sessionId' in e) || e.sessionId === sessionId);
      if (filtered.length === 0) return;
      setEvents((prev) => [...prev, ...filtered]);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('event', onEvent);
    socket.on('events:batch', onBatch);

    if (socket.connected) onConnect();

    return () => {
      socket.emit('session:leave', sessionId);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('event', onEvent);
      socket.off('events:batch', onBatch);
    };
  }, [sessionId]);

  return { events, connected };
}
