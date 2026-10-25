import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPurchaseHandler, createReconcileHandler } from '../src/purchases.mjs';
import { filePurchaseJournal } from '../src/purchase-journal.mjs';

const id = n => n.toString(16).padStart(24, '0');
const request = (overrides = {}) => ({ auth: { uid: 'tester' }, data: { requestId: 'purchase-request-001', firebaseUid: 'tester', accountId: id(2), merchantId: id(3), amountCents: 3500, ...overrides } });
async function fixture(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'flow-purchase-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const writes = []; const purchases = []; const calls = [];
  let balance = 500; let failSnapshot = false;
  const client = async (path, body) => {
    calls.push(path);
    if (body) {
      writes.push(body);
      if (options.timeoutBeforeCreate) throw new Error('private network details');
      if (options.rejected) { const error = new Error('private upstream'); error.status = 400; throw error; }
      const row = { _id: id(9 + writes.length), ...body, amount: options.roundAmount ? 0 : body.amount }; purchases.push(row);
      if (options.settleBalance) balance -= body.amount;
      if (options.timeout) throw new Error('private network details');
      return options.noId ? {} : { objectCreated: { _id: row._id } };
    }
    if (path.endsWith('/accounts')) return [{ _id: id(2), type: 'Checking', balance }];
    if (path === `/merchants/${id(3)}`) return { _id: id(3), name: 'Cafe' };
    if (path.endsWith('/purchases')) return purchases;
    throw new Error('Unexpected path');
  };
  const handlerOptions = {
    authorize: req => { if (req.auth?.uid !== 'tester') { const error = new Error('Not allowed'); error.code = 'permission-denied'; throw error; } },
    client, customerId: () => id(1), journal: filePurchaseJournal(directory),
    now: () => new Date('2026-10-25T01:00:00Z'),
    snapshot: async () => { if (failSnapshot) throw new Error('private read failure'); return { account: { id: id(2), balanceCents: Math.round(balance * 100) }, purchases }; },
  };
  const make = () => createPurchaseHandler(handlerOptions);
  return { handler: make(), make, reconcile: createReconcileHandler(handlerOptions), writes, calls, setBalance: value => { balance = value; }, failSnapshot: () => { failSnapshot = true; } };
}
test('creates one purchase, normalizes dollars and refreshes; replay after server restart never writes twice', async t => {
  const f = await fixture(t);
  const first = await f.handler(request());
  assert.equal(first.state, 'created'); assert.equal(first.purchaseId, id(10)); assert.equal(first.snapshot.account.id, id(2));
  assert.equal(f.writes[0].amount, 35); assert.equal(f.writes[0].medium, 'balance');
  assert.equal(f.writes[0].purchase_date, '2026-10-25'); assert.equal(f.writes[0].status, 'completed');
  assert.ok(!f.writes[0].description.includes('tester'));
  assert.equal((await f.make()(request())).purchaseId, first.purchaseId);
  assert.equal(f.writes.length, 1);
});
test('simultaneous identical confirmations create one upstream purchase', async t => {
  const f = await fixture(t);
  const results = await Promise.all([f.handler(request()), f.handler(request()), f.handler(request())]);
  assert.ok(results.every(r => r.state === 'created')); assert.equal(f.writes.length, 1);
});
test('timeout after a successful upstream write is reconciled by reading its marker', async t => {
  const f = await fixture(t, { timeout: true });
  assert.equal((await f.handler(request())).state, 'uncertain');
  assert.equal((await f.make()(request())).state, 'created'); assert.equal(f.writes.length, 1);
});
test('missing created ID is uncertain and read-only recovery can find the saved purchase', async t => {
  const f = await fixture(t, { noId: true });
  assert.equal((await f.handler(request())).state, 'uncertain');
  assert.equal((await f.handler(request())).state, 'created'); assert.equal(f.writes.length, 1);
});
test('an uncertain request with no matching upstream record never posts again', async t => {
  const f = await fixture(t, { timeoutBeforeCreate: true });
  await f.handler(request());
  assert.equal((await f.make()(request())).state, 'uncertain'); assert.equal(f.writes.length, 1);
});
test('authentication, identity changes and invalid values fail before sending data', async t => {
  const f = await fixture(t);
  await assert.rejects(f.handler({ ...request(), auth: null }));
  await assert.rejects(f.handler(request({ firebaseUid: 'different-user' })));
  for (const amountCents of [0, -1, 1.5, Infinity, 10000001]) await assert.rejects(f.handler(request({ amountCents })));
  await assert.rejects(f.handler(request({ merchantId: '../secret' })));
  assert.equal(f.calls.length, 0); assert.equal(f.writes.length, 0);
});
test('unowned accounts, unknown merchants and insufficient funds cannot create a purchase', async t => {
  const f = await fixture(t);
  assert.equal((await f.handler(request({ accountId: id(99) }))).state, 'rejected');
  assert.equal((await f.handler(request({ requestId: 'purchase-request-002', merchantId: id(99) }))).state, 'rejected');
  f.setBalance(1);
  assert.equal((await f.handler(request({ requestId: 'purchase-request-003' }))).state, 'rejected');
  assert.equal(f.writes.length, 0);
});
test('a request ID cannot be reused with changed amount or merchant', async t => {
  const f = await fixture(t); await f.handler(request());
  await assert.rejects(f.handler(request({ amountCents: 3600 })), e => e.code === 'failed-precondition');
  await assert.rejects(f.handler(request({ merchantId: id(4) })));
  assert.equal(f.writes.length, 1);
});
test('a snapshot read failure preserves the successful purchase receipt on retry', async t => {
  const f = await fixture(t); f.failSnapshot();
  const result = await f.handler(request());
  assert.equal(result.state, 'created'); assert.equal(result.snapshot, null);
  assert.equal((await f.handler(request())).purchaseId, result.purchaseId); assert.equal(f.writes.length, 1);
});
test('definite upstream rejection does not leak private errors or automatically retry', async t => {
  const f = await fixture(t, { rejected: true });
  const result = await f.handler(request());
  assert.equal(result.state, 'rejected'); assert.ok(!result.message.includes('private'));
  assert.equal((await f.handler(request())).state, 'rejected'); assert.equal(f.writes.length, 1);
});

