import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createInventory, reserveAtomic, simulateDrop } from './engine.mjs';

test('1,000 concurrent attempts can never oversell 10 tickets', async () => {
  for (let trial = 0; trial < 20; trial++) {
    const run = await simulateDrop();
    assert.equal(run.demand, 1000);
    assert.equal(run.success, 10);
    assert.equal(run.rejected, 990);
    assert.equal(run.remaining, 0);
    assert.equal(run.uniqueRequests, 1000);
    assert.equal(new Set(run.winners.map(x => x.id)).size, 10);
    assert.deepEqual(run.winners.map(x => x.seat).sort((a,b) => a - b), [1,2,3,4,5,6,7,8,9,10]);
  }
});
test('retries are idempotent and cannot claim multiple seats', () => {
  const state = createInventory(2);
  const a = reserveAtomic(state, 'USR-0001');
  assert.deepEqual(reserveAtomic(state, 'USR-0001'), a);
  assert.equal(state.remaining, 1);
  reserveAtomic(state, 'USR-0002');
  assert.equal(reserveAtomic(state, 'USR-0003').accepted, false);
  assert.equal(state.remaining, 0);
});
test('invalid requests and capacity are rejected', async () => {
  assert.throws(() => createInventory(-5));
  assert.throws(() => reserveAtomic(createInventory(), '__proto__'));
  await assert.rejects(() => simulateDrop({ demand: 10_000 }));
});
