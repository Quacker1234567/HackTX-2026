import { useState } from 'react';
import { Text, View } from 'react-native';
import { Screen, GoalRing } from '../components/design';
import { Button, Field, Group, GroupRow, Money, Notice, colors, styles } from '../components/ui';
import { displayMoney, parseMoney } from '../domain/budget';
import { useBudget } from '../state/BudgetProvider';

export default function Goals() {
  const { budget, settings, setGoal, ready } = useBudget();
  const goal = budget.goal;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [days, setDays] = useState('');
  const [message, setMessage] = useState('');
  const remaining = Math.max(0, goal.target - goal.saved);
  const leftover = `${displayMoney(remaining, settings.hideBalances)} left`;
  const saved = displayMoney(goal.saved, settings.hideBalances);
  const target = displayMoney(goal.target, settings.hideBalances);
  return <Screen title={editing ? 'Edit goal' : goal.name} mark={false} center={!editing}>
    {!ready ? <Text style={styles.body}>Loading your goal…</Text> : editing ? <View style={{ gap: 16 }}>
      <Group>
        <GroupRow>
          <Field label="Goal name" value={name} onChangeText={setName} />
        </GroupRow>
        <GroupRow>
          <Field label="Target amount ($)" value={amount} onChangeText={setAmount} numeric />
        </GroupRow>
        <GroupRow last>
          <Field label="Days to reach goal" value={days} onChangeText={setDays} numeric />
        </GroupRow>
      </Group>
      <Button onPress={() => {
        const nextTarget = parseMoney(amount); const duration = Number(days);
        if (!nextTarget || !name.trim() || !Number.isSafeInteger(duration) || duration < 1 || duration > 3650) { setMessage('Enter a name, positive target, and 1–3650 whole days.'); return; }
        setGoal({ ...goal, name: name.trim(), target: nextTarget, days: duration }); setEditing(false); setMessage('Goal saved.');
      }}>Save goal</Button>
      <Button secondary onPress={() => { setEditing(false); setMessage(''); }}>Cancel</Button>
    </View> : <View style={{ width: '100%', maxWidth: 360, alignSelf: 'center', gap: 20 }}>
      <View accessibilityLabel={`${goal.name}: ${leftover}. ${saved} / ${target} saved`} style={styles.goalCard}>
        <View style={styles.navyHairline} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <GoalRing value={goal.target ? goal.saved / goal.target : 0} label="Goal saved">
            <Money size={36} weight="700" color={colors.ink}>{displayMoney(remaining, settings.hideBalances)}</Money>
            <Text style={[styles.body, { color: colors.ink }]}>left</Text>
          </GoalRing>
          <Text style={styles.heading}>{`${saved} / ${target}`}</Text>
        </View>
      </View>
      <Button secondary onPress={() => { setName(goal.name); setAmount(String(goal.target / 100)); setDays(String(goal.days)); setMessage(''); setEditing(true); }}>Edit goal</Button>
    </View>}
    {!!message && <Notice>{message}</Notice>}
  </Screen>;
}
