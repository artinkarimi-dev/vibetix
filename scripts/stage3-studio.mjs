import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initialState, applyEvent, safeFailure, publicSnapshot } from './stage3/core.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ui = resolve(root, 'stage3');
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'application/javascript; charset=utf-8']],
]);
const csp = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const json = (res, status, data) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
};

export function createStudio({ runner = () => spawn(process.execPath, ['scripts/stage3-runner.mjs'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }) } = {}) {
  let state = initialState();
  let current = null;
  let eventId = 0;
  const sockets = new Set();
  const notify = (type, body) => {
    const payload = `id: ${++eventId}\nevent: ${type}\ndata: ${JSON.stringify(body)}\n\n`;
    for (const res of sockets) if (!res.write(payload)) {
      // Slow clients cannot affect the benchmark. Subsequent snapshots resynchronize.
      res.end(); sockets.delete(res);
    }
  };
  const publish = (event) => {
    state = applyEvent(state, event);
    notify('snapshot', publicSnapshot(state));
  };
  const fail = (message) => { state = safeFailure(state, message); notify('snapshot', publicSnapshot(state)); };
  const start = () => {
    if (current) throw new Error('Benchmark is already running');
    state = { ...initialState(), phase: 'preparing', startedAt: new Date().toISOString(), message: 'در حال بررسی پیش‌نیازها و ساخت محیط آزمایش...' };
    notify('snapshot', publicSnapshot(state));
    const child = runner();
    current = child;
    let pendingReport = null;
    let errorMessage = null;
    let buffer = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      if (buffer.length > 2_000_000) { errorMessage = 'Telemetry stream exceeded safe limits'; child.kill('SIGTERM'); return; }
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const sep = line.indexOf('=');
        if (sep < 0 || line.length > 100_000) continue;
        const marker = line.slice(0, sep);
        if (!['STAGE3_EVENT_JSON', 'STAGE3_STEP_JSON', 'STAGE3_COMPLETE_JSON', 'STAGE3_ERROR_JSON'].includes(marker)) continue;
        try {
          const event = JSON.parse(line.slice(sep + 1));
          if (marker === 'STAGE3_EVENT_JSON') publish(event);
          else if (marker === 'STAGE3_STEP_JSON' && typeof event.message === 'string') {
            state = { ...state, message: event.message.slice(0, 180), updatedAt: new Date().toISOString() };
            notify('snapshot', publicSnapshot(state));
          } else if (marker === 'STAGE3_COMPLETE_JSON') pendingReport = event;
          else if (marker === 'STAGE3_ERROR_JSON') errorMessage = String(event.message).slice(0, 230);
        } catch (error) { errorMessage = `Invalid verification telemetry: ${error.message}`; child.kill('SIGTERM'); }
      }
    });
    // Preserve diagnostics in the terminal only: Docker output is not user-facing UI.
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => process.stderr.write(chunk.slice(0, 2048)));
    child.once('error', (error) => { errorMessage = `Cannot launch benchmark: ${error.message}`; fail(errorMessage); current = null; });
    child.once('close', (code) => {
      if (current !== child) return;
      current = null;
      if (code === 0 && pendingReport && !errorMessage) {
        try { publish(pendingReport); }
        catch (error) { fail(`Verification mismatch: ${error.message}`); }
      } else fail(errorMessage || `Benchmark did not pass (exit code ${code}). Check Docker and run logs.`);
    });
  };
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', csp);
    res.setHeader('X-Frame-Options', 'DENY');
    const hostname = req.headers.host ?? '';
    const allowed = /^(127\.0\.0\.1|localhost):\d+$/.test(hostname);
    if (!allowed) return json(res, 403, { error: 'Invalid local host' });
    const url = new URL(req.url ?? '/', `http://${hostname}`);
    if (req.method === 'GET' && url.pathname === '/api/state') return json(res, 200, publicSnapshot(state));
    if (req.method === 'GET' && url.pathname === '/api/report') {
      if (state.phase !== 'passed') return json(res, 404, { error: 'No verified report' });
      return json(res, 200, state.result);
    }
    if (req.method === 'GET' && url.pathname === '/api/events') {
      if (sockets.size >= 16) return json(res, 503, { error: 'Too many subscribers' });
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      sockets.add(res);
      res.write(`retry: 1500\n\nevent: snapshot\ndata: ${JSON.stringify(publicSnapshot(state))}\n\n`);
      req.on('close', () => sockets.delete(res));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/start') {
      if (req.headers.origin !== `http://${hostname}` || !req.headers['content-type']?.startsWith('application/json')) return json(res, 403, { error: 'Same-origin JSON request required' });
      if (current) return json(res, 409, { error: 'Benchmark already running' });
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 1024) return json(res, 413, { error: 'Payload too large' });
      }
      try { start(); return json(res, 202, { accepted: true }); }
      catch (error) { fail(error.message); return json(res, 500, { error: 'Failed to start benchmark' }); }
    }
    if (req.method === 'GET' && assets.has(url.pathname)) {
      const [file, mime] = assets.get(url.pathname);
      try {
        const data = await readFile(join(ui, file));
        res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store' });
        return res.end(data);
      } catch { return json(res, 500, { error: 'Missing UI asset' }); }
    }
    return json(res, 404, { error: 'Not found' });
  });
  const timer = setInterval(() => { for (const res of sockets) res.write(': keep-alive\n\n'); }, 15000);
  timer.unref();
  server.on('close', () => clearInterval(timer));
  return {
    server,
    getState: () => publicSnapshot(state),
    close: async () => {
      if (current) current.kill('SIGTERM');
      for (const res of sockets) res.end();
      sockets.clear();
      await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.STAGE3_PORT ?? 4174);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid STAGE3_PORT');
  const studio = createStudio();
  studio.server.listen(port, '127.0.0.1', () => {
    console.log(`VIBETIX LIVE STUDIO: http://127.0.0.1:${port}`);
    console.log('Stage 3 is a localhost-only, verified-results dashboard. Docker is required to run the real benchmark.');
  });
  const stop = () => void studio.close().then(() => process.exit(0));
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}
