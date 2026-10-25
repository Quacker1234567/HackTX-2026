import { cents, loadSnapshot, validId } from './nessie.mjs';
import { purchaseKey, withPurchaseReserves } from './purchase-journal.mjs';

function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
const uncertain = requestId => ({ state: 'uncertain', requestId, message: 'Nessie has not confirmed this purchase. Check again using the same request; do not start a replacement purchase.' });
const rejected = (requestId, message) => ({ state: 'rejected', requestId, message });

// One instance per local server. Its journal must live on persistent local disk.
export function createPurchaseHandler({ authorize, client, customerId, journal, snapshot = loadSnapshot, now = () => new Date() }) {
  let queue = Promise.resolve();
  async function perform(request) {
    authorize(request);
    const { requestId, accountId, merchantId, amountCents, firebaseUid } = request.data ?? {};
    if (firebaseUid !== request.auth.uid) fail('permission-denied', 'This purchase belongs to a different Firebase identity. Restore the original sign-in before checking it.');
    if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/.test(requestId) || !validId(accountId) || !validId(merchantId) || !Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > 10000000) {
      fail('invalid-argument', 'Choose an account, merchant and positive amount up to $100,000 with a valid request ID.');
    }
    if (amountCents % 100 !== 0) fail('invalid-argument', 'This Nessie sandbox truncates fractional dollars. Use a whole-dollar amount for the demo.');
    const customer = customerId();
    if (!validId(customer)) fail('failed-precondition', 'Configure the Nessie sample customer first.');
    const key = purchaseKey(request.auth.uid, requestId);
    const fingerprint = JSON.stringify([customer, accountId, merchantId, amountCents]);
    let entry;
    try { entry = await journal.get(key); }
    catch { fail('unavailable', 'Purchase journal is unavailable. No new purchase was sent. Keep the journal and check the backend.'); }
    if (entry && entry.fingerprint !== fingerprint) fail('failed-precondition', 'This request ID belongs to a different purchase. Keep its original details.');
    if (entry?.state === 'rejected') return rejected(requestId, entry.message);
    if (entry?.state === 'mismatch') return { state: 'mismatch', requestId, message: entry.message };
    const description = `Flow demo purchase ${key}`;
    async function save() {
      try { await journal.save(key, entry); }
      catch { fail('unavailable', 'Purchase outcome needs reconciliation. Keep this request ID and check again; do not make a replacement purchase.'); }
    }
    // Ownership is checked on replays too. Never return cached data outside its customer.
    let accounts;
    try { accounts = await client(`/customers/${customer}/accounts`); }
    catch { fail('unavailable', 'Nessie account verification failed. Keep this request and try again.'); }
    if (!Array.isArray(accounts)) fail('unavailable', 'Nessie account verification failed.');
    const account = accounts.find(a => a._id === accountId && ['Checking', 'Savings'].includes(a.type));
    if (!account) {
      if (entry) fail('permission-denied', 'The original account is unavailable. Keep this saved request for review.');
      return rejected(requestId, 'Select an account owned by the configured sample customer.');
    }
    if (entry && entry.state !== 'created') {
      // A previous process may have crashed after POST. Recovery only reads, never posts again.
      let purchases;
      try { purchases = await client(`/accounts/${accountId}/purchases`); }
      catch { return uncertain(requestId); }
      if (!Array.isArray(purchases)) return uncertain(requestId);
      const matching = purchases.filter(p => p.description === description);
      if (matching.length !== 1) return uncertain(requestId);
      const purchase = matching[0];
      if (!validId(purchase._id) || purchase.merchant_id !== merchantId || cents(purchase.amount) !== amountCents || String(purchase.status).toLowerCase() !== 'completed') return uncertain(requestId);
      entry = { ...entry, state: 'created', purchaseId: purchase._id, verified: true }; await save();
    }
    if (!entry) {
      let merchant;
      try { merchant = await client(`/merchants/${merchantId}`); }
      catch { return rejected(requestId, 'Merchant could not be verified. Import merchant data and try a new preview.'); }
      if (merchant?._id !== merchantId) return rejected(requestId, 'Select an existing Nessie merchant.');
      const funds = await withPurchaseReserves({ account: { id: accountId, balanceCents: cents(account.balance) }, warnings: [] }, journal);
      if (funds.warnings.length) return rejected(requestId, 'Review the bank balance and pending purchase reserve before making another purchase.');
      if (funds.account.balanceCents - funds.unreflectedPurchaseCents < amountCents) return rejected(requestId, 'The current Nessie account balance after pending Flow purchases cannot cover this purchase.');
      const proposed = { fingerprint, state: 'posting', accountId, merchantId, amountCents, balanceBeforeCents: cents(account.balance), date: now().toISOString().slice(0, 10) };
      let existing;
      try { existing = await journal.claim(key, proposed); }
      catch { fail('unavailable', 'The request could not be saved. No new purchase was sent.'); }
      // A second process won the exclusive claim. Re-enter the read-only recovery path.
      if (existing) return perform(request);
      entry = proposed;
      let response;
      try {
        response = await client(`/accounts/${accountId}/purchases`, { merchant_id: merchantId, medium: 'balance', purchase_date: entry.date, status: 'completed', amount: amountCents / 100, description });
      } catch (error) {
        if ([400, 401, 403, 404, 422].includes(error.status)) {
          entry = { ...entry, state: 'rejected', message: 'Nessie rejected this purchase. Check the account, merchant, amount and backend configuration.' }; await save();
          return rejected(requestId, entry.message);
        }
        return uncertain(requestId);
      }
      const purchaseId = response?.objectCreated?._id ?? response?.object_created?._id ?? response?._id;
      if (!validId(purchaseId)) return uncertain(requestId);
      entry = { ...entry, state: 'created', purchaseId }; await save();
    }
    if (!entry.verified) {
      let purchases;
      try { purchases = await client(`/accounts/${accountId}/purchases`); } catch { return uncertain(requestId); }
      const row = Array.isArray(purchases) ? purchases.find(p => p._id === entry.purchaseId) : null;
      if (!row) return uncertain(requestId);
      if (row.merchant_id !== merchantId || cents(row.amount) !== amountCents || String(row.status).toLowerCase() !== 'completed' || row.description !== description) {
        entry = { ...entry, state: 'mismatch', message: 'Nessie saved transaction details that differ from the confirmed purchase. Keep this request and review the sandbox record; the local budget has not been charged.' }; await save();
        return { state: 'mismatch', requestId, message: entry.message };
      }
      entry = { ...entry, verified: true }; await save();
    }
    let fresh = null;
    try { fresh = await snapshot(client, customer, accountId); } catch { /* A receipt survives a separate read failure. */ }
    if (fresh) {
      if (entry.balanceReflected === undefined && Number.isSafeInteger(entry.balanceBeforeCents)) {
        entry = { ...entry, balanceReflected: fresh.account.balanceCents === entry.balanceBeforeCents - amountCents }; await save();
      }
      fresh = await withPurchaseReserves(fresh, journal);
    }
    return { state: 'created', requestId, purchaseId: entry.purchaseId, accountId, merchantId, amountCents, date: entry.date, snapshot: fresh };
  }
  return request => {
    const result = queue.then(() => perform(request));
    queue = result.catch(() => {});
    return result;
  };
}
