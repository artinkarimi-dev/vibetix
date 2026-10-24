import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { issueHttpRace, checkHoldResults, quantile } from '../stage2/core.mjs';

const withServer = async (fn, behavior = 'normal') => {
  const used = new Set();
  const server = createServer(async (req, res) => {
    const parts = req.url.split('/');
    let body = '';
    for await (const buf of req) body += buf;
    const seatId = JSON.parse(body).seatIds[0];
    const user = /^vibetix-session=(.+)$/.exec(req.headers.cookie ?? '')?.[1];
    assert.equal(req.method, 'POST');
    assert.equal(req.headers.origin, 'http://127.0.0.1:8080');
    assert.equal(parts[2], 'v1');
    if (behavior === 'rate-limit' && user === 'user-500') {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 'RATE_LIMITED' } }));
      return;
    }
    const won = !used.has(seatId);
    if (won) used.add(seatId);
    res.writeHead(won ? 200 : 409, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(won ? { seatIds: [seatId] } : { error: { code: 'SEAT_UNAVAILABLE' } }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try { await fn(`http://127.0.0.1:${server.address().port}`, used); }
  finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
};
const users = Array.from({ length: 1000 }, (_, i) => ({ token: `user-${i}` }));
const seats = Array.from({ length: 10 }, (_, i) => ({ id: `seat-${i}`, eventId: 'stage2-test' }));

test('Stage 2 harness issues 1000 actual HTTP POSTs, with 10 winners and 990 conflicts (mock backend, not PostgreSQL)', async () => {
  await withServer(async (baseUrl, used) => {
    const { results, metrics } = await issueHttpRace({ users, seats, baseUrl, origin: 'http://127.0.0.1:8080', concurrency: 32 });
    assert.equal(results.length, 1000);
    assert.equal(used.size, 10);
    assert.deepEqual(checkHoldResults(results, 10).passed, true);
    assert.deepEqual(metrics.byStatus, { '200': 10, '409': 990 });
    assert.ok(metrics.peakInFlight > 1 && metrics.peakInFlight <= 32);
    assert.ok(metrics.latencyMs.p95 > 0 && metrics.requestsPerSecond > 0);
  });
});

test('Stage 2 correctly fails on even one rate limit instead of silently claiming 990 seat conflicts', async () => {
  await withServer(async (baseUrl) => {
    const { results } = await issueHttpRace({ users, seats, baseUrl, origin: 'http://127.0.0.1:8080', concurrency: 12 });
    const verification = checkHoldResults(results, 10);
    assert.equal(verification.passed, false);
    assert.equal(verification.unexpected, 1);
    assert.equal(verification.unexpectedExamples[0].status, 429);
  }, 'rate-limit');
});

test('percentile helper handles missing samples and edge cases', () => {
  assert.equal(quantile([], 95), null);
  assert.equal(quantile([2, 3, 5, 8], 50), 3);
  assert.equal(quantile([2, 3, 5, 8], 95), 8);
});
