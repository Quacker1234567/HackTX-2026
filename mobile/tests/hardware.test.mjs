import test from 'node:test';
import assert from 'node:assert/strict';
import { firebaseWalletBudget, walletAttempt, walletReply } from '../src/domain/hardware.ts';
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
const event = () => ({ id: 'abcdef0123456789-1', type: 'purchase_confirm', boot_id: 'abcdef0123456789', sequence: 1, uid: '44339A9E', category: 'dining', amount_cents: 1200, created_at: Date.now() });
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
  assert.equal(firebaseWalletBudget(over).cards[0].uid, '44339A9E');
  assert.deepEqual(firebaseWalletBudget({ ...state, plan: { ...state.plan, snapshotAt: 'stale' } }).cards, []);
});

test('insufficient budgets keep the card recognized and send sad without a Nessie request or deduction', async () => {
  for (const remaining of [1199, 0, -100]) {
    const h = harness(), replies = [];
    const budget = h.state().budget;
    budget.categories[0].limit = 16300 + remaining;
    const before = structuredClone(budget);
    h.deps.publish = async reply => { if (reply) replies.push(reply); };
    assert.equal(firebaseWalletBudget(budget).cards[0].uid, event().uid);
    const processor = await walletEventProcessor(h.deps);
    await assert.rejects(processor.handle(event()), /remaining Dining budget/);
    assert.deepEqual(replies, [{ id: event().id, mood: 'sad', message: 'Over budget' }]);
    assert.equal(h.state().requests.length, 0);
    assert.equal(h.state().applies, 0);
    assert.deepEqual(h.state().budget, before);
    assert.deepEqual(h.state().stored, {});
    assert.equal(processor.hasPending(), false);
    await processor.retry();
    assert.equal(h.state().requests.length, 0);
  }
});

