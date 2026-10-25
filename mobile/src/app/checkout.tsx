import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Button, colors, Field, styles } from '../components/ui';
import { money, parseMoney, Transaction } from '../domain/budget';
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
  const [amount, setAmount] = useState('35');
  const [pending, setPending] = useState<Transaction | null>(null);
  const [message, setMessage] = useState('');
  const [merchantId, setMerchantId] = useState('');
  const [rehearsal, setRehearsal] = useState(false);
  const merchant = budget.bank?.merchants.find(m => m.id === merchantId);
  const estimate = budget.bank && merchant ? estimateAtMerchant(budget.bank, merchant.id) : null;
  const category = budget.categories.find(c => c.id === selected) ?? budget.categories[0];
  const remaining = category.limit - category.spent;
  const attempt = nessie.attempt;
  // Nessie needs an imported account and a real merchant; otherwise only rehearsal is possible.
  const canSendToNessie = !!budget.bank && !!merchant;
  const live = canSendToNessie && !rehearsal;
  const preview = (live ? attempt?.request.amountCents : pending?.cents) ?? 0;
  const visualPreview = preview || estimate || 0;
  const usedWidth = category.limit > 0 ? Math.max(0, Math.min(100, category.spent / category.limit * 100)) : 0;
  const cutoutWidth = category.limit > 0 ? Math.min(100 - usedWidth, visualPreview / category.limit * 100) : 0;
  const planNeedsReview = !!budget.plan && (budget.plan.snapshotAt !== budget.bank?.importedAt || budget.plan.payday < dayKey(new Date()));
  const notice = message || nessie.message;
  function clearPreviews() { setPending(null); setMessage(''); }
  if (!ready) return <Text style={styles.notice}>Loading your budget…</Text>;
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
    <View><Text style={styles.title}>See it before you spend it.</Text><Text style={styles.body}>Your budget, in the moment.</Text></View>
    <Text style={styles.notice}>{live ? 'Live Nessie sandbox · Whole dollars · Writes a real sandbox transaction' : 'Rehearsal · Simulated locations · Nothing is sent to Nessie'}</Text>
    {budget.plan && <View style={styles.panel}><Text style={styles.heading}>Spendable under your approved plan</Text><Text style={styles.title}>{money(budget.categories.reduce((sum, c) => sum + c.limit - c.spent, 0))}</Text><Text style={styles.body}>Until {budget.plan.payday}. Bills reserve: {money(budget.plan.billsCents)}. Savings reserve: {money(budget.plan.savingsCents)}. Historical bank purchases are not subtracted again.</Text></View>}
    {planNeedsReview && <Text style={styles.notice}>New bank data or a past payday needs review. Approve a new plan in Banking before confirming more purchases.</Text>}
    {!!budget.bank && <View style={{ gap: 12 }}><Text style={styles.heading}>Simulate a merchant location</Text><View style={styles.row}>{budget.bank.merchants.filter(m => budget.categories.some(c => c.id === m.categoryId)).slice(0, 12).map(m => <Button key={m.id} secondary={merchantId !== m.id} disabled={!!attempt} onPress={() => { setMerchantId(m.id); select(m.categoryId); clearPreviews(); }}>{m.name}</Button>)}</View>{merchant && <Text style={styles.body}>{merchant.name}{merchant.location ? ` · ${merchant.location.latitude.toFixed(3)}, ${merchant.location.longitude.toFixed(3)}` : ''}. {estimate !== null ? `Estimated spend ${money(estimate)} from the median completed purchase here.` : 'No purchase history available for an estimate.'} Location is simulated.</Text>}</View>}
    {!!error && <Text accessibilityRole="alert" style={styles.notice}>{error}</Text>}
    <View style={styles.row}>{budget.categories.map(c => <Pressable key={c.id} accessibilityRole="button" accessibilityState={{ selected: c.id === selected }} disabled={!!attempt} onPress={() => { select(c.id); setMerchantId(''); clearPreviews(); }} style={[styles.button, { backgroundColor: c.id === selected ? colors.navy : '#E4EFF7' }]}><Text style={{ color: c.id === selected ? 'white' : colors.navy }}>{c.name}</Text></Pressable>)}</View>
    <View style={[styles.panel, { backgroundColor: colors.navy, borderColor: colors.navy, gap: 20 }]}>
      <Text style={{ color: '#D2E6F5', fontSize: 16 }}>{category.name} remaining</Text>
      <Text style={{ color: 'white', fontSize: 54, fontWeight: '700', letterSpacing: -2 }}>{money(remaining)}</Text>
      <View accessibilityLabel={`${money(category.spent)} used of ${money(category.limit)}. Purchase preview ${money(visualPreview)}.`} style={{ height: 42, backgroundColor: '#426F8C', borderRadius: 6, overflow: 'hidden', flexDirection: 'row' }}>
        <View style={{ width: `${usedWidth}%`, backgroundColor: '#FFFFFF' }} />
        <View style={{ width: `${cutoutWidth}%`, backgroundColor: '#F4A69E', borderWidth: visualPreview ? 2 : 0, borderStyle: 'dashed', borderColor: colors.red }} />
      </View>
      <Text style={{ color: 'white', lineHeight: 22 }}>{preview ? `${money(preview)} actual purchase cutout · ${money(remaining - preview)} after confirmation` : estimate !== null ? `${money(estimate)} estimated cutout · Enter the actual amount below` : `${money(category.spent)} spent of ${money(category.limit)} budgeted`}</Text>
    </View>
    <View style={styles.panel}>
      <Text style={styles.heading}>Try a purchase</Text>
      {canSendToNessie ? <>
        <View style={styles.row}>
          <Button secondary={rehearsal} disabled={!!attempt || !!pending} onPress={() => { setRehearsal(false); clearPreviews(); }}>Send to Nessie</Button>
          <Button secondary={!rehearsal} disabled={!!attempt || !!pending} onPress={() => { setRehearsal(true); clearPreviews(); }}>Rehearsal only</Button>
        </View>
        <Text style={styles.body}>{live ? `Confirming creates a real purchase at ${merchant?.name} in the Nessie sandbox and refreshes your bank data. Use whole dollars; this sandbox truncates cents. No real money moves.` : 'Confirming changes this device only. Nothing reaches Nessie, so rehearse freely.'}</Text>
      </> : <Text style={styles.body}>Simulated location: {selected === 'dining' ? 'Campus café' : selected === 'groceries' ? 'Grocery store' : 'Transit station'}. Confirming changes this device only. {budget.bank ? 'Choose a merchant above to send a purchase to Nessie.' : 'Import a Nessie account in Connections to send real sandbox purchases.'}</Text>}
      {!attempt && !pending && <Field label={live ? 'Purchase amount ($, whole dollars)' : 'Purchase amount ($)'} value={amount} onChangeText={v => { setAmount(v); clearPreviews(); }} numeric />}
      {live ? <>
        {!attempt ? <Button disabled={nessie.busy || !nessie.loaded || planNeedsReview} onPress={() => void nessie.run(async () => {
          const cents = parseMoney(amount);
          if (!budget.bank || !merchant || !cents) throw new Error('Choose a merchant and enter a positive amount.');
          await nessie.preview({ accountId: budget.bank.account.id, merchantId: merchant.id, merchantName: merchant.name, categoryId: category.id, cents, remainingCents: remaining });
        })}>{nessie.busy ? 'Preparing…' : 'Preview purchase'}</Button> : <>
          <Text style={styles.body}>{attempt.phase === 'preview' ? `${money(attempt.request.amountCents)} at ${attempt.transaction.merchant}. Confirming writes this to Nessie.` : 'This request is saved. Checking it reuses the same ID and never creates a second purchase.'}</Text>
          {attempt.result?.state !== 'rejected' && attempt.result?.state !== 'mismatch' && <Button disabled={nessie.busy} onPress={() => void nessie.run(nessie.confirm)}>{nessie.busy ? 'Checking Nessie…' : attempt.phase === 'preview' ? 'Confirm Nessie purchase' : 'Check saved purchase'}</Button>}
          {(attempt.phase === 'preview' || attempt.result?.state === 'rejected') && <Button secondary disabled={nessie.busy} onPress={() => void nessie.run(nessie.cancel)}>{attempt.result?.state === 'rejected' ? 'Start a new preview' : 'Cancel preview'}</Button>}
          <Text style={{ color: colors.muted, fontSize: 12 }}>Request: {attempt.request.requestId}</Text>
        </>}
      </> : !pending ? <Button onPress={() => {
        const cents = parseMoney(amount);
        if (!cents) { setMessage('Enter a positive amount with up to two decimal places.'); return; }
        setPending({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, categoryId: category.id, cents, merchant: merchant?.name ?? 'Rehearsal purchase', createdAt: new Date().toISOString() });
        setMessage('');
      }}>Preview purchase</Button> : <>
        {preview > remaining && <Text style={{ color: colors.red }}>This exceeds your category balance by {money(preview - remaining)}.</Text>}
        <View style={styles.row}><Button disabled={preview > remaining || planNeedsReview} onPress={() => { purchase(pending); setPending(null); setMessage('Rehearsal purchase confirmed on this device. Nothing was sent to Nessie.'); }}>Confirm purchase</Button><Button secondary onPress={() => { setPending(null); setMessage('Preview canceled. Your balance has not changed.'); }}>Cancel</Button></View>
      </>}
      {!!notice && <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}
    </View>
    <View style={{ gap: 16 }}><Text style={styles.heading}>Recent activity</Text>{budget.transactions.length ? budget.transactions.slice(0, 5).map(t => <View key={t.id} style={[styles.row, { justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.line, paddingBottom: 12 }]}><Text style={styles.body}>{budget.categories.find(c => c.id === t.categoryId)?.name}{t.nessiePurchaseId ? ' · Nessie' : ''}</Text><Text style={styles.label}>−{money(t.cents)}</Text></View>) : <Text style={styles.body}>Your confirmed purchases will appear here.</Text>}</View>
    <Button secondary disabled={!!attempt} onPress={() => { reset(); setPending(null); setMessage('Demo reset. Nessie history and any saved request are unaffected.'); }}>Reset demo</Button>
  </ScrollView>;
}
