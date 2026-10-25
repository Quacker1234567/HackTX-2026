import test from 'node:test';
import assert from 'node:assert/strict';
import { seedBudget, commitPurchase, parseMoney, dailyGoalReserve, monthSpentByCategory, categoriesWithSpend } from '../src/domain/budget.ts';

test('meal reduces dining from $42 to $7 once, preserving preview source', () => {
  const initial = seedBudget();
  const purchase = { id: 'meal-1', categoryId: 'dining', merchant: 'Cafe', cents: 3500, createdAt: '2026-10-24' };
  const next = commitPurchase(initial, purchase);
  assert.equal(initial.categories[0].limit - initial.categories[0].spent, 4200);
  assert.equal(next.categories[0].limit - next.categories[0].spent, 700);
  assert.equal(commitPurchase(next, purchase), next);
  assert.equal(next.transactions.length, 1);
});
test('overspending and invalid cents cannot be committed', () => {
  const purchase = { id: 'bad', categoryId: 'dining', merchant: 'Cafe', cents: 4201, createdAt: '2026-10-24' };
  assert.throws(() => commitPurchase(seedBudget(), purchase));
  assert.throws(() => commitPurchase(seedBudget(), { ...purchase, cents: 1.5 }));
});
test('money parsing is exact and rejects ambiguous inputs', () => {
  assert.equal(parseMoney('0.29'), 29);
  assert.equal(parseMoney('35'), 3500);
  for (const invalid of ['-1', '0', '1.001', 'abc', 'Infinity']) assert.equal(parseMoney(invalid), null);
});
test('goal reserve rounds up and stops when the goal is reached', () => {
  assert.equal(dailyGoalReserve({ name: 'Goal', target: 100, saved: 0, days: 3 }), 34);
  assert.equal(dailyGoalReserve({ name: 'Goal', target: 100, saved: 100, days: 3 }), 0);
});

// Budget edits must preserve committed spending and protected bank reserves.
test('allocation edits preserve spending, history and goal while rejecting unsafe totals', async () => {
  const { editLimits } = await import('../src/domain/budget.ts');
  const initial = seedBudget();
  const changed = editLimits(initial, { dining: 25000, groceries: 30000, transport: 10000 });
  assert.equal(changed.categories[0].spent, initial.categories[0].spent);
  assert.equal(changed.transactions, initial.transactions);
  assert.equal(changed.goal, initial.goal);
  assert.equal(initial.categories[0].limit, 20000);
  assert.throws(() => editLimits(initial, { dining: 10000, groceries: 30000, transport: 10000 }));
  assert.throws(() => editLimits(initial, { dining: NaN, groceries: 30000, transport: 10000 }));
  const planned = { ...initial, plan: { availableCents: 60000 } };
  assert.throws(() => editLimits(planned, { dining: 25000, groceries: 30000, transport: 10000 }));
  assert.equal(editLimits(planned, { dining: 20000, groceries: 30000, transport: 10000 }).categories[0].limit, 20000);
});

const bankFixture = () => ({ source: 'nessie', importedAt: '2026-10-24T12:00:00Z', account: { id: 'account-1', balanceCents: 50000 }, purchases: [], deposits: [], bills: [], merchants: [], warnings: [] });
const remoteTransaction = () => ({ id: 'request-1', categoryId: 'dining', merchant: 'Cafe', cents: 3500, createdAt: '2026-10-24T12:01:00Z', nessiePurchaseId: 'remote-1', accountId: 'account-1' });
test('a Nessie receipt refreshes the bank and reduces a category only once across retries', async () => {
  const { reconcileNessiePurchase } = await import('../src/domain/budget.ts');
  const initial = { ...seedBudget(), bank: bankFixture() };
  const fresh = { ...bankFixture(), importedAt: '2026-10-24T12:02:00Z', account: { id: 'account-1', balanceCents: 46500 }, purchases: [{ id: 'remote-1', cents: 3500 }] };
  const next = reconcileNessiePurchase(initial, remoteTransaction(), fresh);
  assert.equal(next.categories[0].spent, 19300);
  assert.equal(next.bank.account.balanceCents, 46500);
  assert.equal(next.transactions.length, 1);
  assert.equal(reconcileNessiePurchase(next, remoteTransaction(), fresh), next);
  assert.equal(initial.categories[0].spent, 15800);
});
test('a new approved plan already containing a remote purchase does not subtract it again', async () => {
  const { reconcileNessiePurchase } = await import('../src/domain/budget.ts');
  const bank = { ...bankFixture(), purchases: [{ id: 'remote-1', cents: 3500 }] };
  const initial = { ...seedBudget(), bank, plan: { snapshotAt: bank.importedAt }, categories: [{ id: 'dining', name: 'Dining', limit: 10000, spent: 0 }] };
  const next = reconcileNessiePurchase(initial, remoteTransaction(), bank);
  assert.equal(next.categories[0].spent, 0);
  assert.equal(next.transactions.length, 1);
});
test('refresh failure retains a receipt and prior bank data; mismatched accounts cannot apply', async () => {
  const { reconcileNessiePurchase } = await import('../src/domain/budget.ts');
  const initial = { ...seedBudget(), bank: bankFixture() };
  const next = reconcileNessiePurchase(initial, remoteTransaction(), null);
  assert.equal(next.categories[0].spent, 19300); assert.equal(next.bank, initial.bank);
  assert.throws(() => reconcileNessiePurchase(initial, { ...remoteTransaction(), accountId: 'different-account' }, null));
  assert.throws(() => reconcileNessiePurchase(initial, remoteTransaction(), { ...bankFixture(), account: { id: 'different-account' } }));
});

