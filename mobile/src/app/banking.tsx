import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useBudget } from '../state/BudgetProvider';
import { Button, Field, styles } from '../components/ui';
import { analyzeHistory, BankSnapshot, confirmManualBills, dayKey, Preferences, proposeBudget, validDate } from '../domain/banking';
import { money, parseMoney } from '../domain/budget';

export default function Banking() {
  const { budget, approvePlan, importBank } = useBudget();
  const [manualBills, setManualBills] = useState<BankSnapshot['bills']>([]);
  const [billName, setBillName] = useState('');
  const [billAmount, setBillAmount] = useState('');
  const [billDate, setBillDate] = useState('');
  const [billError, setBillError] = useState('');
  const [payday, setPayday] = useState(() => { const date = new Date(); date.setDate(date.getDate() + 14); return dayKey(date); });
  const [reduction, setReduction] = useState('20');
  const [protect, setProtect] = useState('groceries');
  const [reviewing, setReviewing] = useState(false);
  const [notice, setNotice] = useState('');
  const bank = budget.bank;
  const preferences: Preferences = { payday, diningReduction: Number(reduction), protectedCategory: protect };
  const history = useMemo(() => bank ? analyzeHistory(bank) : null, [bank]);
  const proposal = bank ? proposeBudget(bank, budget.goal, preferences) : null;
  if (!bank || !history || !proposal) return <ScrollView contentContainerStyle={styles.page}><Text style={styles.title}>Your banking picture.</Text><Text style={styles.body}>Import a Nessie account from Connections to see balances, history, bills, and a proposed budget.</Text></ScrollView>;
  const billNeedsReview = bank.billReviewRequired || bank.warnings.some(w => w.startsWith('Nessie bills could not be imported.'));
  return <ScrollView contentContainerStyle={styles.page}>
    <Text style={styles.title}>Your banking picture.</Text>
    <Text style={styles.notice}>Nessie mock data · Imported {new Date(bank.importedAt).toLocaleString()}</Text>
    {!!bank.unreflectedPurchaseCents && <Text style={styles.notice}>{money(bank.unreflectedPurchaseCents)} reserved for verified Flow purchases not reflected in Nessie’s reported balance. This reserve is deducted once when planning.</Text>}
    {bank.warnings.map(warning => <Text key={warning} accessibilityRole="alert" style={styles.notice}>{warning}</Text>)}
    <View style={styles.panel}><Text style={styles.heading}>{bank.account.name}</Text><Text style={styles.title}>{money(bank.account.balanceCents)}</Text><Text style={styles.body}>{bank.account.type} balance reported by Nessie. History is already reflected in this balance.</Text></View>
    <Text style={styles.heading}>Spending patterns · Last 90 days</Text>
    <Text style={styles.body}>{history.count} completed purchases totaling {money(history.totalCents)}. {history.ignoredCount} pending, undated, or older purchases excluded.</Text>
    {history.byCategory.map(c => <Text key={c.id} style={styles.body}>{c.id}: {money(c.cents)}</Text>)}
    <Text style={styles.body}>Completed deposits: {money(history.incomeCents)} across {history.incomeCount} deposits.{history.estimatedPaydayGap ? ` Historical deposit spacing: about ${history.estimatedPaydayGap} days; confirm your actual next payday below.` : ' Add more dated deposits to estimate income cadence.'}</Text>
    <View style={styles.panel}><Text style={styles.heading}>Average spending by day</Text>{history.weekdays.map(d => <Text key={d.day} style={styles.body}>{['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.day]}: {money(d.averageCents)}</Text>)}<Text style={styles.body}>Average per calendar weekday in the 90-day window, including days with no purchases.</Text></View>
    <Text style={styles.heading}>Bills</Text>
    {bank.billSource === 'manual' && <Text style={styles.notice}>Manually entered and confirmed bills. These are used for planning because the Nessie bill reader is unavailable. Re-importing bank data requires reviewing bills again.</Text>}
    {billNeedsReview && <View style={styles.panel}>
      <Text style={styles.heading}>Enter bills while Nessie is unavailable</Text>
      <Text style={styles.body}>Add every upcoming bill for this account. This saves a local planning list; it does not create or change bills in Nessie.</Text>
      <Field label="Bill name" value={billName} onChangeText={setBillName} />
      <Field label="Bill amount ($)" value={billAmount} onChangeText={setBillAmount} numeric />
      <Field label="Bill due date (YYYY-MM-DD)" value={billDate} onChangeText={setBillDate} />
      <Button secondary onPress={() => {
        const cents = parseMoney(billAmount);
        if (!billName.trim() || !cents || !validDate(billDate) || billDate < dayKey(new Date())) { setBillError('Enter a name, positive amount, and a due date today or later.'); return; }
        setManualBills(items => [...items, { id: `manual-${Date.now()}-${items.length}`, payee: billName.trim(), cents, date: billDate, status: 'pending' }]);
        setBillName(''); setBillAmount(''); setBillDate(''); setBillError('');
      }}>Add bill to list</Button>
      {manualBills.map(b => <View key={b.id} style={styles.row}><Text style={styles.body}>{b.payee}: {money(b.cents)} · {b.date}</Text><Button secondary onPress={() => setManualBills(items => items.filter(item => item.id !== b.id))}>Remove</Button></View>)}
      <Text style={styles.body}>Confirm only when this list covers all upcoming obligations. Missing bills would make the spending estimate too high.</Text>
      <Button disabled={!!(billName || billAmount || billDate)} onPress={() => {
        importBank(confirmManualBills(bank, manualBills)); setReviewing(false); setManualBills([]); setBillError('');
        setNotice('Bill list confirmed for local planning. You can now review a budget proposal.');
      }}>{manualBills.length ? 'Confirm this is my complete bill list' : 'Confirm I have no upcoming bills'}</Button>
      {!!billError && <Text accessibilityRole="alert" style={styles.notice}>{billError}</Text>}
    </View>}
    {bank.bills.length ? bank.bills.map(b => <Text key={b.id} style={styles.body}>{b.payee}: {money(b.cents)} · {b.date ?? 'Date missing'} · {b.status}</Text>) : <Text style={styles.body}>{billNeedsReview ? 'Bill data is incomplete. Add and confirm the list above.' : 'No upcoming bills in the confirmed list.'}</Text>}
    <View style={styles.panel}>
      <Text style={styles.heading}>How do you want to spend?</Text>
      <Field label="Next payday (YYYY-MM-DD)" value={payday} onChangeText={v => { setPayday(v); setReviewing(false); }} />
      <Field label="Reduce dining by (%)" value={reduction} onChangeText={v => { setReduction(v); setReviewing(false); }} numeric />
      <Text style={styles.body}>Which category should keep its historical pace first?</Text>
      <View style={styles.row}>{['groceries', 'transport', 'dining'].map(id => <Button key={id} secondary={protect !== id} onPress={() => { setProtect(id); setReviewing(false); }}>{id}</Button>)}</View>
      <Text style={styles.body}>Savings follows the daily pace of your goal. Categories use completed purchases from the last 90 days. Unallocated money goes to Other as a flexible buffer. No AI is used for these calculations.</Text>
      <Button onPress={() => { setReviewing(true); setNotice(''); }}>Review proposed budget</Button>
    </View>
    {reviewing && <View style={styles.panel}>
      <Text style={styles.heading}>Plan until {proposal.payday}</Text>
      <Text style={styles.body}>Account balance: {money(proposal.balanceCents)}{'\n'}Upcoming bills reserved: −{money(proposal.billsCents)}{'\n'}Goal contribution reserved: −{money(proposal.savingsCents)}{'\n'}Available for category spending: {money(proposal.availableCents)}</Text>
      {proposal.allocations.map(c => <Text key={c.id} style={styles.body}>{c.name}: {money(c.limit)}</Text>)}
      {proposal.unallocatedCents > 0 && <Text style={styles.body}>Unallocated: {money(proposal.unallocatedCents)}{'\n'}Categories are capped at your recent spending pace, so this is left over. Raise a limit in Budget to use it.</Text>}
      {proposal.warnings.map(w => <Text key={w} style={styles.notice}>{w}</Text>)}
      <Text style={styles.body}>Approval starts a new local demo spending cycle and clears existing demo purchases. Imported bank history is kept. Bills and savings are reservations; no money is transferred.</Text>
      <Button disabled={!proposal.canApprove} onPress={() => { approvePlan(proposal); setReviewing(false); setNotice('Budget approved. Open Budget to try a purchase.'); }}>Approve and start new cycle</Button>
      <Button secondary onPress={() => setReviewing(false)}>Keep current budget</Button>
    </View>}
    <Text style={styles.heading}>Imported purchases</Text>
    {bank.purchases.slice().sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')).slice(0, 20).map(p => <Text key={p.id} style={styles.body}>{p.merchant} · {money(p.cents)} · {p.date ?? 'No date'} · {p.status}</Text>)}
    {!!notice && <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}
  </ScrollView>;
}

