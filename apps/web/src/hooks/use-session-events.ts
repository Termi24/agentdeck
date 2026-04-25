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

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('event', onEvent);

    if (socket.connected) onConnect();

    return () => {
      socket.emit('session:leave', sessionId);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('event', onEvent);
    };
  }, [sessionId]);

  return { events, connected };
}
