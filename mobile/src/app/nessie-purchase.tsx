import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Button, colors, Field, styles } from '../components/ui';
import { money, parseMoney } from '../domain/budget';
import { dayKey } from '../domain/banking';
import { useBudget } from '../state/BudgetProvider';
import { useNessiePurchase } from '../state/useNessiePurchase';

export default function NessiePurchase() {
  const { budget, ready } = useBudget();
  const { attempt, message, busy, loaded, run, preview, confirm, cancel } = useNessiePurchase();
  const [merchantId, selectMerchant] = useState('');
  const [amount, setAmount] = useState('35');
  const bank = budget.bank;
  const merchant = bank?.merchants.find(m => m.id === merchantId);
  const category = budget.categories.find(c => c.id === (attempt?.transaction.categoryId ?? merchant?.categoryId));
  const needsReview = !!budget.plan && (budget.plan.snapshotAt !== bank?.importedAt || budget.plan.payday < dayKey(new Date()));
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
    <Text style={styles.title}>Nessie purchase</Text><Text style={styles.body}>Create a purchase in the Nessie sandbox, then refresh its account history. Use whole dollars: this sandbox truncates cents. No real money moves. Checkout can also send purchases to Nessie; this screen stays available for checking a saved request.</Text>
    {!bank ? <Button onPress={() => router.navigate('/connections')}>Import a Nessie account</Button> : <View style={styles.panel}><Text style={styles.heading}>{bank.account.name}</Text><Text style={styles.body}>Reported bank balance: {money(bank.account.balanceCents)}</Text><Text style={styles.body}>{budget.plan ? 'Using your approved category allocations.' : 'Using local demo category allocations. Importing a bank does not automatically approve a budget plan.'}</Text></View>}
    {needsReview && <Text style={styles.notice}>Bank data changed or payday passed. Review a new proposal in Banking before starting another purchase. A saved request can still be checked.</Text>}
    {!attempt ? <>
      <View style={styles.row}>{bank?.merchants.filter(m => budget.categories.some(c => c.id === m.categoryId)).map(m => <Button key={m.id} secondary={m.id !== merchantId} disabled={busy || !loaded} onPress={() => selectMerchant(m.id)}>{m.name}</Button>)}</View>
      <Field label="Actual purchase amount ($)" value={amount} onChangeText={value => { if (!busy) setAmount(value); }} numeric />
      <Button disabled={!ready || !loaded || !merchant || busy || needsReview} onPress={() => void run(async () => {
        const cents = parseMoney(amount);
        if (!bank || !merchant || !category || !cents) throw new Error('Choose a merchant and enter a positive amount.');
        await preview({ accountId: bank.account.id, merchantId: merchant.id, merchantName: merchant.name, categoryId: category.id, cents, remainingCents: category.limit - category.spent });
      })}>{busy ? 'Preparing…' : 'Preview Nessie purchase'}</Button>
    </> : <View style={styles.panel}>
      <Text style={styles.heading}>{attempt.transaction.merchant}</Text><Text style={styles.title}>{money(attempt.request.amountCents)}</Text>
      <Text style={styles.body}>{attempt.phase === 'preview' ? `${category?.name ?? 'Category'} remaining after confirmation: ${money((category ? category.limit - category.spent : 0) - attempt.request.amountCents)}` : 'This request is saved. Checking it reuses the same ID and never automatically creates a second purchase.'}</Text>
      {attempt.result?.state !== 'rejected' && attempt.result?.state !== 'mismatch' && <Button disabled={busy} onPress={() => void run(confirm)}>{busy ? 'Checking Nessie…' : attempt.phase === 'preview' ? 'Confirm Nessie purchase' : 'Check saved purchase'}</Button>}
      {(attempt.phase === 'preview' || attempt.result?.state === 'rejected') && <Button secondary disabled={busy} onPress={() => void run(cancel)}>{attempt.result?.state === 'rejected' ? 'Start a new preview' : 'Cancel preview'}</Button>}
      <Text style={{ color: colors.muted, fontSize: 12 }}>Request: {attempt.request.requestId}</Text>
    </View>}
    {!!message && <Text accessibilityLiveRegion="polite" style={styles.notice}>{message}</Text>}
  </ScrollView>;
}
