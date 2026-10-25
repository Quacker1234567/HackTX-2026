import { useState } from 'react';
import { Text, View } from 'react-native';
import { Screen, GoalRing } from '../components/design';
import { Button, Field, Group, GroupRow, Money, colors, styles } from '../components/ui';
import { dailyGoalReserve, displayMoney, Goal, normalizeGoals, parseMoney } from '../domain/budget';
import { useBudget } from '../state/BudgetProvider';

export default function Goals() {
  const { budget, settings, ready, saveGoal, removeGoal } = useBudget();
  const goals = normalizeGoals(budget).goals!;
  const [editing, setEditing] = useState<Goal | null>(null);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [saved, setSaved] = useState('');
  const [days, setDays] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const cash = (cents: number) => displayMoney(cents, settings.hideBalances);
  function edit(goal: Goal) {
    setEditing(goal); setName(goal.name); setAmount(String(goal.target / 100));
    setSaved(String(goal.saved / 100)); setDays(String(goal.days)); setError('');
  }
  return <Screen title="Goals">
    {!ready ? <Text style={styles.body}>Loading goals…</Text> : editing ? <View style={{ gap: 16 }}>
      <Group>
        <GroupRow><Field label="Goal name" value={name} onChangeText={setName} /></GroupRow>
        <GroupRow><Field label="Target ($)" value={amount} onChangeText={setAmount} numeric /></GroupRow>
        <GroupRow>{editing.accountId ? <View style={styles.amountRow}><Text style={styles.label}>Savings balance</Text><Money>{cash(editing.saved)}</Money></View> : <Field label="Already saved ($)" value={saved} onChangeText={setSaved} numeric />}</GroupRow>
        <GroupRow last><Field label="Days to reach goal" value={days} onChangeText={setDays} numeric /></GroupRow>
      </Group>
      <Button disabled={busy} onPress={() => {
        const target = parseMoney(amount), duration = Number(days);
        const savedAmount = editing.accountId ? editing.saved : /^0(?:\.0{1,2})?$/.test(saved.trim()) ? 0 : parseMoney(saved);
        if (!name.trim() || !target || savedAmount === null || !Number.isInteger(duration) || duration < 1 || duration > 3650) { setError('Enter a name, valid amounts and 1–3650 days.'); return; }
        setBusy(true);
        void saveGoal({ ...editing, name: name.trim(), target, saved: savedAmount, days: duration }).then(() => setEditing(null)).catch(e => setError(e instanceof Error ? e.message : 'Could not save goal.')).finally(() => setBusy(false));
      }}>{busy ? 'Saving…' : 'Save goal'}</Button>
      <Button secondary disabled={busy} onPress={() => { setEditing(null); setError(''); }}>Cancel</Button>
      {goals.some(g => g.id === editing.id) && goals.length > 1 && <Button secondary disabled={busy} onPress={() => { setBusy(true); void removeGoal(editing.id).then(() => setEditing(null)).catch(e => setError(e instanceof Error ? e.message : 'Could not remove goal.')).finally(() => setBusy(false)); }}>Remove goal</Button>}
    </View> : <>
      {goals.map(goal => <View key={goal.id} style={[styles.panel, { gap: 20, padding: 24 }]}>
        <View style={{ gap: 6 }}><View style={styles.navyHairline} /><Text style={[styles.heading, { fontSize: 22, lineHeight: 28 }]}>{goal.name}</Text></View>
        <View style={{ alignItems: 'center' }}><GoalRing size={200} value={goal.saved / goal.target} label={`${goal.name} progress`}><Money size={32} weight="700">{cash(Math.max(0, goal.target - goal.saved))}</Money><Text style={styles.body}>left</Text></GoalRing></View>
        <View style={styles.amountRow}><Text style={styles.label}>Saved</Text><Money size={17}>{cash(goal.saved)} / {cash(goal.target)}</Money></View>
        <View style={styles.amountRow}><Text style={styles.label}>{goal.saved >= goal.target ? 'Goal reached' : `${goal.days} days`}</Text><Text style={styles.body}>{cash(dailyGoalReserve(goal))} / day</Text></View>
        <Button secondary onPress={() => edit(goal)}>Edit goal</Button>
      </View>)}
      <Button onPress={() => edit({ id: `goal-${Date.now()}-${Math.random().toString(36).slice(2)}`, name: '', target: 100000, saved: 0, days: 90 })}>Add goal</Button>
    </>}
    {!!error && <Text accessibilityRole="alert" style={{ color: colors.red }}>{error}</Text>}
  </Screen>;
}
