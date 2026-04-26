import http from 'node:http';

const HOST = '127.0.0.1';
const PORT = 4317;

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
  const i = Math.min(s.length-1, Math.floor(s.length * p));
  return s[i];
}
function summary(name, arr) {
  return { name, n: arr.length, p50: +pct(arr,0.5).toFixed(2), p95: +pct(arr,0.95).toFixed(2), p99: +pct(arr,0.99).toFixed(2), min: +Math.min(...arr).toFixed(2), max: +Math.max(...arr).toFixed(2), mean: +(arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(2) };
}

async function timeN(n, fn) {
  const out = [];
  for (let i=0;i<n;i++) {
    const r = await fn(i);
    out.push(r.dur);
  }
  return out;
}

async function main() {
  const out = { startedAt: new Date().toISOString() };

  const list = await req('GET', '/sessions');
  const sessions = JSON.parse(list.body).sessions || [];
  const richest = sessions
    .map(s => ({...s, score: (s.channelMessageCount||0)+(s.toolCallCount||0)+(s.docCount||0)+(s.testResultCount||0)}))
    .sort((a,b) => b.score - a.score)[0];
  console.error('Hot session:', richest.id, 'score=', richest.score);
  out.hotSession = { id: richest.id, score: richest.score };

  console.error('--- Hot endpoint p50/p95 (N=200) ---');
  const endpoints = [
    ['GET /sessions', () => req('GET', '/sessions')],
    [`GET /sessions/:id`, () => req('GET', `/sessions/${richest.id}`)],
    [`GET /sessions/:id/agents`, () => req('GET', `/sessions/${richest.id}/agents`)],
    [`GET /sessions/:id/tool-calls`, () => req('GET', `/sessions/${richest.id}/tool-calls`)],
    [`GET /sessions/:id/channel`, () => req('GET', `/sessions/${richest.id}/channel`)],
    [`GET /sessions/:id/events`, () => req('GET', `/sessions/${richest.id}/events`)],
  ];
  out.hotEndpoints = [];
  for (const [n,fn] of endpoints) { await fn(); }
  for (const [name, fn] of endpoints) {
    const arr = await timeN(200, fn);
    const s = summary(name, arr);
    out.hotEndpoints.push(s);
    console.error(JSON.stringify(s));
  }

  console.error('--- Creating synthetic session ---');
  const create = await req('POST', '/sessions', {
    projectId: 'perf-auditor-probe', prompt: 'perf bench',
    title: 'perf-auditor 5k events probe',
    bridge: true,
    rootAgentName: 'perf-probe',
    rootAgentRole: 'auditor'
  });
  const created = JSON.parse(create.body);
  const sid = created.sessionId || created.id;
  const rootAgentId = created.rootAgentId;
  console.error('Created:', sid, rootAgentId);
  out.syntheticSession = { id: sid, rootAgentId };

  console.error('--- Bulk insert 5000 channel msgs ---');
  const bulkStart = Date.now();
  const bulkBatchTimes = [];
  for (let i=0;i<5000;i+=500) {
    const items = Array.from({length: 500}, (_,k) => ({
      fromAgentId: rootAgentId, fromAgentName: 'perf-probe', content: `bulk-msg-${i+k}`
    }));
    const t0 = Date.now();
    const r = await req('POST', `/sessions/${sid}/channel/bulk`, { messages: items });
    bulkBatchTimes.push(Date.now() - t0);
    if (r.status !== 200 && r.status !== 201) {
      console.error('bulk failed', r.status, r.body.slice(0,300));
      break;
    }
  }
  const bulkDur = Date.now() - bulkStart;
  out.bulkInsert = { count: 5000, durMs: bulkDur, eps: +(5000/(bulkDur/1000)).toFixed(0), batchTimes: bulkBatchTimes };
  console.error('Bulk:', bulkDur, 'ms,', out.bulkInsert.eps, 'eps');

  const ev = await req('GET', `/sessions/${sid}/events?limit=10000`);
  let evCount = 0;
  try {
    const j = JSON.parse(ev.body);
    evCount = j.events?.length || j.length || 0;
  } catch (e) { console.error('events parse', e.message, ev.body.slice(0,200)); }
  out.syntheticSession.eventCount = evCount;
  console.error('events count:', evCount);

  console.error('--- Hot reads on 5k session (N=100) ---');
  const fatEndpoints = [
    [`GET /sessions/:id (5k)`, () => req('GET', `/sessions/${sid}`)],
    [`GET /sessions/:id/events?limit=5000`, () => req('GET', `/sessions/${sid}/events?limit=5000`)],
    [`GET /sessions/:id/channel (5k)`, () => req('GET', `/sessions/${sid}/channel`)],
  ];
  out.fatEndpoints = [];
  for (const [n,fn] of fatEndpoints) await fn();
  for (const [name, fn] of fatEndpoints) {
    const arr = await timeN(100, fn);
    const s = summary(name, arr);
    out.fatEndpoints.push(s);
    console.error(JSON.stringify(s));
  }

  console.error('--- Single POST throughput (N=500) ---');
  const perCall = [];
  const tStart = Date.now();
  for (let i=0;i<500;i++) {
    const r = await req('POST', `/sessions/${sid}/channel`, {
      fromAgentId: rootAgentId, fromAgentName: 'perf-probe', content: `single-${i}`
    });
    perCall.push(r.dur);
  }
  const tDur = Date.now() - tStart;
  out.singleThroughput = { ...summary('POST /channel', perCall), durMs: tDur, eps: +(500/(tDur/1000)).toFixed(0) };
  console.error(JSON.stringify(out.singleThroughput));

  console.error('--- Cancel synthetic ---');
  const cancel = await req('POST', `/sessions/${sid}/cancel`, {});
  out.cleanup = { status: cancel.status };

  process.stdout.write(JSON.stringify(out, null, 2));
}

main().catch(e => { console.error('FATAL', e.stack); process.exit(1); });
