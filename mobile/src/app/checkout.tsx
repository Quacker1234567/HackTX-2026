import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Button, colors, Field, styles } from '../components/ui';
import { categoriesWithSpend, money, parseMoney, Transaction } from '../domain/budget';
import { useBudget } from '../state/BudgetProvider';
import { useNessiePurchase } from '../state/useNessiePurchase';
import { dayKey, estimateAtMerchant } from '../domain/banking';

export default function Checkout() {
  const params = useLocalSearchParams<{ category?: string }>();
  return <Dashboard key={params.category ?? 'dining'} initialCategory={params.category ?? 'dining'} />;
}
function Dashboard({ initialCategory }: { initialCategory: string }) {
  const { budget, ready, error, purchase, reset } = useBudget();
  const nessie = useNessiePurchase();
  const [selected, select] = useState(initialCategory);
  const [amount, setAmount] = useState('1');
  const [pending, setPending] = useState<Transaction | null>(null);
  const [message, setMessage] = useState('');
  const [merchantId, setMerchantId] = useState('');
  const [rehearsal, setRehearsal] = useState(false);
  const merchant = budget.bank?.merchants.find(m => m.id === merchantId);
  const estimate = budget.bank && merchant ? estimateAtMerchant(budget.bank, merchant.id) : null;
  const categories = categoriesWithSpend(budget);
  const category = categories.find(c => c.id === selected) ?? categories[0];
  const remaining = category.limit - category.spent;
  const attempt = nessie.attempt;
  // Only a submitted request is unsafe to abandon; a preview can always be changed.
  // Merchant selection is component state, so locking on any attempt would strand a
  // restored request with no way to select a merchant and no way to resolve it.
  const outstanding = attempt?.phase === 'submitted';
  const live = !!budget.bank && !rehearsal;
  const previewCents = attempt?.request.amountCents ?? pending?.cents ?? 0;
  const visualPreview = previewCents || estimate || 0;
  const usedWidth = category.limit > 0 ? Math.max(0, Math.min(100, category.spent / category.limit * 100)) : 0;
  const cutoutWidth = category.limit > 0 ? Math.min(100 - usedWidth, visualPreview / category.limit * 100) : 0;
  const planNeedsReview = !!budget.plan && (budget.plan.snapshotAt !== budget.bank?.importedAt || budget.plan.payday < dayKey(new Date()));
  const notice = message || nessie.message;
  function clearPreviews() { setPending(null); setMessage(''); }
  if (!ready) return <Text style={styles.notice}>Loading your budget…</Text>;
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
    <View><Text style={styles.title}>See it before you spend it.</Text><Text style={styles.body}>Your budget, in the moment.</Text></View>
    <Text style={styles.notice}>{live ? 'Live Nessie sandbox · Whole dollars · Writes a real sandbox transaction' : 'Rehearsal · Simulated locations · Nothing is sent to Nessie'}</Text>
    {budget.plan && <View style={styles.panel}><Text style={styles.heading}>Spendable under your approved plan</Text><Text style={styles.title}>{money(categories.reduce((sum, c) => sum + Math.max(0, c.limit - c.spent), 0))}</Text><Text style={styles.body}>Until {budget.plan.payday}. Bills reserve: {money(budget.plan.billsCents)}. Savings reserve: {money(budget.plan.savingsCents)}. Historical bank purchases are not subtracted again.</Text></View>}
    {planNeedsReview && <Text style={styles.notice}>New bank data or a past payday needs review. Approve a new plan in Banking before confirming more purchases.</Text>}
    {outstanding && <Text style={styles.notice}>A submitted Nessie request is still open below. Resolve it before changing the merchant or category, so its saved details keep matching.</Text>}
    {!!budget.bank && <View style={{ gap: 12 }}><Text style={styles.heading}>Simulate a merchant location</Text><View style={styles.row}>{budget.bank.merchants.filter(m => budget.categories.some(c => c.id === m.categoryId)).slice(0, 12).map(m => <Button key={m.id} secondary={merchantId !== m.id} disabled={outstanding} onPress={() => { setMerchantId(m.id); select(m.categoryId); clearPreviews(); if (attempt) void nessie.run(nessie.cancel); }}>{m.name}</Button>)}</View>{merchant && <Text style={styles.body}>{merchant.name}{merchant.location ? ` · ${merchant.location.latitude.toFixed(3)}, ${merchant.location.longitude.toFixed(3)}` : ''}. {estimate !== null ? `Estimated spend ${money(estimate)} from the median completed purchase here.` : 'No purchase history available for an estimate.'} Location is simulated.</Text>}</View>}
    {!!error && <Text accessibilityRole="alert" style={styles.notice}>{error}</Text>}
    <View style={styles.row}>{budget.categories.map(c => <Pressable key={c.id} accessibilityRole="button" accessibilityState={{ selected: c.id === selected }} disabled={outstanding} onPress={() => { select(c.id); setMerchantId(''); clearPreviews(); if (attempt) void nessie.run(nessie.cancel); }} style={[styles.button, { backgroundColor: c.id === selected ? colors.navy : '#E4EFF7', opacity: outstanding ? 0.5 : 1 }]}><Text style={{ color: c.id === selected ? 'white' : colors.navy }}>{c.name}</Text></Pressable>)}</View>
    <View style={[styles.panel, { backgroundColor: colors.navy, borderColor: colors.navy, gap: 20 }]}>
      <Text style={{ color: '#D2E6F5', fontSize: 16 }}>{category.name} remaining</Text>
      <Text style={{ color: 'white', fontSize: 54, fontWeight: '700', letterSpacing: -2 }}>{money(remaining)}</Text>
      <View accessibilityLabel={`${money(category.spent)} used of ${money(category.limit)}. Purchase preview ${money(visualPreview)}.`} style={{ height: 42, backgroundColor: '#426F8C', borderRadius: 6, overflow: 'hidden', flexDirection: 'row' }}>
        <View style={{ width: `${usedWidth}%`, backgroundColor: '#FFFFFF' }} />
        <View style={{ width: `${cutoutWidth}%`, backgroundColor: '#F4A69E', borderWidth: visualPreview ? 2 : 0, borderStyle: 'dashed', borderColor: colors.red }} />
      </View>
      <Text style={{ color: 'white', lineHeight: 22 }}>{previewCents ? `${money(previewCents)} actual purchase cutout · ${money(remaining - previewCents)} after confirmation` : estimate !== null ? `${money(estimate)} estimated cutout · Enter the actual amount below` : `${money(category.spent)} spent of ${money(category.limit)} budgeted`}</Text>
    </View>
    <View style={styles.panel}>
      <Text style={styles.heading}>Try a purchase</Text>
      {!!budget.bank && !attempt && <>
        <View style={styles.row}>
          <Button secondary={rehearsal} disabled={!!pending} onPress={() => { setRehearsal(false); clearPreviews(); }}>Send to Nessie</Button>
          <Button secondary={!rehearsal} disabled={!!pending} onPress={() => { setRehearsal(true); clearPreviews(); }}>Rehearsal only</Button>
        </View>
        <Text style={styles.body}>{live ? 'Confirming creates a real purchase in the Nessie sandbox and refreshes your bank data. Use whole dollars; this sandbox truncates cents. No real money moves.' : 'Confirming changes this device only. Nothing reaches Nessie, so rehearse freely.'}</Text>
      </>}
      {!budget.bank && <Text style={styles.body}>Simulated location: {selected === 'dining' ? 'Campus café' : selected === 'groceries' ? 'Grocery store' : 'Transit station'}. Confirming changes this device only. Import a Nessie account in Connections to send real sandbox purchases.</Text>}
      {/* A saved request is always resolvable, whatever the current mode or merchant. */}
      {attempt ? <View style={{ gap: 12 }}>
        <Text style={styles.body}>{attempt.phase === 'preview' ? `${money(attempt.request.amountCents)} at ${attempt.transaction.merchant}. Confirming writes this to Nessie.` : `${money(attempt.request.amountCents)} at ${attempt.transaction.merchant} was submitted. Checking it reuses the same request and never creates a second purchase.`}</Text>
        {attempt.result?.state !== 'rejected' && attempt.result?.state !== 'mismatch' && <Button disabled={nessie.busy} onPress={() => void nessie.run(nessie.confirm)}>{nessie.busy ? 'Checking Nessie…' : attempt.phase === 'preview' ? 'Confirm Nessie purchase' : 'Check saved purchase'}</Button>}
        {(attempt.phase === 'preview' || attempt.result?.state === 'rejected' || attempt.result?.state === 'mismatch') && <Button secondary disabled={nessie.busy} onPress={() => void nessie.run(nessie.cancel)}>{attempt.phase === 'preview' ? 'Cancel preview' : 'Clear this request'}</Button>}
        <Text style={{ color: colors.muted, fontSize: 12 }}>Request: {attempt.request.requestId}</Text>
      </View> : live ? <>
        {merchant ? <>
          <Field label="Purchase amount ($, whole dollars)" value={amount} onChangeText={v => { setAmount(v); clearPreviews(); }} numeric />
          <Button disabled={nessie.busy || !nessie.loaded || planNeedsReview} onPress={() => void nessie.run(async () => {
            const cents = parseMoney(amount);
            if (!budget.bank || !merchant || !cents) throw new Error('Choose a merchant and enter a positive amount.');
            await nessie.preview({ accountId: budget.bank.account.id, merchantId: merchant.id, merchantName: merchant.name, categoryId: category.id, cents, remainingCents: remaining });
          })}>{nessie.busy ? 'Preparing…' : 'Preview purchase'}</Button>
        </> : <Text style={styles.body}>Choose a merchant location above to send a purchase to Nessie, or switch to Rehearsal only to practice without one.</Text>}
      </> : <>
        <Field label="Purchase amount ($)" value={amount} onChangeText={v => { setAmount(v); clearPreviews(); }} numeric />
        {!pending ? <Button onPress={() => {
          const cents = parseMoney(amount);
          if (!cents) { setMessage('Enter a positive amount with up to two decimal places.'); return; }
          setPending({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, categoryId: category.id, cents, merchant: merchant?.name ?? 'Rehearsal purchase', createdAt: new Date().toISOString() });
          setMessage('');
        }}>Preview purchase</Button> : <>
          {previewCents > remaining && <Text style={{ color: colors.red }}>This exceeds your category balance by {money(previewCents - remaining)}.</Text>}
          <View style={styles.row}><Button disabled={previewCents > remaining || planNeedsReview} onPress={() => { purchase(pending); setPending(null); setMessage('Rehearsal purchase confirmed on this device. Nothing was sent to Nessie.'); }}>Confirm purchase</Button><Button secondary onPress={() => { setPending(null); setMessage('Preview canceled. Your balance has not changed.'); }}>Cancel</Button></View>
        </>}
      </>}
      {!!notice && <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}
    </View>
    <View style={{ gap: 16 }}><Text style={styles.heading}>Recent activity</Text>{budget.transactions.length ? budget.transactions.slice(0, 5).map(t => <View key={t.id} style={[styles.row, { justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.line, paddingBottom: 12 }]}><Text style={styles.body}>{budget.categories.find(c => c.id === t.categoryId)?.name}{t.nessiePurchaseId ? ' · Nessie' : ''}</Text><Text style={styles.label}>−{money(t.cents)}</Text></View>) : <Text style={styles.body}>Your confirmed purchases will appear here.</Text>}</View>
    <Button secondary disabled={outstanding} onPress={() => { reset(); setPending(null); setMessage('Demo reset. Nessie history and any saved request are unaffected.'); }}>Reset demo</Button>
  </ScrollView>;
}
