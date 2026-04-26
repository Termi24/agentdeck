import { io } from 'socket.io-client';
import fs from 'node:fs';

const SID = process.argv[2];
if (!SID) { console.error('usage: probe.mjs <sessionId>'); process.exit(2); }

const s = io('http://127.0.0.1:4317/', { path: '/ws', transports: ['websocket'] });
const out = { sessionId: SID, batch: [], deltas: [], connectedAt: null };
const TIMEOUT = 8000;

s.on('connect', () => {
  out.connectedAt = new Date().toISOString();
  s.emit('session:join', SID);
});
s.on('events:batch', (rows) => {
  out.batch = rows;
});
s.on('event', (e) => out.deltas.push(e));

setTimeout(() => {
  fs.writeFileSync(process.argv[3] || `events-${SID}.json`, JSON.stringify(out, null, 2));
  console.log(`batch=${out.batch.length} deltas=${out.deltas.length}`);
  s.disconnect();
  process.exit(0);
}, TIMEOUT);
