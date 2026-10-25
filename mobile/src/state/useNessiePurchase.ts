import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Transaction } from '../domain/budget';
import { createNessiePurchase, NessiePurchaseRequest, NessiePurchaseResult } from '../services/banking';
import { ensureFirebaseUser } from '../services/firebase';
import { useBudget } from './BudgetProvider';

// One pending request at a time, shared by every screen that can create a purchase,
// so an uncertain outcome is recoverable from wherever the user reopens the app.
const PENDING_KEY = 'flow.nessie.purchase.v1';
const NESSIE_ID = /^(?:[a-f\d]{24}|[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12})$/i;
export type Attempt = { request: NessiePurchaseRequest; transaction: Transaction; phase: 'preview' | 'submitted'; result?: NessiePurchaseResult };
export type PreviewInput = { accountId: string; merchantId: string; merchantName: string; categoryId: string; cents: number; remainingCents: number };

export function receipt(attempt: Attempt): Transaction {
  const { result, request } = attempt;
  if (result?.state !== 'created' || result.requestId !== request.requestId || result.accountId !== request.accountId || result.merchantId !== request.merchantId || result.amountCents !== request.amountCents || typeof result.purchaseId !== 'string' || !NESSIE_ID.test(result.purchaseId)) throw new Error('Receipt details do not match this purchase. Keep the saved request for review.');
  return { ...attempt.transaction, nessiePurchaseId: result.purchaseId, accountId: result.accountId };
}

export function useNessiePurchase() {
  const { ready, applyNessiePurchase } = useBudget();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const running = useRef(false);
  useEffect(() => {
    if (!ready) return;
    let active = true;
    async function restore() {
      try {
        const raw = await AsyncStorage.getItem(PENDING_KEY);
        if (!active) return;
        if (raw) {
          const saved: Attempt = JSON.parse(raw);
          if (!saved?.request?.requestId || !saved.transaction || !['preview', 'submitted'].includes(saved.phase)) throw new Error('Saved purchase needs review. Keep app storage and inspect the pending request.');
          setAttempt(saved);
          if (saved.result?.state === 'created') {
            await applyNessiePurchase(receipt(saved), saved.result.snapshot);
            await AsyncStorage.removeItem(PENDING_KEY);
            if (active) { setAttempt(null); setMessage('Saved Nessie receipt recovered. Your budget is updated once.'); }
          } else if (saved.result) setMessage(saved.result.message);
          else if (saved.phase === 'submitted') setMessage('A previous purchase needs checking. Use the same saved request below.');
        }
        if (active) setLoaded(true);
      } catch (error) { if (active) setMessage(error instanceof Error ? error.message : 'Saved purchase could not be restored.'); }
    }
    void restore();
    return () => { active = false; };
  }, [ready, applyNessiePurchase]);
  const run = useCallback(async (action: () => Promise<void>) => {
    if (running.current) return;
    running.current = true; setBusy(true);
    try { await action(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Purchase could not be confirmed. Keep the saved request and check again.'); }
    finally { running.current = false; setBusy(false); }
  }, []);
  const preview = useCallback(async (input: PreviewInput) => {
    if (!Number.isSafeInteger(input.cents) || input.cents <= 0) throw new Error('Enter a positive amount.');
    if (input.cents % 100 !== 0) throw new Error('Use a whole-dollar amount, such as $35. This sandbox truncates cents.');
    if (input.cents > input.remainingCents) throw new Error('This purchase exceeds the remaining category budget.');
    const user = await ensureFirebaseUser();
    const requestId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
    const next: Attempt = {
      phase: 'preview',
      request: { requestId, accountId: input.accountId, merchantId: input.merchantId, amountCents: input.cents, firebaseUid: user.uid },
      transaction: { id: requestId, categoryId: input.categoryId, merchant: input.merchantName, cents: input.cents, createdAt: new Date().toISOString() },
    };
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(next));
    setAttempt(next); setMessage('Preview only. Confirm below to create this sandbox purchase.');
  }, []);
  const confirm = useCallback(async () => {
    if (!attempt) return;
    const submitted: Attempt = { ...attempt, phase: 'submitted' };
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(submitted)); setAttempt(submitted);
    const result = submitted.result?.state === 'created' ? submitted.result : await createNessiePurchase(submitted.request);
    const received = { ...submitted, result };
    // Save the receipt before changing the budget; recovery can apply it again safely after a crash.
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(received)); setAttempt(received);
    if (result.state !== 'created') { setMessage(result.message); return; }
    await applyNessiePurchase(receipt(received), result.snapshot);
    await AsyncStorage.removeItem(PENDING_KEY); setAttempt(null);
    setMessage(result.snapshot ? 'Nessie purchase created. Bank data refreshed and category spending updated once. Review your plan in Banking if prompted.' : 'Nessie purchase created and category spending updated. Bank refresh failed; import the account again in Connections. Do not resubmit this purchase.');
  }, [attempt, applyNessiePurchase]);
  const cancel = useCallback(async () => {
    await AsyncStorage.removeItem(PENDING_KEY);
    setAttempt(null); setMessage('Preview cleared. No confirmed purchase was removed.');
  }, []);
  return { attempt, message, busy, loaded, setMessage, run, preview, confirm, cancel };
}
