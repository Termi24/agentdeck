import { io } from '/g/agentdeck/node_modules/.pnpm/socket.io-client@4.8.3/node_modules/socket.io-client/build/esm/index.js';
import http from 'node:http';

const HOST = '127.0.0.1', PORT = 4317;

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const start = process.hrtime.bigint();
    const r = http.request({
      host: HOST, port: PORT, method, path,
      headers: data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}
    }, (res) => {
      let chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const dur = Number(process.hrtime.bigint() - start) / 1e6;
        resolve({ status: res.statusCode, dur, body: Buffer.concat(chunks).toString('utf8') });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}
function pct(arr, p) {
  const s = [...arr].sort((a,b) => a-b);
  return s[Math.min(s.length-1, Math.floor(s.length * p))];
}

async function main() {
  const create = await req('POST', '/sessions', {
    projectId: 'perf-auditor-socket',
    prompt: 'socket throughput',
    title: 'perf socket-throughput',
    bridge: true,
    rootAgentName: 'perf-socket',
    rootAgentRole: 'auditor'
  });
  const { sessionId: sid, rootAgentId } = JSON.parse(create.body);
  console.error('Created socket session:', sid);

  const socket = io(`http://${HOST}:${PORT}`, {
    transports: ['websocket'],
    reconnection: false,
  });
  await new Promise((res, rej) => {
    socket.once('connect', res);
    socket.once('connect_error', rej);
    setTimeout(() => rej(new Error('socket connect timeout')), 5000);
  });
  console.error('socket connected:', socket.id);

  // Subscribe to session
  socket.emit('subscribe', { sessionId: sid });

  const pendingAcks = new Map(); // content -> postEndTime
  const deliveryDelays = []; // ms between POST resolution and socket delivery
  let receivedSingle = 0, receivedBatch = 0;

  socket.on('event', (ev) => {
    const c = ev?.payload?.content;
    if (c && pendingAcks.has(c)) {
      deliveryDelays.push(Date.now() - pendingAcks.get(c));
      pendingAcks.delete(c);
      receivedSingle++;
    }
  });
  socket.on('events:batch', (batch) => {
    if (Array.isArray(batch)) {
      for (const ev of batch) {
        const c = ev?.payload?.content;
        if (c && pendingAcks.has(c)) {
          deliveryDelays.push(Date.now() - pendingAcks.get(c));
          pendingAcks.delete(c);
          receivedBatch++;
        }
      }
    }
  });

  // Wait briefly to ensure subscription registered
  await new Promise(r => setTimeout(r, 200));

  console.error('--- Posting 500 single channel msgs and measuring socket delivery delay ---');
  const N = 500;
  for (let i = 0; i < N; i++) {
    const content = `socket-throughput-${i}-${Date.now()}`;
    const r = req('POST', `/sessions/${sid}/channel`, {
      fromAgentId: rootAgentId, fromAgentName: 'perf-socket', content
    });
    const t0 = Date.now();
    pendingAcks.set(content, t0);
    await r;
  }

  // Wait for trailing deliveries
  await new Promise(r => setTimeout(r, 2000));

  const out = {
    posted: N,
    delivered: deliveryDelays.length,
    lost: N - deliveryDelays.length,
    receivedSingle,
    receivedBatch,
    p50: deliveryDelays.length ? +pct(deliveryDelays, 0.5).toFixed(2) : null,
    p95: deliveryDelays.length ? +pct(deliveryDelays, 0.95).toFixed(2) : null,
    p99: deliveryDelays.length ? +pct(deliveryDelays, 0.99).toFixed(2) : null,
    max: deliveryDelays.length ? Math.max(...deliveryDelays) : null,
  };
  console.error('socket throughput:', JSON.stringify(out));

  socket.disconnect();
  await req('POST', `/sessions/${sid}/cancel`, {});
  console.error('cancelled', sid);

  process.stdout.write(JSON.stringify({ session: sid, ...out }, null, 2));
}

main().catch(e => { console.error('FATAL', e.stack); process.exit(1); });
