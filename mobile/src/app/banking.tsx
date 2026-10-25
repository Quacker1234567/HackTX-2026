import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useBudget } from '../state/BudgetProvider';
import { AmountRow, Button, Chip, colors, Field, Group, GroupRow, Money, NavyFace, Notice, styles } from '../components/ui';
import { SectionTitle, StackPage } from '../components/design';
import { analyzeHistory, BankSnapshot, confirmManualBills, dayKey, Preferences, proposeBudget, validDate } from '../domain/banking';
import { money, parseMoney } from '../domain/budget';
import { reconcileNessieDebit } from '../services/banking';

export default function Banking() {
  const { budget, approvePlan, importBank } = useBudget();
  const [manualBills, setManualBills] = useState<BankSnapshot['bills']>([]);
  const [billName, setBillName] = useState('');
  const [billAmount, setBillAmount] = useState('');
  const [billDate, setBillDate] = useState('');
  const [billError, setBillError] = useState('');
  const [reduction, setReduction] = useState('20');
  const [protect, setProtect] = useState('groceries');
  const [reviewing, setReviewing] = useState(false);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const bank = budget.bank;
  async function settle(purchaseId: string, disposition: 'settled' | 'void') {
    if (busy || !bank) return;
    setBusy(true);
    try {
      const refreshed = await reconcileNessieDebit({ accountId: bank.account.id, purchaseId, disposition });
      importBank(refreshed);
      setNotice(disposition === 'void' ? 'Marked as rehearsal. Its reserve is released and it no longer informs category pacing. The Nessie record is unchanged.' : 'Marked as settled. Its reserve is released. Review a new plan before approving allocations.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Reconciliation failed. The reserve is unchanged.'); }
    finally { setBusy(false); }
  }
  const preferences: Preferences = { diningReduction: Number(reduction), protectedCategory: protect };
  const history = useMemo(() => bank ? analyzeHistory(bank) : null, [bank]);
  const proposal = bank ? proposeBudget(bank, budget.goal, preferences) : null;
  if (!bank || !history || !proposal) return <StackPage><Text style={styles.body}>Import a bank account from Connections to see this picture.</Text></StackPage>;
  const billNeedsReview = bank.billReviewRequired || bank.warnings.some(w => w.startsWith('Nessie bills could not be imported.'));
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const purchases = bank.purchases.slice().sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')).slice(0, 20);
  return <StackPage>
    <NavyFace title={bank.account.name}>
      <Money size={40} color={colors.white} weight="700">{money(bank.account.balanceCents)}</Money>
    </NavyFace>
    <Notice>Nessie mock data · Imported {new Date(bank.importedAt).toLocaleString()}</Notice>
    {!!bank.unreflectedPurchaseCents && <Notice>{money(bank.unreflectedPurchaseCents)} reserved for verified Flow purchases not reflected in Nessie’s reported balance. This reserve is deducted once when planning.</Notice>}
    {bank.warnings.map(warning => <Notice key={warning} tone="alert">{warning}</Notice>)}
    {!!bank.flowDebits?.length && <View style={{ gap: 16 }}>
      <SectionTitle>Awaiting review</SectionTitle>
      <Group>
        {bank.flowDebits.map((debit, index) => <GroupRow key={debit.purchaseId} last={index === bank.flowDebits!.length - 1}>
          <AmountRow label={debit.date ?? 'Purchase'}>
            <Money size={17} weight="600">{money(debit.amountCents)}</Money>
          </AmountRow>
          <View style={styles.row}>
            <Button disabled={busy} onPress={() => void settle(debit.purchaseId, 'settled')}>Settled in balance</Button>
            <Button secondary disabled={busy} onPress={() => void settle(debit.purchaseId, 'void')}>Rehearsal — ignore</Button>
          </View>
        </GroupRow>)}
      </Group>
    </View>}
    <View style={{ gap: 16 }}>
      <SectionTitle>Spending</SectionTitle>
      <Group>
        {history.byCategory.map((c, index) => <GroupRow key={c.id} last={false}>
          <AmountRow label={c.id}>
            <Money size={17} weight="600">{money(c.cents)}</Money>
          </AmountRow>
        </GroupRow>)}
        <GroupRow last>
          <AmountRow label="Deposits">
            <Money size={17} weight="600" color={colors.blue}>{money(history.incomeCents)}</Money>
          </AmountRow>
        </GroupRow>
      </Group>
    </View>
    <View style={{ gap: 16 }}>
      <SectionTitle>Average by day</SectionTitle>
      <Group>
        {history.weekdays.map((d, index) => <GroupRow key={d.day} last={index === history.weekdays.length - 1}>
          <AmountRow label={weekdays[d.day]}>
            <Money size={17} weight="600">{money(d.averageCents)}</Money>
          </AmountRow>
        </GroupRow>)}
      </Group>
    </View>
    <View style={{ gap: 16 }}>
      <SectionTitle>Bills</SectionTitle>
      {bank.billSource === 'manual' && <Notice>Manually entered and confirmed bills. These are used for planning because the Nessie bill reader is unavailable. Re-importing bank data requires reviewing bills again.</Notice>}
      {billNeedsReview && <Group>
        <GroupRow>
          <Text style={styles.heading}>Enter bills while Nessie is unavailable</Text>
        </GroupRow>
        <GroupRow>
          <Field label="Bill name" value={billName} onChangeText={setBillName} />
        </GroupRow>
        <GroupRow>
          <Field label="Bill amount ($)" value={billAmount} onChangeText={setBillAmount} numeric />
        </GroupRow>
        <GroupRow>
          <Field label="Bill due date (YYYY-MM-DD)" value={billDate} onChangeText={setBillDate} />
        </GroupRow>
        <GroupRow>
          <Button secondary onPress={() => {
            const cents = parseMoney(billAmount);
            if (!billName.trim() || !cents || !validDate(billDate) || billDate < dayKey(new Date())) { setBillError('Enter a name, positive amount, and a due date today or later.'); return; }
            setManualBills(items => [...items, { id: `manual-${Date.now()}-${items.length}`, payee: billName.trim(), cents, date: billDate, status: 'pending' }]);
            setBillName(''); setBillAmount(''); setBillDate(''); setBillError('');
          }}>Add bill to list</Button>
        </GroupRow>
        {manualBills.map(b => <GroupRow key={b.id}>
          <AmountRow label={b.payee}>
            <Money size={17} weight="600">{money(b.cents)}</Money>
          </AmountRow>
          <Button secondary onPress={() => setManualBills(items => items.filter(item => item.id !== b.id))}>Remove</Button>
        </GroupRow>)}
        <GroupRow last>
          <Button disabled={!!(billName || billAmount || billDate)} onPress={() => {
            importBank(confirmManualBills(bank, manualBills)); setReviewing(false); setManualBills([]); setBillError('');
            setNotice('Bill list confirmed for local planning. You can now review a budget proposal.');
          }}>{manualBills.length ? 'Confirm this is my complete bill list' : 'Confirm I have no upcoming bills'}</Button>
          {!!billError && <Notice tone="alert">{billError}</Notice>}
        </GroupRow>
      </Group>}
      {!!bank.bills.length && <Group>
        {bank.bills.map((b, index) => <GroupRow key={b.id} last={index === bank.bills.length - 1}>
          <AmountRow label={b.payee}>
            <Money size={17} weight="600">{money(b.cents)}</Money>
          </AmountRow>
        </GroupRow>)}
      </Group>}
    </View>
    <View style={{ gap: 16 }}>
      <SectionTitle>How do you want to spend?</SectionTitle>
      <Group>
        <GroupRow>
          <Field label="Reduce dining by (%)" value={reduction} onChangeText={v => { setReduction(v); setReviewing(false); }} numeric />
        </GroupRow>
        <GroupRow>
          <Text style={styles.label}>Protect</Text>
          <View style={styles.row}>{['groceries', 'transport', 'dining'].map(id => <Chip key={id} label={id} selected={protect === id} onPress={() => { setProtect(id); setReviewing(false); }} />)}</View>
        </GroupRow>
        <GroupRow last>
          <Button onPress={() => { setReviewing(true); setNotice(''); }}>Review proposed budget</Button>
        </GroupRow>
      </Group>
    </View>
    {reviewing && <View style={{ gap: 16 }}>
      <SectionTitle>Plan for {proposal.periodLabel}</SectionTitle>
      <Group>
        <GroupRow>
          <AmountRow label="Balance">
            <Money size={17} weight="600">{money(proposal.balanceCents)}</Money>
          </AmountRow>
        </GroupRow>
        <GroupRow>
          <AmountRow label="Bills">
            <Money size={17} weight="600">−{money(proposal.billsCents)}</Money>
          </AmountRow>
        </GroupRow>
        <GroupRow>
          <AmountRow label="Savings">
            <Money size={17} weight="600">−{money(proposal.savingsCents)}</Money>
          </AmountRow>
        </GroupRow>
        <GroupRow>
          <AmountRow label="Available">
            <Money size={17} weight="600">{money(proposal.availableCents)}</Money>
          </AmountRow>
        </GroupRow>
        {proposal.allocations.map(c => <GroupRow key={c.id}>
          <AmountRow label={c.name}>
            <Money size={17} weight="600">{money(c.limit)}</Money>
          </AmountRow>
        </GroupRow>)}
        {proposal.unallocatedCents > 0 && <GroupRow>
          <AmountRow label="Unallocated">
            <Money size={17} weight="600">{money(proposal.unallocatedCents)}</Money>
          </AmountRow>
        </GroupRow>}
        {proposal.warnings.map(w => <GroupRow key={w}><Notice>{w}</Notice></GroupRow>)}
        <GroupRow>
          <Button disabled={!proposal.canApprove} onPress={() => { approvePlan(proposal); setReviewing(false); setNotice('Budget approved. Open Budget to try a purchase.'); }}>Approve and start new cycle</Button>
        </GroupRow>
        <GroupRow last>
          <Button secondary onPress={() => setReviewing(false)}>Keep current budget</Button>
        </GroupRow>
      </Group>
    </View>}
    <View style={{ gap: 16 }}>
      <SectionTitle>Imported purchases</SectionTitle>
      <Group>
        {purchases.length ? purchases.map((p, index) => <GroupRow key={p.id} last={index === purchases.length - 1}>
          <AmountRow label={p.merchant}>
            <Money size={17} weight="600">{money(p.cents)}</Money>
          </AmountRow>
        </GroupRow>) : <GroupRow last><Text style={styles.body}>No imported purchases.</Text></GroupRow>}
      </Group>
    </View>
    {!!notice && <Notice>{notice}</Notice>}
  </StackPage>;
}
