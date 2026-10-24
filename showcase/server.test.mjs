import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemoServer } from './server.mjs';

let server;
let origin;
before(async () => {
  server = createDemoServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise(resolve => server.close(resolve)); });

test('home page and health are served independently of catalog/database', async () => {
  const page = await fetch(origin);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /VIBETIX/);
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
  const health = await fetch(`${origin}/api/demo/health`);
  assert.equal((await health.json()).ok, true);
});

test('CSRF-like cross-origin creation is rejected', async () => {
  const result = await fetch(`${origin}/api/demo/runs`, { method: 'POST', headers: { Origin: 'https://evil.example' } });
  assert.equal(result.status, 403);
});

test('real API run returns exactly 10 winners out of 1,000 and streams complete', async () => {
  const created = await fetch(`${origin}/api/demo/runs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(created.status, 201);
  const { id, streamUrl } = await created.json();
  const reportResponse = await fetch(`${origin}/api/demo/runs/${id}`);
  const report = await reportResponse.json();
  assert.deepEqual([report.passed,report.failed,report.remaining,report.uniqueRequests], [10,990,0,1000]);
  const streamResponse = await fetch(`${origin}${streamUrl}`);
  assert.equal(streamResponse.status, 200);
  const events = await streamResponse.text();
  assert.match(events, /event: ready/);
  assert.match(events, /event: batch/);
  assert.match(events, /event: complete/);
  assert.match(events, /"invariant":true/);
  assert.match(events, /"processed":1000/);
});
