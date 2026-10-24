import { randomInt } from 'node:crypto';

export const DEFAULT_CAPACITY = 10;
export const DEFAULT_DEMAND = 1_000;

export function reserveAtomic(state, requestId) {
  if (typeof requestId !== 'string' || !/^USR-\d{4}$/.test(requestId)) {
    throw new TypeError('Invalid demo request identifier');
  }
  const prior = state.decisions.get(requestId);
  if (prior) return prior;

  const accepted = state.remaining > 0;
  if (accepted) state.remaining -= 1;
  const decision = { id: requestId, accepted, seat: accepted ? state.capacity - state.remaining : null };
  state.decisions.set(requestId, decision);
  return decision;
}

export function createInventory(capacity = DEFAULT_CAPACITY) {
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) throw new RangeError('Invalid capacity');
  return { capacity, remaining: capacity, decisions: new Map() };
}

export async function simulateDrop({ capacity = DEFAULT_CAPACITY, demand = DEFAULT_DEMAND } = {}) {
  if (!Number.isInteger(demand) || demand < 1 || demand > 5_000) throw new RangeError('Invalid demand');
  const state = createInventory(capacity);
  const users = Array.from({ length: demand }, (_, i) => `USR-${String(i + 1).padStart(4, '0')}`);
  for (let i = users.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [users[i], users[j]] = [users[j], users[i]];
  }
  let release;
  const startGate = new Promise((resolve) => { release = resolve; });
  const tasks = users.map(async (id) => { await startGate; return reserveAtomic(state, id); });
  release();
  const byArrival = await Promise.all(tasks);
  const success = byArrival.filter((x) => x.accepted);
  const rejected = byArrival.length - success.length;
  if (success.length > capacity || state.remaining < 0 || byArrival.length !== demand) {
    throw new Error('Inventory invariant violated');
  }
  // Results are deliberately SHUFFLED for the visual animation, not represented
  // as exact arrival timestamps. See the lab UI legend.
  const playback = [...byArrival];
  for (let i = playback.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [playback[i], playback[j]] = [playback[j], playback[i]];
  }
  return { capacity, demand, success: success.length, rejected, remaining: state.remaining, winners: success, playback, uniqueRequests: state.decisions.size };
}
