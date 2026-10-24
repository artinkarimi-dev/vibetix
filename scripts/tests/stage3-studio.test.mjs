import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createStudio } from '../stage3-studio.mjs';

const startStudio = async (script) => {
  const studio = createStudio({ runner: () => spawn(process.execPath, ['-e', script], { stdio: ['ignore', 'pipe', 'pipe'] }) });
  await new Promise((resolve) => studio.server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${studio.server.address().port}`;
  return { studio, url };
};

const post = (url, options = {}) => fetch(`${url}/api/start`, {
  method: 'POST', headers: { Origin: url, 'Content-Type': 'application/json', ...options.headers }, body: '{}',
});

const poll = async (url, phase) => {
  for (let i = 0; i < 100; i++) {
    const body = await (await fetch(`${url}/api/state`)).json();
    if (body.phase === phase) return body;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Studio did not reach phase ${phase}`);
};

test('local studio exposes live SSE snapshots, UI files, rejects cross-site trigger and prevents overlapping runs', async () => {
  const { studio, url } = await startStudio('setTimeout(()=>process.exit(1),280);');
  try {
    const html = await (await fetch(url)).text();
    assert.match(html, /VIBETIX/);
    assert.match(html, /نقشه زنده رقابت/);
    assert.equal((await fetch(`${url}/style.css`)).status, 200);
    assert.equal((await fetch(`${url}/app.js`)).status, 200);
    assert.equal((await fetch(`${url}/api/report`)).status, 404);
    const stream = await fetch(`${url}/api/events`);
    assert.match(stream.headers.get('content-type'), /text\/event-stream/);
    assert.equal((await post(url, { headers: { Origin: 'https://evil.example' } })).status, 403);
    assert.equal((await post(url)).status, 202);
    assert.equal((await post(url)).status, 409);
    await poll(url, 'failed');
    assert.equal((await fetch(`${url}/api/report`)).status, 404);
    await stream.body.cancel();
  } finally { await studio.close(); }
});

test('studio rejects a runner that exits zero but provides no database verification report', async () => {
  const { studio, url } = await startStudio('console.log("hello");');
  try {
    assert.equal((await post(url)).status, 202);
    const data = await poll(url, 'failed');
    assert.match(data.error, /Benchmark did not pass/);
  } finally { await studio.close(); }
});

test('studio accepts a verified result only after all 1000 per-request telemetry items and a successful runner exit', async () => {
  const report = {
    passed: true, runId: 'mock-verified', timestamp: '2026-10-22T00:00:00Z',
    holds: { wins: 10, conflicts: 990, unexpected: 0 },
    metrics: {
      totalRequests: 1000, elapsedMs: 500, requestsPerSecond: 2000,
      latencyMs: { p50: 3, p95: 5, p99: 8 }, byStatus: { '200': 10, '409': 990 },
      peakInFlight: 24, concurrencyLimit: 24,
    },
    database: { soldSeats: 10, finalHolds: 0, orderCount: 10, itemCount: 10, ticketCount: 10, paymentCount: 10 },
  };
  const worker = `
const emit=(name,body)=>process.stdout.write(name+'='+JSON.stringify(body)+'\\n');
emit('STAGE3_EVENT_JSON',{type:'phase',phase:'racing'});
emit('STAGE3_EVENT_JSON',{type:'progress', entries:Array.from({length:1000},(_,index)=>({index,outcome:index<10?'won':'lost'}))});
emit('STAGE3_COMPLETE_JSON',{type:'complete',report:${JSON.stringify(report)},reportFile:'artifacts/mock.json'});
`;
  const { studio, url } = await startStudio(worker);
  try {
    assert.equal((await post(url)).status, 202);
    const state = await poll(url, 'passed');
    assert.deepEqual([state.completed, state.won, state.lost, state.errors], [1000, 10, 990, 0]);
    assert.equal(state.result.database.ticketCount, 10);
    assert.equal((await fetch(`${url}/api/report`)).status, 200);
  } finally { await studio.close(); }
});
