import type { Budget, Transaction } from './budget';
import { WalletBudgetExceededError, walletAttempt, walletReply, type WalletEvent, type WalletReply } from './hardware.ts';
import type { NessiePurchaseRequest, NessiePurchaseResult } from '../services/banking';

type Record = { request: NessiePurchaseRequest; transaction: Transaction; result?: NessiePurchaseResult; applied?: boolean; reply?: WalletReply };
export type WalletJournal = { [eventId: string]: Record };
type Dependencies = {
  deviceId: string; firebaseUid: string; getBudget: () => Budget;
  load: () => Promise<WalletJournal>; save: (journal: WalletJournal) => Promise<void>;
  purchase: (request: NessiePurchaseRequest) => Promise<NessiePurchaseResult>;
  apply: (transaction: Transaction, snapshot: Extract<NessiePurchaseResult, { state: 'created' }>['snapshot']) => Promise<void>;
  manualPurchasePending: () => Promise<boolean>; publish: (reply?: WalletReply) => Promise<void>;
};
// The backend's durable idempotency journal handles cross-device/restart races.
// This local journal preserves confirmed requests and receipts before side effects.
export async function walletEventProcessor(deps: Dependencies) {
  const entries = await deps.load();
  let queue: Promise<void> = Promise.resolve();
  const serialized = (action: () => Promise<void>) => {
    const next = queue.catch(() => {}).then(action); queue = next; return next;
  };
  async function process(eventId: string, entry: Record) {
    if (entry.request.firebaseUid !== deps.firebaseUid || entry.request.accountId !== deps.getBudget().bank?.account.id) throw new Error('Reconnect the original account to finish this wallet purchase.');
    if (entry.applied) { await deps.publish(entry.reply ?? walletReply(eventId, 'happy', 'Purchase verified')); return; }
    if (entry.result?.state === 'rejected' || entry.result?.state === 'mismatch') {
      await deps.publish(entry.reply ?? walletReply(eventId, 'sad', 'Check purchase in Flow'));
      throw new Error(entry.result.message);
    }
    if (await deps.manualPurchasePending()) throw new Error('Finish the pending phone purchase before retrying the wallet.');
    // Retrying after a failed local save must persist the same request before POST.
    await deps.save(entries);
    await deps.publish(); // withhold new cards while a confirmed request is unresolved
    const result = entry.result?.state === 'created' ? entry.result : await deps.purchase(entry.request);
    entry.result = result;
    if (result.state !== 'created') entry.reply = walletReply(eventId, 'sad', result.state === 'rejected' ? 'Purchase not completed' : 'Pending - check Flow');
    await deps.save(entries);
    if (result.state !== 'created') {
      await deps.publish(entry.reply);
      throw new Error(result.message);
    }
    const request = entry.request;
    if (result.requestId !== request.requestId || result.accountId !== request.accountId || result.merchantId !== request.merchantId || result.amountCents !== request.amountCents || !/^(?:[a-f\d]{24}|[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12})$/i.test(result.purchaseId)) throw new Error('Wallet receipt mismatch. Keep this saved purchase for review.');
    await deps.apply({ ...entry.transaction, nessiePurchaseId: result.purchaseId, accountId: result.accountId }, result.snapshot);
    entry.applied = true;
    entry.reply = walletReply(eventId, 'happy', 'Purchase verified');
    await deps.save(entries);
    await deps.publish(entry.reply);
  }
  return {
    handle: (event: WalletEvent) => serialized(async () => {
      let entry = entries[event.id];
      if (!entry) {
        const unfinished = Object.values(entries).some(e => !e.applied && e.result?.state !== 'rejected' && e.result?.state !== 'mismatch');
        if (unfinished) throw new Error('Retry the saved wallet purchase before confirming another.');
        try {
          entry = walletAttempt(deps.getBudget(), event, deps.firebaseUid, deps.deviceId);
        } catch (error) {
          if (error instanceof WalletBudgetExceededError) await deps.publish(walletReply(event.id, 'sad', 'Over budget'));
          throw error;
        }
        entries[event.id] = entry;
        await deps.save(entries);
      }
      await process(event.id, entry);
    }),
    retry: () => serialized(async () => {
      let processed = false;
      for (const [id, entry] of Object.entries(entries)) {
        if (!entry.applied && entry.result?.state !== 'rejected' && entry.result?.state !== 'mismatch') { await process(id, entry); processed = true; }
      }
      // A result may have been saved just before Firebase disconnected. Replay
      // only the latest verdict; never re-publish the whole purchase history.
      const latest = Object.values(entries).at(-1);
      if (!processed && latest?.reply && latest.request.firebaseUid === deps.firebaseUid && latest.request.accountId === deps.getBudget().bank?.account.id) await deps.publish(latest.reply);
    }),
    replyFor: (id: string) => entries[id]?.request.firebaseUid === deps.firebaseUid && entries[id]?.request.accountId === deps.getBudget().bank?.account.id ? entries[id].reply : undefined,
    hasPending: () => Object.values(entries).some(e => !e.applied && e.result?.state !== 'rejected' && e.result?.state !== 'mismatch'),
  };
}
