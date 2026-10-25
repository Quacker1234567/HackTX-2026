import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { AmountRow, Button, Chip, colors, Field, Group, GroupRow, Money, NavyFace, Notice, styles } from '../components/ui';
import { SectionTitle, StackPage } from '../components/design';
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
  const planNeedsReview = !!budget.plan && (budget.plan.snapshotAt !== budget.bank?.importedAt || budget.plan.periodEnd < dayKey(new Date()));
  const notice = message || nessie.message;
  const spendable = categories.reduce((sum, c) => sum + Math.max(0, c.limit - c.spent), 0);
  function clearPreviews() { setPending(null); setMessage(''); }
  if (!ready) return <Notice>Loading your budget…</Notice>;
  return <StackPage>
    {budget.plan && <NavyFace title="Spendable">
      <Money size={40} color={colors.white} weight="700">{money(spendable)}</Money>
    </NavyFace>}
    {planNeedsReview && <Notice tone="alert">New bank data or a finished month needs review. Approve a new plan in Banking before confirming more purchases.</Notice>}
    {outstanding && <Notice>A submitted Nessie request is still open below. Resolve it before changing the merchant or category, so its saved details keep matching.</Notice>}
    {!!budget.bank && <View style={{ gap: 16 }}>
      <SectionTitle>Merchant</SectionTitle>
      <View style={styles.row}>{budget.bank.merchants.filter(m => budget.categories.some(c => c.id === m.categoryId)).slice(0, 12).map(m => <Chip key={m.id} label={m.name} selected={merchantId === m.id} disabled={outstanding} onPress={() => { setMerchantId(m.id); select(m.categoryId); clearPreviews(); if (attempt) void nessie.run(nessie.cancel); }} />)}</View>
    </View>}
    {!!error && <Notice tone="alert">{error}</Notice>}
    <View style={{ gap: 16 }}>
      <SectionTitle>Category</SectionTitle>
      <View style={styles.row}>{budget.categories.map(c => <Chip key={c.id} label={c.name} selected={c.id === selected} disabled={outstanding} onPress={() => { select(c.id); setMerchantId(''); clearPreviews(); if (attempt) void nessie.run(nessie.cancel); }} />)}</View>
    </View>
    <NavyFace title={category.name}>
      <Money size={40} color={colors.white} weight="700">{money(remaining)}</Money>
      <View accessibilityLabel={`${money(category.spent)} used of ${money(category.limit)}. Purchase preview ${money(visualPreview)}.`} style={{ height: 28, backgroundColor: colors.navyDeep, borderRadius: 8, overflow: 'hidden', flexDirection: 'row' }}>
        <View style={{ width: `${usedWidth}%`, backgroundColor: colors.white }} />
        <View style={{ width: `${cutoutWidth}%`, backgroundColor: '#F4A69E', borderWidth: visualPreview ? 2 : 0, borderStyle: 'dashed', borderColor: colors.red }} />
      </View>
      {previewCents ? <View style={styles.amountRow}>
        <Text style={[styles.heading, { color: colors.onNavy, flexShrink: 1 }]}>After</Text>
        <Money color={colors.white} weight="600">{money(remaining - previewCents)}</Money>
      </View> : null}
    </NavyFace>
    <View style={{ gap: 16 }}>
      <SectionTitle>Try a purchase</SectionTitle>
      <Group>
        {!!budget.bank && !attempt && <GroupRow>
          <View style={styles.row}>
            <Button secondary={rehearsal} disabled={!!pending} onPress={() => { setRehearsal(false); clearPreviews(); }}>Send to Nessie</Button>
            <Button secondary={!rehearsal} disabled={!!pending} onPress={() => { setRehearsal(true); clearPreviews(); }}>Rehearsal only</Button>
          </View>
        </GroupRow>}
        {attempt ? <GroupRow last>
          <AmountRow label={attempt.transaction.merchant}>
            <Money size={17} weight="600">{money(attempt.request.amountCents)}</Money>
          </AmountRow>
          {attempt.result?.state !== 'rejected' && attempt.result?.state !== 'mismatch' && <Button disabled={nessie.busy} onPress={() => void nessie.run(nessie.confirm)}>{nessie.busy ? 'Checking Nessie…' : attempt.phase === 'preview' ? 'Confirm Nessie purchase' : 'Check saved purchase'}</Button>}
          {(attempt.phase === 'preview' || attempt.result?.state === 'rejected' || attempt.result?.state === 'mismatch') && <Button secondary disabled={nessie.busy} onPress={() => void nessie.run(nessie.cancel)}>{attempt.phase === 'preview' ? 'Cancel preview' : 'Clear this request'}</Button>}
        </GroupRow> : live ? merchant ? <GroupRow last>
          <Field label="Purchase amount ($, whole dollars)" value={amount} onChangeText={v => { setAmount(v); clearPreviews(); }} numeric />
          <Button disabled={nessie.busy || !nessie.loaded || planNeedsReview} onPress={() => void nessie.run(async () => {
            const cents = parseMoney(amount);
            if (!budget.bank || !merchant || !cents) throw new Error('Choose a merchant and enter a positive amount.');
            await nessie.preview({ accountId: budget.bank.account.id, merchantId: merchant.id, merchantName: merchant.name, categoryId: category.id, cents, remainingCents: remaining });
          })}>{nessie.busy ? 'Preparing…' : 'Preview purchase'}</Button>
        </GroupRow> : <GroupRow last><Text style={styles.body}>Choose a merchant to preview a Nessie purchase.</Text></GroupRow> : <GroupRow last>
          <Field label="Purchase amount ($)" value={amount} onChangeText={v => { setAmount(v); clearPreviews(); }} numeric />
          {!pending ? <Button onPress={() => {
            const cents = parseMoney(amount);
            if (!cents) { setMessage('Enter a positive amount with up to two decimal places.'); return; }
            setPending({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, categoryId: category.id, cents, merchant: merchant?.name ?? 'Rehearsal purchase', createdAt: new Date().toISOString() });
            setMessage('');
          }}>Preview purchase</Button> : <>
            {previewCents > remaining && <Text style={{ color: colors.red, fontWeight: '600' }}>This exceeds your category balance by {money(previewCents - remaining)}.</Text>}
            <View style={styles.row}><Button disabled={previewCents > remaining || planNeedsReview} onPress={() => { purchase(pending); setPending(null); setMessage('Rehearsal purchase confirmed on this device. Nothing was sent to Nessie.'); }}>Confirm purchase</Button><Button secondary onPress={() => { setPending(null); setMessage('Preview canceled. Your balance has not changed.'); }}>Cancel</Button></View>
          </>}
        </GroupRow>}
        {!!notice && <GroupRow last><Notice>{notice}</Notice></GroupRow>}
      </Group>
    </View>
    {!!budget.transactions.length && <View style={{ gap: 16 }}>
      <SectionTitle>Recent activity</SectionTitle>
      <Group>
        {budget.transactions.slice(0, 5).map((t, index) => <GroupRow key={t.id} last={index === Math.min(4, budget.transactions.length - 1)}>
          <AmountRow label={budget.categories.find(c => c.id === t.categoryId)?.name ?? 'Purchase'}>
            <Money size={17} weight="600">−{money(t.cents)}</Money>
          </AmountRow>
        </GroupRow>)}
      </Group>
    </View>}
    <Button secondary disabled={outstanding} onPress={() => { reset(); setPending(null); setMessage('Demo reset. Nessie history and any saved request are unaffected.'); }}>Reset demo</Button>
  </StackPage>;
}
