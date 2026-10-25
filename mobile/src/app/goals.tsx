import { useState } from 'react';
import { Text, View } from 'react-native';
import { Screen, Progress, Icon } from '../components/design';
import { Button, colors, Field, styles } from '../components/ui';
import { dailyGoalReserve, money, parseMoney } from '../domain/budget';
import { useBudget } from '../state/BudgetProvider';

export default function Goals() {
  const { budget, setGoal, ready } = useBudget();
  const goal = budget.goal;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [days, setDays] = useState('');
  const [message, setMessage] = useState('');
  return <Screen title={editing ? 'Edit goal' : 'Your goal'} subtitle={editing ? 'Give your savings a destination.' : 'Small steps. Something worth saving for.'}>
    {!ready ? <Text style={styles.body}>Loading your goal…</Text> : editing ? <View style={styles.panel}>
      <Field label="Goal name" value={name} onChangeText={setName} />
      <Field label="Target amount ($)" value={amount} onChangeText={setAmount} numeric />
      <Field label="Days to reach goal" value={days} onChangeText={setDays} numeric />
      <Text style={styles.body}>Your {money(goal.saved)} already saved stays in this goal. Review a new plan in Banking to change your category allocations.</Text>
      <Button onPress={() => {
        const target = parseMoney(amount); const duration = Number(days);
        if (!target || !name.trim() || !Number.isSafeInteger(duration) || duration < 1 || duration > 3650) { setMessage('Enter a name, positive target, and 1–3650 whole days.'); return; }
        setGoal({ ...goal, name: name.trim(), target, days: duration }); setEditing(false); setMessage('Goal saved.');
      }}>Save goal</Button><Button secondary onPress={() => { setEditing(false); setMessage(''); }}>Cancel</Button>
    </View> : <View style={[styles.panel, { minHeight: 430, justifyContent: 'center', gap: 28, paddingVertical: 42 }]}>
      <View style={{ alignItems: 'center', gap: 14 }}><View style={{ padding: 16, borderRadius: 32, backgroundColor: '#EDF5FA' }}><Icon name="goal" size={32} /></View><Text style={styles.heading}>{goal.name}</Text></View>
      <View style={{ alignItems: 'center', gap: 8 }}><Text style={{ color: colors.ink, fontSize: 40, letterSpacing: -1.5, fontWeight: '700', textAlign: 'center' }}>{goal.saved >= goal.target ? 'Goal reached' : `${goal.days} days to go`}</Text><Text style={styles.body}>{money(goal.saved)} / {money(goal.target)}</Text></View>
      <Progress value={goal.target ? goal.saved / goal.target : 0} label="Saving goal progress" />
      <Text style={[styles.body, { textAlign: 'center' }]}>{money(dailyGoalReserve(goal))} per day to reach your target</Text>
      <Button secondary onPress={() => { setName(goal.name); setAmount(String(goal.target / 100)); setDays(String(goal.days)); setMessage(''); setEditing(true); }}>Edit goal</Button>
    </View>}
    {!!message && <Text accessibilityLiveRegion="polite" style={styles.notice}>{message}</Text>}
  </Screen>;
}
