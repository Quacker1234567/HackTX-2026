import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeHistory, confirmManualBills, estimateAtMerchant, proposeBudget } from '../src/domain/banking.ts';

const now = new Date('2026-10-24T12:00:00');
const purchases = Array.from({ length: 9 }, (_, i) => ({ id: `p${i}`, cents: 1000, date: '2026-10-20', status: 'completed', merchantId: 'cafe', merchant: 'Cafe', categoryId: i < 5 ? 'dining' : 'groceries' }));
const bank = {
  source: 'nessie', importedAt: now.toISOString(), account: { id: 'a', balanceCents: 100000, type: 'Checking', name: 'Checking' }, purchases,
  deposits: [{ id: 'd1', cents: 120000, date: '2026-09-26', status: 'completed' }, { id: 'd2', cents: 120000, date: '2026-10-10', status: 'completed' }, { id: 'd3', cents: 120000, date: '2026-10-24', status: 'completed' }],
  bills: [{ id: 'bill', cents: 10000, date: '2026-10-30', status: 'pending', payee: 'Utilities' }], merchants: [], warnings: [],
};
const goal = { target: 10000, saved: 0, days: 100 };
const prefs = { payday: '2026-11-07', diningReduction: 20, protectedCategory: 'groceries' };
test('missing bill data blocks approval until an explicit validated manual bill list is confirmed', () => {
  const incomplete = { ...bank, bills: [], billReviewRequired: true, warnings: ['Nessie bills could not be imported. Budget approval is blocked.'] };
  assert.equal(proposeBudget(incomplete, goal, prefs, now).canApprove, false);
  const confirmed = confirmManualBills(incomplete, bank.bills);
  assert.equal(confirmed.billSource, 'manual');
  assert.equal(confirmed.billReviewRequired, false);
  assert.equal(proposeBudget(confirmed, goal, prefs, now).canApprove, true);
  assert.equal(proposeBudget(confirmed, goal, prefs, now).billsCents, 10000);
  assert.equal(incomplete.billReviewRequired, true);
  assert.throws(() => confirmManualBills(incomplete, [{ ...bank.bills[0], cents: -1 }]));
  const reimport = { ...confirmed, billReviewRequired: true };
  assert.equal(proposeBudget(reimport, goal, prefs, now).canApprove, false);
});
test('history excludes pending/future/undated rows and deduplicates IDs', () => {
  const result = analyzeHistory({ ...bank, purchases: [...purchases, purchases[0], { ...purchases[0], id: 'pending', status: 'pending' }, { ...purchases[0], id: 'future', date: '2027-01-01' }] }, now);
  assert.equal(result.totalCents, 9000);
  assert.equal(result.count, 9);
  assert.equal(result.estimatedPaydayGap, 14);
});
test('proposal reserves upcoming bills and savings once, without resubtracting history or readding income', () => {
  const result = proposeBudget(bank, goal, prefs, now);
  assert.equal(result.billsCents, 10000);
  assert.equal(result.savingsCents, 1400);
  assert.equal(result.availableCents, 88600);
  assert.equal(result.allocations.reduce((sum, c) => sum + c.limit, 0) + result.unallocatedCents, 88600);
  assert.equal(result.canApprove, true);
  assert.equal(bank.account.balanceCents, 100000);
});
test('dining preference actually lowers allocation and leaves the difference unallocated', () => {
  const full = proposeBudget(bank, goal, { ...prefs, diningReduction: 0 }, now);
  const reduced = proposeBudget(bank, goal, prefs, now);
  assert.ok(reduced.allocations.find(c => c.id === 'dining').limit < full.allocations.find(c => c.id === 'dining').limit);
  assert.ok(reduced.unallocatedCents > full.unallocatedCents);
});
test('categories are capped at historical pace: surplus stays unallocated, scarcity sweeps only rounding dust', () => {
  // $90 of history over 90 days, 14 days to payday: every category needs far less than the $886 available.
  const surplus = proposeBudget(bank, goal, prefs, now);
  assert.equal(surplus.allocations.find(c => c.id === 'dining').limit, 623);
  assert.equal(surplus.allocations.find(c => c.id === 'groceries').limit, 623);
  assert.equal(surplus.allocations.find(c => c.id === 'other').limit, 0, 'surplus must not silently collect in Other');
  assert.equal(surplus.unallocatedCents, 87354);
  // Scaling down is unchanged: available funds are still fully distributed.
  const scarce = proposeBudget({ ...bank, purchases: purchases.map(p => ({ ...p, cents: 100000 })) }, goal, prefs, now);
  assert.ok(scarce.allocations.find(c => c.id === 'dining').limit < 62223);
  assert.equal(scarce.unallocatedCents, 0);
  assert.equal(scarce.allocations.reduce((sum, c) => sum + c.limit, 0), scarce.availableCents);
});
test('overdue bills, impossible dates, insufficient funds, and invalid preferences block approval', () => {
  assert.equal(proposeBudget(bank, goal, { ...prefs, payday: '2026-02-31' }, now).canApprove, false);
  assert.equal(proposeBudget(bank, goal, { ...prefs, diningReduction: 101 }, now).canApprove, false);
  assert.equal(proposeBudget({ ...bank, account: { ...bank.account, balanceCents: 10 } }, goal, prefs, now).canApprove, false);
  assert.equal(proposeBudget({ ...bank, bills: [{ ...bank.bills[0], date: '2026-10-01' }] }, goal, prefs, now).canApprove, false);
});
test('merchant estimate uses completed purchase amounts only', () => {
  assert.equal(estimateAtMerchant({ ...bank, purchases: [...purchases, { ...purchases[0], status: 'pending', cents: 999999 }] }, 'cafe'), 1000);
  assert.equal(estimateAtMerchant(bank, 'unknown'), null);
});

test('known Flow purchases absent from the sandbox balance are reserved once when replanning', () => {
  const result = proposeBudget({ ...bank, unreflectedPurchaseCents: 3500 }, goal, prefs, now);
  assert.equal(result.availableCents, 85100);
  assert.equal(result.allocations.reduce((sum, c) => sum + c.limit, 0) + result.unallocatedCents, 85100);
  assert.equal(result.canApprove, true);
  assert.equal(proposeBudget({ ...bank, unreflectedPurchaseCents: -1 }, goal, prefs, now).canApprove, false);
});
