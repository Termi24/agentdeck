import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket) return socket;
  const url = process.env.NEXT_PUBLIC_PROXY_URL ?? 'http://127.0.0.1:4317';
  socket = io(url, { path: '/ws', autoConnect: true, transports: ['websocket'] });
  return socket;
}
