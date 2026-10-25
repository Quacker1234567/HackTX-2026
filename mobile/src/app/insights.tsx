import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Screen, Progress } from '../components/design';
import { Button, colors, Field, styles } from '../components/ui';
import { analyzeHistory, categoryNames, proposeBudget } from '../domain/banking';
import { displayMoney, monthSpentByCategory, planningGoal } from '../domain/budget';
import { useBudget } from '../state/BudgetProvider';
import { Activity } from '../components/Activity';

const ids = Object.keys(categoryNames);
const sections = ['Patterns', 'Adjust budget', 'Activity'] as const;
export default function Insights() {
  const { budget, settings, ready, approvePlan } = useBudget();
  const [section, setSection] = useState<(typeof sections)[number]>('Patterns');
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const [priority, setPriority] = useState<string | null>(null);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const bank = budget.bank;
  const saved = budget.plan?.accountId === bank?.account.id ? budget.plan?.preferences : undefined;
  const reductions = Object.fromEntries(ids.map(id => [id, draft?.[id] ?? String(saved?.reductions?.[id] ?? (id === 'dining' ? saved?.diningReduction ?? 0 : 0))]));
  const protectedCategory = priority ?? saved?.protectedCategory ?? 'groceries';
  const preferences = { diningReduction: 0, protectedCategory, reductions: Object.fromEntries(ids.map(id => [id, reductions[id].trim() === '' ? NaN : Number(reductions[id])])) };
  const history = bank ? analyzeHistory(bank) : null;
  const proposal = bank ? proposeBudget(bank, planningGoal(budget), preferences) : null;
  const baseline = bank ? proposeBudget(bank, planningGoal(budget), { diningReduction: 0, protectedCategory, reductions: {} }) : null;
  const spent = monthSpentByCategory(budget);
  const cash = (value: number) => displayMoney(value, settings.hideBalances);
  return <Screen title="Insights">
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: '#E3E8EE', borderRadius: 16, padding: 4, gap: 4 }}>
      {sections.map(item => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: section === item }} onPress={() => setSection(item)} style={{ flex: item === 'Adjust budget' ? 1.5 : 1, minHeight: 48, paddingHorizontal: 12, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: section === item ? colors.white : 'transparent' }}><Text style={{ color: section === item ? colors.blue : colors.muted, fontWeight: '600', fontSize: 13, textAlign: 'center' }}>{item}</Text></Pressable>)}
    </View>
    {!ready ? <Text style={styles.body}>Loading your spending…</Text> : section === 'Activity' ? <Activity /> : !bank || !history || !proposal || !baseline ? <View style={styles.panel}><Text style={styles.heading}>Bring your spending into focus</Text><Text style={styles.body}>Connect an account to see spending patterns and build a budget from your history.</Text><Button onPress={() => router.navigate('/connections')}>Connect an account</Button></View> : section === 'Patterns' ? <>
      <View style={[styles.panel, { backgroundColor: colors.navy }]}><Text style={{ color: 'white', fontSize: 22, fontWeight: '600' }}>{bank.account.name}</Text><Text style={{ color: '#DFEDF7', lineHeight: 22 }}>90 days · {history.count} purchases</Text></View>
      <View style={styles.panel}><Text style={styles.heading}>Where your money goes</Text>{history.byCategory.map(c => <View key={c.id} style={{ gap: 9 }}><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={styles.label}>{categoryNames[c.id]}</Text><Text style={styles.label}>{cash(c.cents)}</Text></View><Progress value={history.totalCents ? c.cents / history.totalCents : 0} label={`${categoryNames[c.id]} share of spending`} /></View>)}<Text style={styles.body}>{cash(history.totalCents)} spent · 90 days</Text></View>
      <View style={styles.panel}><Text style={styles.heading}>Your weekly rhythm</Text>{history.weekdays.map((day, index) => <View key={day.day} style={{ gap: 7 }}><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={styles.label}>{['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][index]}</Text><Text style={styles.label}>{cash(day.averageCents)}</Text></View><Progress value={day.averageCents / Math.max(1, ...history.weekdays.map(d => d.averageCents))} label={`Weekday ${index} average spending`} /></View>)}</View>
      <View style={styles.panel}><Text style={styles.heading}>Income</Text><Text style={styles.body}>{cash(history.incomeCents)} · {history.incomeCount} deposits</Text></View>

    </> : <>

      <View style={styles.panel}>{ids.map(id => <View key={id} style={{ gap: 6 }}><Field label={`${categoryNames[id]} reduction (%)`} value={reductions[id]} numeric onChangeText={value => { setDraft({ ...reductions, [id]: value }); setReview(false); setMessage(''); }} /><Text style={{ color: colors.muted, fontSize: 13 }}>Recent monthly pace: {cash(baseline.allocations.find(c => c.id === id)?.limit ?? 0)}</Text></View>)}</View>
      <View style={styles.panel}><Text style={styles.heading}>Fund this category first</Text><View style={styles.row}>{ids.map(id => <Button key={id} secondary={protectedCategory !== id} onPress={() => { setPriority(id); setReview(false); }}>{categoryNames[id]}</Button>)}</View></View>
      <Button onPress={() => { setReview(true); setMessage(''); }}>Preview budget changes</Button>
      {review && <View style={styles.panel}><Text style={styles.heading}>{proposal.periodLabel} preview</Text><Text style={styles.body}>Checking balance: {cash(proposal.balanceCents)}{'\n'}Reserved for bills: {cash(proposal.billsCents)}{'\n'}Reserved for your goal: {cash(proposal.savingsCents)}</Text>
        {proposal.allocations.map(c => <View key={c.id} style={{ gap: 5, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 12 }}><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={styles.label}>{c.name}</Text><Text style={styles.label}>{cash(c.limit)}</Text></View><Text style={styles.body}>{cash(spent[c.id] ?? 0)} already spent · {cash(Math.max(0, c.limit - (spent[c.id] ?? 0)))} left{(spent[c.id] ?? 0) > c.limit ? ' · over the proposed limit' : ''}</Text></View>)}
        <Text style={styles.body}>{cash(proposal.unallocatedCents)} stays unallocated. </Text>
        {proposal.warnings.map(w => <Text key={w} style={styles.notice}>{w}</Text>)}
        {!!bank.billReviewRequired && <Button secondary onPress={() => router.navigate('/banking')}>Review missing bills</Button>}
        <Button disabled={busy || !proposal.canApprove} onPress={() => { setBusy(true); void approvePlan(proposal).then(() => { setReview(false); setDraft(null); setPriority(null); setMessage('Budget updated.'); }).catch(error => setMessage(error instanceof Error ? error.message : 'Budget could not be saved.')).finally(() => setBusy(false)); }}>{busy ? 'Saving…' : 'Apply updated budget'}</Button>
      </View>}
    </>}
    {!!message && <Text accessibilityLiveRegion="polite" style={styles.body}>{message}</Text>}
  </Screen>;
}