const bankWith = purchases => ({
  source: 'nessie', importedAt: '2026-10-25T00:00:00.000Z',
  account: { id: 'a', balanceCents: 500000, type: 'Checking', name: 'Checking' },
  purchases, deposits: [], bills: [], merchants: [], warnings: [],
});
test('category spending is this calendar month of imported history, not just Flow purchases', () => {
  const now = new Date('2026-10-25T12:00:00');
  const state = {
    ...seedBudget(),
    categories: [{ id: 'dining', name: 'Dining', limit: 20000, spent: 15800 }],
    bank: bankWith([
      { id: 'n1', cents: 3000, date: '2026-10-05', status: 'completed', merchantId: 'm', merchant: 'Cafe', categoryId: 'dining' },
      { id: 'n2', cents: 4000, date: '2026-10-20', status: 'completed', merchantId: 'm', merchant: 'Cafe', categoryId: 'dining' },
      { id: 'old', cents: 9900, date: '2026-09-20', status: 'completed', merchantId: 'm', merchant: 'Cafe', categoryId: 'dining' },
      { id: 'pend', cents: 9900, date: '2026-10-21', status: 'pending', merchantId: 'm', merchant: 'Cafe', categoryId: 'dining' },
    ]),
  };
  // Last month and pending rows are excluded; the stored demo figure is ignored.
  assert.equal(monthSpentByCategory(state, now).dining, 7000);
  assert.equal(categoriesWithSpend(state, now)[0].spent, 7000);
});
test('a confirmed Flow purchase is counted once, and a voided rehearsal not at all', () => {
  const now = new Date('2026-10-25T12:00:00');
  const purchases = [{ id: 'n1', cents: 3000, date: '2026-10-05', status: 'completed', merchantId: 'm', merchant: 'Cafe', categoryId: 'dining' }];
  const base = {
    ...seedBudget(), categories: [{ id: 'dining', name: 'Dining', limit: 20000, spent: 0 }],
    bank: bankWith(purchases),
    transactions: [{ id: 't1', categoryId: 'dining', merchant: 'Cafe', cents: 3000, createdAt: '2026-10-05T10:00:00.000Z', nessiePurchaseId: 'n1', accountId: 'a' }],
  };
  // Present in both imported history and the local receipt: counted once.
  assert.equal(monthSpentByCategory(base, now).dining, 3000);
  // Released as rehearsal: dropped from history and from the local receipt alike.
  const voided = { ...base, bank: { ...base.bank, voidedPurchaseIds: ['n1'] } };
  assert.equal(monthSpentByCategory(voided, now).dining ?? 0, 0);
  // A local rehearsal with no Nessie ID still counts.
  const local = { ...base, transactions: [...base.transactions, { id: 't2', categoryId: 'dining', merchant: 'Demo', cents: 500, createdAt: '2026-10-06T10:00:00.000Z' }] };
  assert.equal(monthSpentByCategory(local, now).dining, 3500);
});
test('without an imported bank the stored demo figures still drive the budget', () => {
  const seeded = seedBudget();
  assert.equal(monthSpentByCategory(seeded, new Date('2026-10-25T12:00:00')).dining, 15800);
});
