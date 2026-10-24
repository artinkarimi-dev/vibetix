import { performance } from 'node:perf_hooks';

export const quantile = (sorted, percentile) => sorted.length
  ? Number(sorted[Math.min(sorted.length - 1, Math.ceil((percentile / 100) * sorted.length) - 1)].toFixed(2))
  : null;

export async function issueHttpRace({ users, seats, concurrency = 24, baseUrl, origin, timeoutMs = 30000, onProgress = () => {} }) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 1000) throw new Error('concurrency must be an integer from 1 to 1000');
  if (!users.length || !seats.length) throw new Error('users and seats are required');
  let next = 0;
  let completed = 0;
  const startedAt = performance.now();
  const results = Array(users.length);
  let active = 0;
  let peak = 0;
  const runOne = async (index) => {
    const user = users[index];
    const seat = seats[index % seats.length];
    const started = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    active++;
    peak = Math.max(peak, active);
    try {
      const response = await fetch(`${baseUrl}/api/v1/events/${encodeURIComponent(seat.eventId)}/hold-seats`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: origin,
          Cookie: `vibetix-session=${user.token}`,
        },
        body: JSON.stringify({ seatIds: [seat.id] }),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      const verifiedHold = response.status === 200 && Array.isArray(data?.seatIds) && data.seatIds.length === 1 && data.seatIds[0] === seat.id;
      results[index] = {
        userIndex: index,
        seatIndex: index % seats.length,
        status: response.status,
        code: verifiedHold ? null : (response.status === 200 ? 'INVALID_HOLD_RESPONSE' : (data?.error?.code ?? 'UNKNOWN_RESPONSE')),
        ms: Number((performance.now() - started).toFixed(2)),
      };
    } catch (error) {
      results[index] = {
        userIndex: index,
        seatIndex: index % seats.length,
        status: 0,
        code: error?.name === 'AbortError' ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR',
        ms: Number((performance.now() - started).toFixed(2)),
      };
    } finally {
      clearTimeout(timeout);
      active--;
      onProgress(++completed, results[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, users.length) }, async () => {
    while (next < users.length) await runOne(next++);
  }));
  const durationMs = performance.now() - startedAt;
  const sorted = results.map((r) => r.ms).sort((a, b) => a - b);
  const byStatus = {};
  const byCode = {};
  for (const result of results) {
    byStatus[String(result.status)] = (byStatus[String(result.status)] ?? 0) + 1;
    if (result.code) byCode[result.code] = (byCode[result.code] ?? 0) + 1;
  }
  return {
    results,
    metrics: {
      totalRequests: users.length,
      concurrencyLimit: concurrency,
      peakInFlight: peak,
      elapsedMs: Number(durationMs.toFixed(2)),
      requestsPerSecond: Number((users.length / (durationMs / 1000)).toFixed(2)),
      latencyMs: { p50: quantile(sorted, 50), p95: quantile(sorted, 95), p99: quantile(sorted, 99), max: sorted.at(-1) ?? null },
      byStatus,
      byCode,
    },
  };
}

export function checkHoldResults(results, seatCount) {
  const successful = results.filter((r) => r.status === 200 && r.code === null);
  const rejected = results.filter((r) => r.status === 409 && r.code === 'SEAT_UNAVAILABLE');
  const other = results.filter((r) => !(r.status === 200 && r.code === null) && !(r.status === 409 && r.code === 'SEAT_UNAVAILABLE'));
  const uniqueSeats = new Set(successful.map((r) => r.seatIndex));
  return {
    passed: successful.length === seatCount && rejected.length === results.length - seatCount && other.length === 0 && uniqueSeats.size === seatCount,
    successful: successful.length,
    rejected: rejected.length,
    unexpected: other.length,
    successfulIndices: successful.map((r) => r.userIndex),
    unexpectedExamples: other.slice(0, 5),
  };
}