test('a purchase that exactly uses the remaining budget is allowed', async () => {
  const h = harness();
  h.state().budget.categories[0].limit = 17500;
  const processor = await walletEventProcessor(h.deps);
  await processor.handle(event());
  assert.equal(h.state().requests.length, 1);
  assert.equal(h.state().applies, 1);
  assert.equal(firebaseWalletBudget(h.state().budget).categories[0].left_cents, 0);
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

test('hardware confirmation completes the Nessie -> Flow -> Firebase budget loop without removing a funded card', async () => {
  const h = harness();
  let count = 0;
  const published = [];
  h.deps.purchase = async request => {
    count++;
    const id = `33333333-3333-4333-8333-${String(count).padStart(12, '0')}`;
    const current = h.state().budget.bank;
    const snapshot = { ...current, importedAt: new Date(Date.now() + count * 1000).toISOString(), unreflectedPurchaseCents: (current.unreflectedPurchaseCents ?? 0) + request.amountCents, purchases: [...current.purchases, { id, cents: request.amountCents, status: 'completed', date: new Date().toISOString().slice(0,10), merchantId, merchant: 'Campus Cafe Restaurant', categoryId: 'dining' }] };
    return { state: 'created', ...request, purchaseId: id, date: new Date().toISOString().slice(0,10), snapshot };
  };
  h.deps.publish = async reply => { if (reply?.mood === "happy") published.push(firebaseWalletBudget(h.state().budget)); };
  const processor = await walletEventProcessor(h.deps);
  await processor.handle(event());
  await processor.handle({ ...event(), id: 'abcdef0123456789-2', sequence: 2 });
  assert.equal(count, 2);
  assert.deepEqual(published.map(p => p.categories[0].left_cents), [2500, 1300]);
  assert.ok(published.every(p => p.categories[0].total_cents === 20000 && p.cards[0]?.uid === '44339A9E'));
  assert.equal(monthSpentByCategory(h.state().budget).dining, 18700);
  assert.equal(h.state().budget.bank.purchases.length, 3);
  await processor.handle(event());
  assert.equal(count, 2);
  await processor.handle({ ...event(), id: 'abcdef0123456789-3', sequence: 3 });
  assert.equal(published.at(-1).categories[0].left_cents, 100);
  assert.equal(published.at(-1).cards[0].uid, event().uid);
  await assert.rejects(processor.handle({ ...event(), id: 'abcdef0123456789-4', sequence: 4 }), /remaining Dining budget/);
  assert.equal(count, 3);
  assert.equal(h.state().budget.bank.purchases.length, 4);
  assert.equal(firebaseWalletBudget(h.state().budget).categories[0].left_cents, 100);
});

test('unrelated bank changes or missing refresh keep NFC paused after a verified receipt', () => {
  const original = fixture();
  const transaction = { id: 'receipt', categoryId: 'dining', merchant: 'Campus Cafe Restaurant', cents: 1200, createdAt: new Date().toISOString(), nessiePurchaseId: purchaseId, accountId };
  const snapshot = { ...original.bank, importedAt: new Date(Date.now()+1000).toISOString(), unreflectedPurchaseCents: 1200, purchases: [...original.bank.purchases, { id: purchaseId, cents: 1200, status: 'completed', date: new Date().toISOString().slice(0,10), merchantId, merchant: transaction.merchant, categoryId: 'dining' }] };
  const safe = reconcileNessiePurchase(original, transaction, snapshot);
  assert.equal(firebaseWalletBudget(safe).cards.length, 1);
  for (const changed of [null, { ...snapshot, unreflectedPurchaseCents: 2400 }, { ...snapshot, bills: [{ id: 'new-bill', cents: 1000, status: 'pending', date: '2099-01-01', payee: 'New bill' }] }, { ...snapshot, warnings: ['Bank data needs review'] }, { ...snapshot, deposits: [{ id: 'external', cents: 1000, status: 'completed', date: new Date().toISOString().slice(0,10), description: 'Deposit' }] }]) {
    const updated = reconcileNessiePurchase(original, transaction, changed);
    assert.equal(firebaseWalletBudget(updated).cards.length, 0);
    assert.equal(monthSpentByCategory(updated).dining, 17500);
  }
});

test('new firmware reply uses the hardware event ID and follows receipt application', async () => {
  const h = harness(), replies = [];
  h.deps.publish = async reply => {
    if (reply) { assert.equal(h.state().applies, 1); replies.push(reply); }
  };
  const processor = await walletEventProcessor(h.deps);
  await processor.handle(event());
  assert.deepEqual(replies[0], { id: event().id, mood: 'happy', message: 'Purchase verified' });
  assert.notEqual(replies[0].id, h.state().requests[0].requestId);
  assert.equal(processor.hasPending(), false);
});

test('uncertain purchases send a pending warning, keep the request, and never send a happy verdict', async () => {
  const h = harness(), replies = []; h.setUncertain(true);
  h.deps.publish = async reply => { if (reply) replies.push(reply); };
  const processor = await walletEventProcessor(h.deps);
  await assert.rejects(processor.handle(event()), /Check again/);
  assert.deepEqual(replies, [{ id: event().id, mood: 'sad', message: 'Pending - check Flow' }]);
  assert.equal(h.state().applies, 0);
  assert.equal(processor.hasPending(), true);
  assert.equal(processor.replyFor(event().id).mood, 'sad');
});

test('lost Firebase result is replayed from the journal without another Nessie request or deduction', async () => {
  const h = harness();
  h.deps.publish = async reply => { if (reply?.mood === 'happy') throw new Error('Firebase disconnected'); };
  const processor = await walletEventProcessor(h.deps);
  await assert.rejects(processor.handle(event()), /Firebase disconnected/);
  assert.equal(h.state().applies, 1);
  const replies = [];
  h.deps.publish = async reply => { if (reply) replies.push(reply); };
  await (await walletEventProcessor(h.deps)).retry();
  assert.equal(h.state().requests.length, 1);
  assert.equal(h.state().applies, 1);
  assert.equal(replies[0].id, event().id);
  assert.equal(replies[0].mood, 'happy');
});

test('firmware result contract rejects oversized, non-ASCII and malformed replies', () => {
  assert.equal(walletReply(event().id, 'sad', 'Purchase not completed').message.length <= 32, true);
  for (const [id, message] of [[event().id, 'x'.repeat(33)], [event().id, 'Paid ✓'], ['wrong-id', 'Done'], ['abcdef0123456789-9999999999', 'Done']]) assert.throws(() => walletReply(id, 'happy', message));
});

test('an old success verdict cannot be replayed onto a different selected account', async () => {
  const h = harness(), replies = [];
  h.deps.publish = async reply => { if (reply) replies.push(reply); };
  const processor = await walletEventProcessor(h.deps);
  await processor.handle(event());
  h.switchAccount();
  await assert.rejects(processor.handle(event()), /original account/);
  assert.equal(processor.replyFor(event().id), undefined);
  await processor.retry();
  assert.equal(replies.length, 1);
  assert.equal(h.state().requests.length, 1);
});
