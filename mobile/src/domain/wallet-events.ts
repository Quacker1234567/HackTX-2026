import type { Budget, Transaction } from './budget';
import { walletAttempt, type WalletEvent } from './hardware.ts';
import type { NessiePurchaseRequest, NessiePurchaseResult } from '../services/banking';

type Record = { request: NessiePurchaseRequest; transaction: Transaction; result?: NessiePurchaseResult; applied?: boolean };
export type WalletJournal = { [eventId: string]: Record };
type Dependencies = {
  deviceId: string; firebaseUid: string; getBudget: () => Budget;
  load: () => Promise<WalletJournal>; save: (journal: WalletJournal) => Promise<void>;
  purchase: (request: NessiePurchaseRequest) => Promise<NessiePurchaseResult>;
  apply: (transaction: Transaction, snapshot: Extract<NessiePurchaseResult, { state: 'created' }>['snapshot']) => Promise<void>;
  manualPurchasePending: () => Promise<boolean>; publish: () => Promise<void>;
};
// The backend's durable idempotency journal handles cross-device/restart races.
// This local journal preserves confirmed requests and receipts before side effects.
export async function walletEventProcessor(deps: Dependencies) {
  const entries = await deps.load();
  let queue: Promise<void> = Promise.resolve();
  const serialized = (action: () => Promise<void>) => {
    const next = queue.catch(() => {}).then(action); queue = next; return next;
  };
  async function process(entry: Record) {
    if (entry.applied) return;
    if (entry.result?.state === 'rejected' || entry.result?.state === 'mismatch') throw new Error(entry.result.message);
    if (entry.request.firebaseUid !== deps.firebaseUid || entry.request.accountId !== deps.getBudget().bank?.account.id) throw new Error('Reconnect the original account to finish this wallet purchase.');
    if (await deps.manualPurchasePending()) throw new Error('Finish the pending phone purchase before retrying the wallet.');
    // Retrying after a failed local save must persist the same request before POST.
    await deps.save(entries);
    const result = entry.result?.state === 'created' ? entry.result : await deps.purchase(entry.request);
    entry.result = result;
    await deps.save(entries);
    if (result.state !== 'created') {
      await deps.publish();
      throw new Error(result.message);
    }
    const request = entry.request;
    if (result.requestId !== request.requestId || result.accountId !== request.accountId || result.merchantId !== request.merchantId || result.amountCents !== request.amountCents || !/^(?:[a-f\d]{24}|[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12})$/i.test(result.purchaseId)) throw new Error('Wallet receipt mismatch. Keep this saved purchase for review.');
    await deps.apply({ ...entry.transaction, nessiePurchaseId: result.purchaseId, accountId: result.accountId }, result.snapshot);
    entry.applied = true;
    await deps.save(entries);
    await deps.publish();
  }
  return {
    handle: (event: WalletEvent) => serialized(async () => {
      let entry = entries[event.id];
      if (!entry) {
        const unfinished = Object.values(entries).some(e => !e.applied && e.result?.state !== 'rejected' && e.result?.state !== 'mismatch');
        if (unfinished) throw new Error('Retry the saved wallet purchase before confirming another.');
        entry = walletAttempt(deps.getBudget(), event, deps.firebaseUid, deps.deviceId);
        entries[event.id] = entry;
        await deps.save(entries);
      }
      await process(entry);
    }),
    retry: () => serialized(async () => { for (const entry of Object.values(entries)) if (entry.result?.state !== 'rejected' && entry.result?.state !== 'mismatch') await process(entry); }),
  };
}
