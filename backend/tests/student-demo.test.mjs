import test from 'node:test';
import assert from 'node:assert/strict';
import { studentDemoFixture } from '../src/student-demo.mjs';
import { loadSnapshot } from '../src/nessie.mjs';

test('student fixture covers 90 days with four locations, varied weekdays and whole-dollar money', () => {
  const f = studentDemoFixture();
  assert.deepEqual(f, studentDemoFixture());
  assert.equal(f.from, '2026-07-28'); assert.equal(f.asOf, '2026-10-25');
  assert.equal(f.merchants.length, 4); assert.equal(new Set(f.merchants.map(m => `${m.lat},${m.lng}`)).size, 4);
  assert.equal(f.purchases.length, 116); assert.equal(f.deposits.length, 9);
  assert.equal(new Set(f.purchases.map(p => p.step)).size, f.purchases.length);
  assert.ok(f.purchases.every(p => p.date >= f.from && p.date <= f.asOf && Number.isSafeInteger(p.cents) && p.cents > 0 && p.cents % 100 === 0));
  assert.equal(new Set(f.purchases.map(p => new Date(`${p.date}T12:00:00Z`).getUTCDay())).size, 7);
  assert.ok(f.purchases.some(p => p.date.startsWith('2026-08'))); assert.ok(f.purchases.some(p => p.date.startsWith('2026-09')));
});
test('checking reconciles all income, spending and paid fixed bills without counting future bills or savings as checking', () => {
  const f = studentDemoFixture(); const sum = rows => rows.reduce((a, r) => a + r.cents, 0);
  assert.equal(f.closingCheckingCents, 119100); assert.equal(f.savingsCents, 40000);
  assert.equal(f.openingCheckingCents + sum(f.deposits) - sum(f.purchases) - sum(f.paidBills), f.closingCheckingCents);
  assert.ok(f.paidBills.every(b => b.date <= f.asOf && b.status === 'completed'));
  assert.ok(f.upcomingBills.every(b => b.date > f.asOf && ['pending', 'cancelled'].includes(b.status)));
  assert.equal(sum(f.upcomingBills.filter(b => b.date <= '2026-10-31')), 6000);
});
test('snapshot exposes owned checking/savings context while keeping the selected account balance separate', async () => {
  const id = n => n.toString(16).padStart(24, '0');
  const accounts = [{ _id: id(2), type: 'Checking', nickname: 'Checking', balance: 1191 }, { _id: id(3), type: 'Savings', nickname: 'Savings', balance: 400 }];
  const result = await loadSnapshot(async path => path.endsWith('/accounts') ? accounts : [], id(1), id(2));
  assert.equal(result.account.balanceCents, 119100);
  assert.equal(result.accounts.length, 2); assert.equal(result.accounts.find(a => a.type === 'Savings').balanceCents, 40000);
});
