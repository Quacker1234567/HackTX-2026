import test from 'node:test';
import assert from 'node:assert/strict';
import { firebaseWalletBudget, walletAttempt } from '../src/domain/hardware.ts';
import { walletEventProcessor } from '../src/domain/wallet-events.ts';
import { reconcileNessiePurchase, monthSpentByCategory } from '../src/domain/budget.ts';
const accountId = '11111111-1111-4111-8111-111111111111';
const merchantId = '22222222-2222-4222-8222-222222222222';
const purchaseId = '33333333-3333-4333-8333-333333333333';
function fixture() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const bank = { source: 'nessie', importedAt: now.toISOString(), account: { id: accountId, type: 'Checking', name: 'Flow Student Checking', balanceCents: 119100 }, purchases: [{ id: 'history', cents: 16300, status: 'completed', date, merchantId, merchant: 'Campus Cafe Restaurant', categoryId: 'dining' }], deposits: [], bills: [], merchants: [{ id: merchantId, name: 'Campus Cafe Restaurant', categoryId: 'dining', location: null }], warnings: [] };
  return { version: 1, bank, goal: { name: 'Savings', target: 100000, saved: 40000, days: 90 }, transactions: [], categories: [{ id: 'dining', name: 'Dining', limit: 20000, spent: 0 }, { id: 'other', name: 'Other', limit: 0, spent: 0 }], plan: { accountId, snapshotAt: bank.importedAt, periodEnd: '2099-12-31', canApprove: true } };
}
const event = () => ({ id: 'abcdef0123456789-1', type: 'purchase_confirm', boot_id: 'abcdef0123456789', sequence: 1, uid: '04A1B2C3', category: 'dining', amount_cents: 1200, created_at: Date.now() });
function harness() {
  let budget = fixture(), stored = {}, requests = [], applies = 0, saveFails = false, applyFails = false, manual = false, uncertain = false;
  const deps = {
    deviceId: 'wallet-001', firebaseUid: 'owner', getBudget: () => budget,
    load: async () => structuredClone(stored), save: async value => { if (saveFails) throw new Error('storage unavailable'); stored = structuredClone(value); },
    purchase: async request => { requests.push(request); return uncertain ? { state: 'uncertain', requestId: request.requestId, message: 'Check again' } : { state: 'created', ...request, purchaseId, date: new Date().toISOString().slice(0, 10), snapshot: null }; },
    apply: async (transaction, snapshot) => { if (applyFails) throw new Error('crashed before local apply'); budget = reconcileNessiePurchase(budget, transaction, snapshot); applies++; },
    manualPurchasePending: async () => manual, publish: async () => {},
  };
  return { deps, state: () => ({ budget, stored, requests, applies }), failSave: value => saveFails = value, failApply: value => applyFails = value, setManual: value => manual = value, setUncertain: value => uncertain = value, switchAccount: () => budget = { ...budget, bank: { ...budget.bank, account: { ...budget.bank.account, id: 'different' } } } };
}
test('hardware shows actual month spending, omits zero limits, maps only the approved $12 card', () => {
  const state = fixture();
  assert.deepEqual(firebaseWalletBudget(state).categories, [{ id: 'dining', name: 'Dining', total_cents: 20000, left_cents: 3700 }]);
  assert.equal(firebaseWalletBudget(state).cards[0].amount_cents, 1200);
  const over = { ...state, categories: [{ ...state.categories[0], limit: 10000 }] };
  assert.equal(firebaseWalletBudget(over).categories[0].left_cents, -6300);
  assert.deepEqual(firebaseWalletBudget(over).cards, []);
  assert.deepEqual(firebaseWalletBudget({ ...state, plan: { ...state.plan, snapshotAt: 'stale' } }).cards, []);
});
test('card confirmation rejects stale plans, changed prices, categories and malformed event IDs', () => {
  const state = fixture();
  assert.equal(walletAttempt(state, event(), 'owner', 'wallet-001').request.amountCents, 1200);
  assert.throws(() => walletAttempt(state, { ...event(), amount_cents: 1250 }, 'owner', 'wallet-001'));
  assert.throws(() => walletAttempt(state, { ...event(), category: 'food' }, 'owner', 'wallet-001'));
  assert.throws(() => walletAttempt(state, { ...event(), id: 'other-event' }, 'owner', 'wallet-001'));
  const request = walletAttempt(state, { ...event(), sequence: 2147483647, id: 'abcdef0123456789-2147483647' }, 'owner', 'a'.repeat(48));
  assert.ok(request.request.requestId.length <= 80);
});
test('duplicate events and restarts apply one verified purchase and preserve earlier spending', async () => {
  const h = harness(), processor = await walletEventProcessor(h.deps);
  await Promise.all([processor.handle(event()), processor.handle(event())]);
  await (await walletEventProcessor(h.deps)).handle(event());
  assert.equal(h.state().requests.length, 1); assert.equal(h.state().applies, 1);
  assert.equal(monthSpentByCategory(h.state().budget).dining, 17500);
});
test('uncertain outcome retries the same ID, and a saved receipt recovers without another backend call', async () => {
  const h = harness(); h.setUncertain(true);
  const first = await walletEventProcessor(h.deps);
  await assert.rejects(first.handle(event()), /Check again/);
  h.setUncertain(false); h.failApply(true);
  await assert.rejects(first.retry(), /crashed/);
  h.failApply(false);
  await (await walletEventProcessor(h.deps)).retry();
  assert.equal(h.state().requests.length, 2);
  assert.equal(h.state().requests[0].requestId, h.state().requests[1].requestId);
  assert.equal(h.state().applies, 1);
});
test('failed journal writes cannot lead to an unrecorded POST on an in-memory retry', async () => {
  const h = harness(), processor = await walletEventProcessor(h.deps); h.failSave(true);
  await assert.rejects(processor.handle(event()), /storage/);
  await assert.rejects(processor.handle(event()), /storage/);
  assert.equal(h.state().requests.length, 0);
  h.failSave(false); await processor.handle(event());
  assert.equal(h.state().requests.length, 1);
});
test('pending phone purchases and account switches block hardware requests', async () => {
  const h = harness(), processor = await walletEventProcessor(h.deps); h.setManual(true);
  await assert.rejects(processor.handle(event()), /phone purchase/);
  assert.equal(h.state().requests.length, 0);
  h.setManual(false); h.switchAccount();
  await assert.rejects(processor.retry(), /original account/);
  assert.equal(h.state().requests.length, 0);
});
