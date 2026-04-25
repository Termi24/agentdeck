import type { Server as SocketIOServer, Socket } from 'socket.io';
import type { AgentDeckEvent } from '@agentdeck/shared';
import { events } from '@agentdeck/shared';
import { asc, eq } from 'drizzle-orm';
import { getDb } from './db.js';

export interface EventBus {
  emit(event: AgentDeckEvent): void;
  replayFor(socket: Socket, sessionId: string): void;
}

export function createEventBus(io: SocketIOServer): EventBus {
  return {
    emit(event) {
      const sessionId = 'sessionId' in event ? event.sessionId : undefined;
      if (sessionId) {
        io.to(`session:${sessionId}`).emit('event', event);
      } else {
        io.emit('event', event);
      }
    },
    replayFor(socket, sessionId) {
      const rows = getDb()
        .select({ payload: events.payload })
        .from(events)
        .where(eq(events.sessionId, sessionId))
        .orderBy(asc(events.id))
        .all();
      for (const row of rows) {
        socket.emit('event', row.payload);
      }
    },
  };
}
