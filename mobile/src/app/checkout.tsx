import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Button, colors, Field, styles } from '../components/ui';
import { money, parseMoney, Transaction } from '../domain/budget';
import { useBudget } from '../state/BudgetProvider';
import { dayKey, estimateAtMerchant } from '../domain/banking';

export default function Checkout() {
  const params = useLocalSearchParams<{ category?: string }>();
  return <Dashboard key={params.category ?? 'dining'} initialCategory={params.category ?? 'dining'} />;
}
function Dashboard({ initialCategory }: { initialCategory: string }) {
  const { budget, ready, error, purchase, reset } = useBudget();
  const [selected, select] = useState(initialCategory);
  const [amount, setAmount] = useState('35');
  const [pending, setPending] = useState<Transaction | null>(null);
  const [message, setMessage] = useState('');
  const [merchantId, setMerchantId] = useState('');
  const merchant = budget.bank?.merchants.find(m => m.id === merchantId);
  const estimate = budget.bank && merchant ? estimateAtMerchant(budget.bank, merchant.id) : null;
  const category = budget.categories.find(c => c.id === selected) ?? budget.categories[0];
  const remaining = category.limit - category.spent;
  const preview = pending?.cents ?? 0;
  const visualPreview = pending?.cents ?? estimate ?? 0;
  const availableWidth = category.limit > 0 ? Math.max(0, Math.min(100, remaining / category.limit * 100)) : 0;
  const cutoutWidth = category.limit > 0 ? Math.min(availableWidth, visualPreview / category.limit * 100) : 0;
  const planNeedsReview = !!budget.plan && (budget.plan.snapshotAt !== budget.bank?.importedAt || budget.plan.payday < dayKey(new Date()));
  if (!ready) return <Text style={styles.notice}>Loading your budget…</Text>;
  return <ScrollView contentContainerStyle={styles.page}>
    <View><Text style={styles.title}>See it before you spend it.</Text><Text style={styles.body}>Your budget, in the moment.</Text></View>
    <Text style={styles.notice}>Local demo · Simulated locations · No real payments</Text>
    {budget.plan && <View style={styles.panel}><Text style={styles.heading}>Spendable under your approved plan</Text><Text style={styles.title}>{money(budget.categories.reduce((sum, c) => sum + c.limit - c.spent, 0))}</Text><Text style={styles.body}>Until {budget.plan.payday}. Bills reserve: {money(budget.plan.billsCents)}. Savings reserve: {money(budget.plan.savingsCents)}. Historical bank purchases are not subtracted again.</Text></View>}
    {planNeedsReview && <Text style={styles.notice}>New bank data or a past payday needs review. Approve a new plan in Banking before confirming more demo purchases.</Text>}
    {!!budget.bank && <View style={{ gap: 12 }}><Text style={styles.heading}>Simulate a merchant location</Text><View style={styles.row}>{budget.bank.merchants.filter(m => budget.categories.some(c => c.id === m.categoryId)).slice(0, 12).map(m => <Button key={m.id} secondary={merchantId !== m.id} onPress={() => { setMerchantId(m.id); select(m.categoryId); setPending(null); setMessage(''); }}>{m.name}</Button>)}</View>{merchant && <Text style={styles.body}>{merchant.name}{merchant.location ? ` · ${merchant.location.latitude.toFixed(3)}, ${merchant.location.longitude.toFixed(3)}` : ''}. {estimate !== null ? `Estimated spend ${money(estimate)} from the median completed purchase here.` : 'No purchase history available for an estimate.'} Location is simulated.</Text>}</View>}
    {!!error && <Text accessibilityRole="alert" style={styles.notice}>{error}</Text>}
    <View style={styles.row}>{budget.categories.map(c => <Pressable key={c.id} accessibilityRole="button" accessibilityState={{ selected: c.id === selected }} onPress={() => { select(c.id); setMerchantId(''); setPending(null); setMessage(''); }} style={[styles.button, { backgroundColor: c.id === selected ? colors.navy : '#E4EFF7' }]}><Text style={{ color: c.id === selected ? 'white' : colors.navy }}>{c.name}</Text></Pressable>)}</View>
    <View style={[styles.panel, { backgroundColor: colors.navy, borderColor: colors.navy, gap: 20 }]}>
      <Text style={{ color: '#D2E6F5', fontSize: 16 }}>{category.name} remaining</Text>
      <Text style={{ color: 'white', fontSize: 54, fontWeight: '700', letterSpacing: -2 }}>{money(remaining)}</Text>
      <View accessibilityLabel={`${money(remaining)} remaining out of ${money(category.limit)}. Purchase preview ${money(visualPreview)}.`} style={{ height: 42, backgroundColor: '#426F8C', borderRadius: 6, overflow: 'hidden', flexDirection: 'row' }}>
        <View style={{ width: `${availableWidth - cutoutWidth}%`, backgroundColor: '#FFFFFF' }} />
        <View style={{ width: `${cutoutWidth}%`, backgroundColor: '#F4A69E', borderWidth: visualPreview ? 2 : 0, borderStyle: 'dashed', borderColor: colors.red }} />
      </View>
      <Text style={{ color: 'white', lineHeight: 22 }}>{pending ? `${money(preview)} actual purchase cutout · ${money(remaining - preview)} after confirmation` : estimate !== null ? `${money(estimate)} estimated cutout · Enter the actual amount below` : `${money(category.spent)} spent of ${money(category.limit)} budgeted`}</Text>
    </View>
    <View style={styles.panel}>
      <Text style={styles.heading}>Try a purchase</Text>
      <Text style={styles.body}>Simulated location: {selected === 'dining' ? 'Campus café' : selected === 'groceries' ? 'Grocery store' : 'Transit station'}. Enter the actual amount before confirming. Confirmation updates this local demo only; it does not submit a Nessie purchase.</Text>
      <Field label="Purchase amount ($)" value={amount} onChangeText={v => { setAmount(v); setPending(null); setMessage(''); }} numeric />
      {!pending ? <Button onPress={() => {
        const cents = parseMoney(amount);
        if (!cents) { setMessage('Enter a positive amount with up to two decimal places.'); return; }
        setPending({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, categoryId: category.id, cents, merchant: merchant?.name ?? 'Demo purchase', createdAt: new Date().toISOString() });
        setMessage('');
      }}>Preview purchase</Button> : <>
        {preview > remaining && <Text style={{ color: colors.red }}>This exceeds your category balance by {money(preview - remaining)}.</Text>}
        <View style={styles.row}><Button disabled={preview > remaining || planNeedsReview} onPress={() => { purchase(pending); setPending(null); setMessage('Purchase confirmed. Your budget is updated.'); }}>Confirm purchase</Button><Button secondary onPress={() => { setPending(null); setMessage('Preview canceled. Your balance has not changed.'); }}>Cancel</Button></View>
      </>}
      {!!message && <Text accessibilityLiveRegion="polite" style={styles.notice}>{message}</Text>}
    </View>
    <View style={{ gap: 16 }}><Text style={styles.heading}>Recent activity</Text>{budget.transactions.length ? budget.transactions.slice(0, 5).map(t => <View key={t.id} style={[styles.row, { justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.line, paddingBottom: 12 }]}><Text style={styles.body}>{budget.categories.find(c => c.id === t.categoryId)?.name}</Text><Text style={styles.label}>−{money(t.cents)}</Text></View>) : <Text style={styles.body}>Your confirmed demo purchases will appear here.</Text>}</View>
    <Button secondary onPress={() => { reset(); setPending(null); setMessage('Demo reset.'); }}>Reset demo</Button>
  </ScrollView>;
}

