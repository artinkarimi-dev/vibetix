import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { simulateDrop } from './engine.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
]);
const LIVE_MS = 6 * 60 * 1000;
const LIMIT_RUNS = 12;
const RUNS_PER_MIN = 8;
const PAGE_SIZE = 25;
const FRAME_MS = 86;

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function reject(res, status, message) { sendJson(res, status, { error: message }); }

export function createDemoServer() {
  const runs = new Map();
  const arrivals = [];
  let liveStreams = 0;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'");
    const method = req.method || 'GET';
    const now = Date.now();
    for (const [id, run] of runs) if (now - run.createdAt > LIVE_MS) runs.delete(id);
    while (arrivals.length && now - arrivals[0] >= 60_000) arrivals.shift();

    if (method === 'GET' && url.pathname === '/api/demo/health') {
      return sendJson(res, 200, { ok: true, mode: 'single-process-demo', api: 'VIBETIX Drop Lab', capacity: 10, demand: 1000 });
    }
    if (method === 'POST' && url.pathname === '/api/demo/runs') {
      const origin = req.headers.origin;
      const host = req.headers.host;
      if (origin) {
        let valid = false;
        try { const parsed = new URL(origin); valid = Boolean(host) && parsed.host === host && parsed.protocol === 'http:'; } catch {                      }
        if (!valid) return reject(res, 403, 'Cross-origin requests are disabled');
      }
      if (arrivals.length >= RUNS_PER_MIN || runs.size >= LIMIT_RUNS) return reject(res, 429, 'Too many demo runs; retry shortly');

      if (Number(req.headers['content-length'] ?? 0) > 1024) return reject(res, 413, 'Request too large');
      let bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 1024) return reject(res, 413, 'Request too large');
      }
      const id = randomUUID();
      try {
        const result = await simulateDrop();
        runs.set(id, { id, createdAt: now, result });
        arrivals.push(now);
        return sendJson(res, 201, { id, demand: result.demand, capacity: result.capacity, streamUrl: `/api/demo/runs/${id}/events` });
      } catch (error) {
        console.error('Run failed:', error instanceof Error ? error.message : 'unknown');
        return reject(res, 500, 'Simulation could not complete');
      }
    }
    const streamMatch = url.pathname.match(/^\/api\/demo\/runs\/([\da-f-]{36})\/events$/);
    if (method === 'GET' && streamMatch) {
      const run = runs.get(streamMatch[1]);
      if (!run) return reject(res, 404, 'Run not found or expired');
      if (liveStreams >= 8) return reject(res, 429, 'Too many open streams');
      liveStreams++;
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      let offset = 0;
      let passed = 0;
      let failed = 0;
      let finished = false;
      const send = (event, payload) => { if (!finished && !res.destroyed) res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`); };
      const finish = () => { if (finished) return; finished = true; clearInterval(timer); liveStreams--; if (!res.writableEnded) res.end(); };
      send('ready', { demand: run.result.demand, capacity: run.result.capacity, runId: run.id, note: 'Playback order is visualized, not a clock-accurate arrival trace.' });
      const timer = setInterval(() => {
        const slice = run.result.playback.slice(offset, offset + PAGE_SIZE);
        offset += slice.length;
        for (const decision of slice) if (decision.accepted) passed++; else failed++;
        send('batch', {
          from: offset - slice.length,
          processed: offset,
          passed,
          failed,
          remaining: run.result.capacity - passed,
          decisions: slice.map(({ id, accepted }) => ({ id, accepted })),
        });
        if (offset === run.result.demand) {
          send('complete', { processed: offset, passed, failed, remaining: run.result.remaining, winnerIds: run.result.winners.map(x => x.id), invariant: passed === 10 && failed === 990 && run.result.remaining === 0 });
          finish();
        }
      }, FRAME_MS);
      res.on('close', finish);
      return;
    }
    const reportMatch = url.pathname.match(/^\/api\/demo\/runs\/([\da-f-]{36})$/);
    if (method === 'GET' && reportMatch) {
      const run = runs.get(reportMatch[1]);
      if (!run) return reject(res, 404, 'Run not found');
      const { result } = run;
      return sendJson(res, 200, { id: run.id, demand: result.demand, capacity: result.capacity, passed: result.success, failed: result.rejected, remaining: result.remaining, uniqueRequests: result.uniqueRequests });
    }
    const entry = assets.get(url.pathname);
    if (method === 'GET' && entry) {
      try {
        const [name, contentType] = entry;
        const data = await readFile(join(here, name));
        res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' });
        return res.end(data);
      } catch { return reject(res, 500, 'Asset unavailable'); }
    }
    if (method !== 'GET' && method !== 'POST') return reject(res, 405, 'Method not allowed');
    return reject(res, 404, 'Not found');
  });
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 5173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid PORT');
  const host = process.env.HOST || '127.0.0.1';
  const server = createDemoServer();
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Stop Vite first, or run: PORT=5180 npm run demo`);
      process.exitCode = 1;
    } else { console.error(error); process.exitCode = 1; }
  });
  server.listen(port, host, () => {
    console.log(`\n  VIBETIX // TICKET DROP LAB`);
    console.log(`  Open: http://${host}:${port}`);
    console.log(`  API:  http://${host}:${port}/api/demo/health`);
    console.log('  No dependencies or database required. Ctrl+C to stop.\n');
  });
}
