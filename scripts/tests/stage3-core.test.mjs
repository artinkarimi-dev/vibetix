import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEvent, initialState, safeFailure } from '../stage3/core.mjs';

const sampleReport = () => ({
  passed: true, runId: 'test-run-id', timestamp: '2026-10-22T00:00:00Z',
  holds: { wins: 10, conflicts: 990, unexpected: 0 },
  metrics: {
    totalRequests: 1000, elapsedMs: 1000, requestsPerSecond: 1000, peakInFlight: 24, concurrencyLimit: 24,
    latencyMs: { p50: 1, p95: 10, p99: 20 }, byStatus: { 200: 10, 409: 990 },
  },
  database: { soldSeats: 10, finalHolds: 0, orderCount: 10, itemCount: 10, ticketCount: 10, paymentCount: 10 },
});

test('Stage 3 confirms 1000 real mapped results only when database invariants match expected final holds=0', () => {
  let state = applyEvent(initialState(), { type: 'phase', phase: 'preparing' });
  state = applyEvent(state, { type: 'phase', phase: 'racing', runId: 'test-run-id' });
  const entries = Array.from({ length: 1000 }, (_, index) => ({ index, outcome: index < 10 ? 'won' : 'lost' }));
  state = applyEvent(state, { type: 'progress', entries, elapsedMs: 1400, rps: 740, p95: 4 });
  assert.deepEqual([state.completed, state.won, state.lost, state.errors], [1000, 10, 990, 0]);
  state = applyEvent(state, { type: 'phase', phase: 'verifying' });
  state = applyEvent(state, { type: 'complete', report: sampleReport() });
  assert.equal(state.phase, 'passed');
  assert.equal(state.result.database.finalHolds, 0);
});

test('Stage 3 refuses counterfeit completion and oversell, and never silently converts API errors to seat conflicts', () => {
  let state = applyEvent(initialState(), { type: 'phase', phase: 'racing' });
  state = applyEvent(state, { type: 'progress', entries: [{ index: 0, outcome: 'error' }] });
  assert.deepEqual([state.won, state.lost, state.errors], [0, 0, 1]);
  assert.throws(() => applyEvent(state, { type: 'complete', report: sampleReport() }), /Database consistency|Report failed|Telemetry does not match/);
  assert.throws(() => applyEvent(state, { type: 'progress', entries: [{ index: 0, outcome: 'lost' }] }), /Conflicting result/);
  assert.throws(() => applyEvent(state, { type: 'phase', phase: 'passed' }), /Untrusted phase/);
  const almost = applyEvent(initialState(), { type: 'phase', phase: 'racing' });
  assert.throws(() => applyEvent(almost, { type: 'progress', entries: Array.from({ length: 11 }, (_, index) => ({ index, outcome: 'won' })) }), /Oversold/);
});

test('Stage 3 refuses successful report if sold/holds/tickets/payments are inconsistent', () => {
  let state = applyEvent(initialState(), { type: 'phase', phase: 'racing' });
  state = applyEvent(state, { type: 'progress', entries: Array.from({ length: 1000 }, (_, index) => ({ index, outcome: index < 10 ? 'won' : 'lost' })) });
  const wrong = sampleReport();
  wrong.database.paymentCount = 9;
  assert.throws(() => applyEvent(state, { type: 'complete', report: wrong }), /Database consistency/);
  const wrongHolds = sampleReport();
  wrongHolds.holds.conflicts = 989;
  assert.throws(() => applyEvent(state, { type: 'complete', report: wrongHolds }), /Report failed/);
});

test('Failure status is explicit and never reports verified', () => {
  const state = safeFailure(initialState(), 'Docker unavailable');
  assert.equal(state.phase, 'failed');
  assert.equal(state.result, null);
  assert.match(state.error, /Docker unavailable/);
});
