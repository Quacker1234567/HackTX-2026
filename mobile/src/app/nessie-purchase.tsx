import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Button, colors, Field, styles } from '../components/ui';
import { money, parseMoney, Transaction } from '../domain/budget';
import { dayKey } from '../domain/banking';
import { createNessiePurchase, NessiePurchaseRequest, NessiePurchaseResult } from '../services/banking';
import { ensureFirebaseUser } from '../services/firebase';
import { useBudget } from '../state/BudgetProvider';

const PENDING_KEY = 'flow.nessie.purchase.v1';
type Attempt = { request: NessiePurchaseRequest; transaction: Transaction; phase: 'preview' | 'submitted'; result?: NessiePurchaseResult };
function receipt(attempt: Attempt): Transaction {
  const result = attempt.result;
  const request = attempt.request;
  if (result?.state !== 'created' || result.requestId !== request.requestId || result.accountId !== request.accountId || result.merchantId !== request.merchantId || result.amountCents !== request.amountCents || typeof result.purchaseId !== 'string' || !/^(?:[a-f\d]{24}|[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12})$/i.test(result.purchaseId)) throw new Error('Receipt details do not match this purchase. Keep the saved request for review.');
  return { ...attempt.transaction, nessiePurchaseId: result.purchaseId, accountId: result.accountId };
}
export default function NessiePurchase() {
  const { budget, ready, applyNessiePurchase } = useBudget();
  const [merchantId, selectMerchant] = useState('');
  const [amount, setAmount] = useState('35');
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const running = useRef(false);
  const bank = budget.bank;
  const merchant = bank?.merchants.find(m => m.id === merchantId);
  const category = budget.categories.find(c => c.id === (attempt?.transaction.categoryId ?? merchant?.categoryId));
  const needsReview = !!budget.plan && (budget.plan.snapshotAt !== bank?.importedAt || budget.plan.payday < dayKey(new Date()));
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
  async function run(action: () => Promise<void>) {
    if (running.current) return;
    running.current = true; setBusy(true);
    try { await action(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Purchase could not be confirmed. Keep the saved request and check again.'); }
    finally { running.current = false; setBusy(false); }
  }
  async function confirm() {
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
  }
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
    <Text style={styles.title}>Nessie purchase</Text><Text style={styles.body}>Create a purchase in the Nessie sandbox, then refresh its account history. Use whole dollars: this sandbox truncates cents. No real money moves.</Text>
    {!bank ? <Button onPress={() => router.navigate('/connections')}>Import a Nessie account</Button> : <View style={styles.panel}><Text style={styles.heading}>{bank.account.name}</Text><Text style={styles.body}>Reported bank balance: {money(bank.account.balanceCents)}</Text><Text style={styles.body}>{budget.plan ? 'Using your approved category allocations.' : 'Using local demo category allocations. Importing a bank does not automatically approve a budget plan.'}</Text></View>}
    {needsReview && <Text style={styles.notice}>Bank data changed or payday passed. Review a new proposal in Banking before starting another purchase. A saved request can still be checked.</Text>}
    {!attempt ? <>
      <View style={styles.row}>{bank?.merchants.filter(m => budget.categories.some(c => c.id === m.categoryId)).map(m => <Button key={m.id} secondary={m.id !== merchantId} disabled={busy || !loaded} onPress={() => selectMerchant(m.id)}>{m.name}</Button>)}</View>
      <Field label="Actual purchase amount ($)" value={amount} onChangeText={value => { if (!busy) setAmount(value); }} numeric />
      <Button disabled={!ready || !loaded || !merchant || busy || needsReview} onPress={() => void run(async () => {
        const cents = parseMoney(amount);
        if (!bank || !merchant || !category || !cents) throw new Error('Choose a merchant and enter a positive amount.');
        if (cents % 100 !== 0) throw new Error('Use a whole-dollar amount, such as $35. This sandbox truncates cents.');
        if (cents > category.limit - category.spent) throw new Error('This purchase exceeds the remaining category budget.');
        const user = await ensureFirebaseUser();
        const requestId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
        const next: Attempt = { phase: 'preview', request: { requestId, accountId: bank.account.id, merchantId: merchant.id, amountCents: cents, firebaseUid: user.uid }, transaction: { id: requestId, categoryId: category.id, merchant: merchant.name, cents, createdAt: new Date().toISOString() } };
        await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(next)); setAttempt(next); setMessage('Preview only. Confirm below to create this sandbox purchase.');
      })}>{busy ? 'Preparing…' : 'Preview Nessie purchase'}</Button>
    </> : <View style={styles.panel}>
      <Text style={styles.heading}>{attempt.transaction.merchant}</Text><Text style={styles.title}>{money(attempt.request.amountCents)}</Text>
      <Text style={styles.body}>{attempt.phase === 'preview' ? `${category?.name ?? 'Category'} remaining after confirmation: ${money((category ? category.limit - category.spent : 0) - attempt.request.amountCents)}` : 'This request is saved. Checking it reuses the same ID and never automatically creates a second purchase.'}</Text>
      {attempt.result?.state !== 'rejected' && attempt.result?.state !== 'mismatch' && <Button disabled={busy} onPress={() => void run(confirm)}>{busy ? 'Checking Nessie…' : attempt.phase === 'preview' ? 'Confirm Nessie purchase' : 'Check saved purchase'}</Button>}
      {(attempt.phase === 'preview' || attempt.result?.state === 'rejected') && <Button secondary disabled={busy} onPress={() => void run(async () => { await AsyncStorage.removeItem(PENDING_KEY); setAttempt(null); setMessage('Preview cleared. No confirmed purchase was removed.'); })}>{attempt.result?.state === 'rejected' ? 'Start a new preview' : 'Cancel preview'}</Button>}
      <Text style={{ color: colors.muted, fontSize: 12 }}>Request: {attempt.request.requestId}</Text>
    </View>}
    {!!message && <Text accessibilityLiveRegion="polite" style={styles.notice}>{message}</Text>}
  </ScrollView>;
}