test('separate handler instances racing for the same journal can send at most one POST', async t => {
  const f = await fixture(t);
  await Promise.allSettled([f.handler(request()), f.make()(request())]);
  assert.equal(f.writes.length, 1);
  assert.equal((await f.make()(request())).state, 'created');
});
test('fractional dollars are rejected before writing because the live sandbox truncates cents', async t => {
  const f = await fixture(t);
  await assert.rejects(f.handler(request({ amountCents: 3501 })), e => e.code === 'invalid-argument');
  assert.equal(f.writes.length, 0); assert.equal(f.calls.length, 0);
});

test('saved amount mismatch cannot be reported as a successful receipt or retried as a new POST', async t => {
  const f = await fixture(t, { roundAmount: true });
  assert.equal((await f.handler(request())).state, 'mismatch');
  assert.equal((await f.handler(request())).state, 'mismatch'); assert.equal(f.writes.length, 1);
});
test('unreflected Flow debits reserve funds once, including across server restarts', async t => {
  const f = await fixture(t); f.setBalance(50);
  const first = await f.handler(request());
  assert.equal(first.snapshot.unreflectedPurchaseCents, 3500);
  assert.equal((await f.make()(request())).snapshot.unreflectedPurchaseCents, 3500);
  assert.equal((await f.handler(request({ requestId: 'purchase-request-002' }))).state, 'rejected');
  assert.equal(f.writes.length, 1);
});
test('a debit already reflected in the reported balance needs no extra reserve', async t => {
  const f = await fixture(t, { settleBalance: true });
  const first = await f.handler(request());
  assert.equal(first.snapshot.account.balanceCents, 46500);
  assert.equal(first.snapshot.unreflectedPurchaseCents, 0);
});

const reconcileRequest = (overrides = {}) => ({ auth: { uid: 'tester' }, data: { accountId: id(2), purchaseId: id(10), disposition: 'settled', ...overrides } });
test('reviewing a Flow debit releases its reserve without touching the upstream record', async t => {
  const f = await fixture(t);
  const created = await f.handler(request());
  assert.equal(created.snapshot.unreflectedPurchaseCents, 3500);
  const after = await f.reconcile(reconcileRequest());
  assert.equal(after.unreflectedPurchaseCents, 0);
  assert.deepEqual(after.voidedPurchaseIds, []);
  assert.deepEqual(after.flowDebits, []);
  // Only the original POST was ever written; reconciliation is journal-only.
  assert.equal(f.writes.length, 1);
});
test('a debit marked as rehearsal is reported so it stops informing category pacing', async t => {
  const f = await fixture(t);
  await f.handler(request());
  const after = await f.reconcile(reconcileRequest({ disposition: 'void' }));
  assert.equal(after.unreflectedPurchaseCents, 0);
  assert.deepEqual(after.voidedPurchaseIds, [id(10)]);
  assert.equal(f.writes.length, 1);
});
test('reconciling twice is safe, and reclassifying keeps the reserve released', async t => {
  const f = await fixture(t);
  await f.handler(request());
  await f.reconcile(reconcileRequest());
  const repeated = await f.reconcile(reconcileRequest());
  assert.equal(repeated.unreflectedPurchaseCents, 0);
  const reclassified = await f.reconcile(reconcileRequest({ disposition: 'void' }));
  assert.equal(reclassified.unreflectedPurchaseCents, 0);
  assert.deepEqual(reclassified.voidedPurchaseIds, [id(10)]);
});
test('reconciliation rejects unknown purchases, foreign accounts, bad dispositions and other testers', async t => {
  const f = await fixture(t);
  await f.handler(request());
  await assert.rejects(() => f.reconcile(reconcileRequest({ purchaseId: id(77) })), e => e.code === 'failed-precondition');
  await assert.rejects(() => f.reconcile(reconcileRequest({ accountId: id(78) })), e => e.code === 'permission-denied');
  await assert.rejects(() => f.reconcile(reconcileRequest({ disposition: 'deleted' })), e => e.code === 'invalid-argument');
  await assert.rejects(() => f.reconcile({ auth: { uid: 'intruder' }, data: reconcileRequest().data }), e => e.code === 'permission-denied');
  // A rejected review leaves the reserve in place.
  const snapshot = await f.reconcile(reconcileRequest({ disposition: 'settled' }));
  assert.equal(snapshot.unreflectedPurchaseCents, 0);
});
