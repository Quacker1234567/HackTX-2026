import test from 'node:test';
import assert from 'node:assert/strict';
import { cents, createNessieClient, loadSnapshot, NESSIE_ORIGIN, validId } from '../src/nessie.mjs';

const id = n => n.toString(16).padStart(24, '0');
test('IDs accept current Nessie UUIDs and legacy object IDs, rejecting paths', () => {
  assert.equal(validId('98e3ad37-cf8f-4da3-bacd-84b1e8eadcaf'), true);
  assert.equal(validId(id(1)), true);
  for (const value of ['../customers', 'bad', '', null, 'a/b', '98e3ad37-cf8f-4da3-bacd-84b1e8eadcaf?key=x']) assert.equal(validId(value), false);
});
test('Nessie adapter uses HTTPS and does not expose response text or credentials in errors', async () => {
  let captured;
  const api = createNessieClient('private-test-key', async (url, options) => {
    captured = { url, options }; return { ok: false, status: 403, text: () => 'private-test-key' };
  });
  await assert.rejects(api('/customers'), error => error.status === 403 && !error.message.includes('private-test-key'));
  assert.equal(captured.url.origin, NESSIE_ORIGIN);
  assert.equal(captured.url.searchParams.get('key'), 'private-test-key');
  assert.equal(captured.options.redirect, 'error');
  await assert.rejects(api('/accounts?key=overwrite'));
});
test('money conversion preserves cents and rejects malformed amounts', () => {
  assert.equal(cents(12.05), 1205);
  assert.equal(cents(0.29), 29);
  assert.throws(() => cents('12.05'));
  assert.throws(() => cents(Infinity));
});
test('snapshot checks account ownership, deduplicates history, normalizes both purchase date schemas', async () => {
  const account = { _id: id(2), type: 'Checking', nickname: 'Demo', balance: 500 };
  const purchase = { _id: id(3), amount: 35, status: 'completed', merchant_id: id(4), purchase_date: '2026-10-20' };
  const calls = [];
  const api = async path => {
    calls.push(path);
    if (path.endsWith('/accounts')) return [account];
    if (path.endsWith('/purchases')) return [purchase, purchase, { ...purchase, _id: id(6), purchase_date: undefined, transaction_date: '2026-10-21' }];
    if (path.endsWith('/deposits')) return [{ _id: id(7), amount: 1000, status: 'completed', transaction_date: '2026-10-18' }];
    if (path.endsWith('/bills')) return [{ _id: id(8), payment_amount: 12.05, status: 'pending', upcoming_payment_date: '2026-10-30' }];
    if (path.startsWith('/merchants')) return { _id: id(4), name: 'Cafe', category: ['restaurant'], geocode: { lat: 30, lng: -97 } };
    throw new Error('Unexpected path');
  };
  const result = await loadSnapshot(api, id(1), id(2));
  assert.equal(result.account.balanceCents, 50000);
  assert.equal(result.purchases.length, 2);
  assert.equal(result.purchases[0].categoryId, 'dining');
  assert.equal(result.purchases[0].date, '2026-10-20');
  assert.equal(result.purchases[1].date, '2026-10-21');
  assert.equal(result.bills[0].cents, 1205);
  assert.equal(calls.filter(p => p.startsWith('/merchants')).length, 1);
  const before = calls.length;
  await assert.rejects(loadSnapshot(api, id(1), id(99)));
  assert.equal(calls.length, before + 1, 'reject unrelated account before reading its transactions');
});
test('required endpoint failures reject the import instead of returning misleading empty data', async () => {
  const api = async path => {
    if (path.endsWith('/accounts')) return [{ _id: id(2), type: 'Checking', balance: 100 }];
    throw new Error('Unavailable');
  };
  await assert.rejects(loadSnapshot(api, id(1), id(2)));
});
test('unavailable bills are explicitly marked incomplete so planning cannot silently omit obligations', async () => {
  const api = async path => {
    if (path.endsWith('/accounts')) return [{ _id: id(2), type: 'Checking', balance: 100 }];
    if (path.endsWith('/bills')) throw new Error('Nessie bill schema failure');
    return [];
  };
  const result = await loadSnapshot(api, id(1), id(2));
  assert.deepEqual(result.bills, []);
  assert.ok(result.warnings.some(w => w.includes('Budget approval is blocked')));
});
