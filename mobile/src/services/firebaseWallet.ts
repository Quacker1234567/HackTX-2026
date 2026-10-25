import AsyncStorage from '@react-native-async-storage/async-storage';
import { get, getDatabase, onChildAdded, onValue, orderByChild, query, ref, runTransaction, startAt } from 'firebase/database';
import type { Budget, Transaction } from '../domain/budget';
import { WalletBudgetExceededError, firebaseWalletBudget, walletPlanReady, walletReply, type WalletEvent, type WalletReply } from '../domain/hardware';
import { walletEventProcessor, type WalletJournal } from '../domain/wallet-events';
import { createNessiePurchase, type NessiePurchaseResult } from './banking';
import { ensureFirebaseUser, firebaseApp } from './firebase';

export const walletDeviceId = process.env.EXPO_PUBLIC_WALLET_DEVICE_ID?.trim() || 'wallet-001';
export const walletDatabaseUrl = process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL?.trim().replace(/\/$/, '') || '';
export type WalletStatus = { last_seen?: number; boot_id?: string; last_ack_id?: string };
type Options = {
  getBudget: () => Budget;
  apply: (transaction: Transaction, snapshot: Extract<NessiePurchaseResult, { state: 'created' }>['snapshot']) => Promise<void>;
  onStatus: (status: WalletStatus | null) => void; onMessage: (message: string) => void;
};

export async function connectFirebaseWallet(options: Options) {
  if (!walletDatabaseUrl || new URL(walletDatabaseUrl).protocol !== 'https:') throw new Error('Add the Realtime Database HTTPS URL to mobile/.env.');
  if (!/^[A-Za-z0-9_-]{1,48}$/.test(walletDeviceId)) throw new Error('Invalid wallet device ID.');
  const user = await ensureFirebaseUser();
  const db = getDatabase(firebaseApp(), walletDatabaseUrl);
  let access;
  try { access = (await get(ref(db, `deviceAccess/${walletDeviceId}`))).val(); }
  catch { throw new Error('Wallet access denied. Its ownerUid must match your Flow connection ID; keep deviceUid unchanged.'); }
  if (access?.ownerUid !== user.uid) throw new Error(`Set this wallet’s ownerUid to your Flow connection ID in Firebase. Keep its deviceUid unchanged.`);
  if (!options.getBudget().bank) throw new Error('Import the student checking account first.');
  const prefix = `flow.wallet.${walletDeviceId}.${user.uid}`;
  const journalKey = `${prefix}.purchases.v1`;
  const sinceKey = `${prefix}.since`;
  const savedSince = await AsyncStorage.getItem(sinceKey);
  const since = savedSince ? Number(savedSince) : Date.now();
  if (!Number.isFinite(since) || since < 0) throw new Error('Wallet replay checkpoint needs review. Keep app storage.');
  await AsyncStorage.setItem(sinceKey, String(since));
  let stopped = false;
  let lastPublished = '';
  let writes: Promise<void> = Promise.resolve();
  let purchasesPending = () => false;
  let lastReply: WalletReply | undefined;
  const report = (error: unknown) => options.onMessage(error instanceof Error ? error.message : 'Wallet connection failed.');
  function sync(force = false, reply?: WalletReply) {
    const next = writes.catch(() => {}).then(async () => {
      if (stopped) return;
      const state = options.getBudget();
      const budget = firebaseWalletBudget(state);
      if (purchasesPending()) budget.cards = [];
      if (reply) lastReply = reply;
      if (!budget.categories.length) throw new Error('Apply a funded budget before sending it to the wallet.');
      const display = { line1: 'Flow', line2: walletPlanReady(state) ? state.plan!.periodLabel.slice(0, 32) : 'Review budget in app' };
      const fingerprint = JSON.stringify({ budget, display, transaction: lastReply ?? null });
      if (!force && fingerprint === lastPublished) return;
      const commandId = `flow-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      await runTransaction(ref(db, `wallets/${walletDeviceId}/control/desired`), previous => ({
        type: 'device_update', command_id: commandId, issued_at: Date.now(), display, budget,
        ...(lastReply ? { transaction: lastReply } : {}),
        ...(previous?.reader ? { reader: previous.reader } : {}),
      }), { applyLocally: false });
      lastPublished = fingerprint;
    });
    writes = next; return next;
  }
  const processor = await walletEventProcessor({
    deviceId: walletDeviceId, firebaseUid: user.uid, getBudget: options.getBudget,
    load: async () => {
      const raw = await AsyncStorage.getItem(journalKey);
      const saved = raw ? JSON.parse(raw) : {};
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw new Error('Wallet purchase journal needs review. Keep app storage.');
      return saved as WalletJournal;
    },
    save: entries => AsyncStorage.setItem(journalKey, JSON.stringify(entries)),
    purchase: createNessiePurchase, apply: options.apply,
    manualPurchasePending: async () => !!await AsyncStorage.getItem('flow.nessie.purchase.v1'),
    publish: reply => sync(false, reply),
  });
  purchasesPending = processor.hasPending;
  // Publish first: a failed rule/ownership check cannot leave a purchase listener active.
  await sync(true);
  const stopStatus = onValue(ref(db, `wallets/${walletDeviceId}/status`), value => options.onStatus(value.val()), report);
  const stopEvents = onChildAdded(query(ref(db, `wallets/${walletDeviceId}/events`), orderByChild('created_at'), startAt(since)), value => {
    if (stopped || value.val()?.type !== 'purchase_confirm') return;
    const event = { ...value.val(), id: value.key } as WalletEvent;
    options.onMessage('Checking wallet purchase with Nessie…');
    void processor.handle(event).then(() => options.onMessage('Wallet purchase verified.')).catch(async error => {
      report(error);
      let reply = processor.replyFor(event.id);
      try { reply ??= walletReply(event.id, 'sad', error instanceof WalletBudgetExceededError ? 'Over budget' : 'Check purchase in Flow'); } catch { /* malformed event IDs cannot be answered */ }
      try { await sync(true, reply); } catch (syncError) { report(syncError); }
    });
  }, report);
  // Recover a receipt/request even when its event is older than the live query.
  void processor.retry().catch(report);
  return {
    sync,
    retry: async () => { await processor.retry(); await sync(true); },
    stop: () => { stopped = true; stopEvents(); stopStatus(); },
  };
}
