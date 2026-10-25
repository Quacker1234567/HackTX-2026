import test from 'node:test';
import assert from 'node:assert/strict';
import { seededClosingBalance } from '../src/demo-balance.mjs';

test('seed balance counts completed history exactly once and ignores canceled/pending rows', () => {
  const deposits = [{ _id: 'income', status: 'completed', amount: 100 }, { _id: 'pending', status: 'pending', amount: 200 }];
  const purchase = { _id: 'meal', status: 'completed', amount: 35.29 };
  assert.equal(seededClosingBalance([purchase, purchase, { _id: 'canceled', status: 'cancelled', amount: 20 }], deposits), 6471);
  assert.throws(() => seededClosingBalance([{ status: 'completed', amount: 200 }], deposits));
});
