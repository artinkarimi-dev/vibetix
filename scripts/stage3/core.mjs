export const TOTAL = 1000;
export const CAPACITY = 10;
const PHASES = new Set(['idle', 'preparing', 'racing', 'checkout', 'verifying', 'passed', 'failed']);
const RESULTS = new Set(['won', 'lost', 'error']);

export function initialState() {
  return {
    phase: 'idle', runId: null, startedAt: null, updatedAt: new Date().toISOString(),
    total: TOTAL, capacity: CAPACITY, completed: 0, won: 0, lost: 0, errors: 0,
    elapsedMs: null, rps: null, p50: null, p95: null, p99: null, peakInFlight: null,
    concurrency: null, httpStatus: {}, result: null, error: null,
    seats: Array(TOTAL).fill('waiting'), message: 'برای اجرای آزمون واقعی، Docker را روشن کنید.',
  };
}

function validNumber(value) { return Number.isFinite(value) && value >= 0; }

export function applyEvent(current, message) {
  if (!message || typeof message !== 'object') throw new Error('Invalid telemetry event');
  const next = { ...current, updatedAt: new Date().toISOString() };
  if (message.type === 'phase') {
    if (!PHASES.has(message.phase) || message.phase === 'passed') throw new Error('Untrusted phase');
    next.phase = message.phase;
    if (typeof message.runId === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(message.runId)) next.runId = message.runId;
    if (Number.isInteger(message.concurrency) && message.concurrency >= 1 && message.concurrency <= TOTAL) next.concurrency = message.concurrency;
    if (typeof message.message === 'string') next.message = message.message.slice(0, 180);
    if (message.phase === 'preparing' && !current.startedAt) next.startedAt = new Date().toISOString();
    return next;
  }
  if (message.type === 'progress') {
    if (!['preparing', 'racing'].includes(current.phase)) throw new Error('Progress outside of race');
    if (!Array.isArray(message.entries) || message.entries.length > TOTAL) throw new Error('Invalid result batch');
    const seats = [...current.seats];
    for (const entry of message.entries) {
      if (!entry || !Number.isInteger(entry.index) || entry.index < 0 || entry.index >= TOTAL || !RESULTS.has(entry.outcome)) throw new Error('Malformed result');
      if (seats[entry.index] !== 'waiting' && seats[entry.index] !== entry.outcome) throw new Error('Conflicting result for participant');
      seats[entry.index] = entry.outcome;
    }
    next.seats = seats;
    next.completed = seats.filter((v) => v !== 'waiting').length;
    next.won = seats.filter((v) => v === 'won').length;
    next.lost = seats.filter((v) => v === 'lost').length;
    next.errors = seats.filter((v) => v === 'error').length;
    if (next.won > CAPACITY) throw new Error('Oversold seats detected');
    next.phase = 'racing';
    for (const name of ['elapsedMs', 'rps', 'p50', 'p95', 'p99']) if (validNumber(message[name])) next[name] = message[name];
    return next;
  }
  if (message.type === 'complete') {
    const report = message.report;
    if (!report || report.passed !== true || report.holds?.wins !== CAPACITY || report.holds?.conflicts !== TOTAL - CAPACITY || report.holds?.unexpected !== 0 || report.metrics?.totalRequests !== TOTAL || report.metrics?.byStatus?.['200'] !== CAPACITY || report.metrics?.byStatus?.['409'] !== TOTAL - CAPACITY) throw new Error('Report failed invariants');
    if (!report.database || report.database.soldSeats !== CAPACITY || report.database.finalHolds !== 0 || report.database.orderCount !== CAPACITY || report.database.itemCount !== CAPACITY || report.database.ticketCount !== CAPACITY || report.database.paymentCount !== CAPACITY || Object.keys(report.database).length !== 6) throw new Error('Database consistency check failed');
    if (current.runId && report.runId !== current.runId) throw new Error('Run ID mismatch');
    if (current.completed !== TOTAL || current.won !== CAPACITY || current.lost !== TOTAL - CAPACITY || current.errors !== 0) throw new Error('Telemetry does not match verification');
    next.phase = 'passed';
    next.result = {
      runId: report.runId, timestamp: report.timestamp, reportFile: message.reportFile ?? null,
      payment: 'شبیه‌سازی‌شده', database: report.database,
    };
    next.message = 'آزمون HTTP و راستی‌آزمایی PostgreSQL با موفقیت انجام شد.';
    next.elapsedMs = report.metrics.elapsedMs;
    next.rps = report.metrics.requestsPerSecond;
    next.p50 = report.metrics.latencyMs.p50;
    next.p95 = report.metrics.latencyMs.p95;
    next.p99 = report.metrics.latencyMs.p99;
    next.peakInFlight = report.metrics.peakInFlight;
    next.concurrency = report.metrics.concurrencyLimit;
    next.httpStatus = report.metrics.byStatus;
    return next;
  }
  throw new Error('Unsupported telemetry event');
}

export function publicSnapshot(state) {
  return JSON.parse(JSON.stringify(state));
}

export function safeFailure(current, message) {
  return { ...current, phase: 'failed', updatedAt: new Date().toISOString(), error: String(message).slice(0, 230), message: 'آزمون کامل نشد و نتیجه به‌عنوان موفق ثبت نشده است.' };
}
