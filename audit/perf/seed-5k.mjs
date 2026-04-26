import http from 'node:http';
function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({
      host: '127.0.0.1', port: 4317, method, path,
      headers: data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}
    }, (res) => {
      let chunks = []; res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}
const create = await req('POST', '/sessions', {
  projectId: 'perf-auditor-ui', prompt: 'ui render bench', title: 'perf 5k-events UI',
  bridge: true, rootAgentName: 'perf-ui', rootAgentRole: 'auditor'
});
const { sessionId, rootAgentId } = JSON.parse(create.body);
const t0 = Date.now();
for (let i=0;i<5000;i+=500) {
  const items = Array.from({length:500},(_,k)=>({fromAgentId:rootAgentId,fromAgentName:'perf-ui',content:`bulk-${i+k}`}));
  await req('POST', `/sessions/${sessionId}/channel/bulk`, { messages: items });
}
const dur = Date.now() - t0;
const verify = await req('GET', `/sessions/${sessionId}`);
console.log(JSON.stringify({ sessionId, durMs: dur, eps: Math.round(5000/(dur/1000)), session: JSON.parse(verify.body) }));
