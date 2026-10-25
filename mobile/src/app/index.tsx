import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Screen, Progress, Icon } from '../components/design';
import { colors, styles } from '../components/ui';
import { money } from '../domain/budget';
import { useBudget } from '../state/BudgetProvider';

export default function Home() {
  const { budget, ready, error } = useBudget();
  const goal = budget.goal;
  return <Screen title="Your budget" subtitle={budget.plan ? `Your approved plan until ${budget.plan.payday}` : 'A little clarity before your next purchase.'}>
    {!ready ? <Text style={styles.body}>Loading your budget…</Text> : <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.blue }} /><Text style={{ color: colors.muted, fontSize: 13 }}>{budget.plan ? 'Approved allocations' : 'Local demo allocations'}</Text></View>
      {budget.categories.map(category => {
        const remaining = Math.max(0, category.limit - category.spent);
        return <Pressable key={category.id} accessibilityRole="button" accessibilityLabel={`${category.name}: ${money(remaining)} remaining. Test a purchase.`} onPress={() => router.navigate({ pathname: '/checkout', params: { category: category.id } })} android_ripple={{ color: '#E6F0F7' }} style={[styles.panel, { overflow: 'hidden', gap: 18 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text style={styles.heading}>{category.name}</Text><Icon name="arrow" size={18} color={colors.muted} /></View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}><Text style={{ fontSize: 28, fontWeight: '600', color: colors.ink, letterSpacing: -0.8 }}>{money(remaining)}</Text><Text style={styles.body}>/ {money(category.limit)}</Text></View>
          <Progress value={category.limit ? remaining / category.limit : 0} label={`${category.name} remaining`} />
          <Text style={{ fontSize: 13, color: colors.muted }}>Remaining · {money(category.spent)} spent</Text>
        </Pressable>;
      })}
      <Pressable accessibilityRole="button" onPress={() => router.navigate(budget.bank ? '/banking' : '/connections')} style={[styles.panel, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}><View style={{ gap: 5 }}><Text style={styles.heading}>{budget.bank ? budget.bank.account.name : 'Connect your bank'}</Text><Text style={{ color: colors.muted, fontSize: 13 }}>{budget.bank ? 'Nessie sandbox account balance' : 'Import your Nessie sample customer'}</Text></View>{budget.bank ? <Text style={styles.label}>{money(budget.bank.account.balanceCents)}</Text> : <Icon name="bank" />}</Pressable>
      <Text style={[styles.heading, { marginTop: 4 }]}>Saving goal</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="View saving goal" onPress={() => router.navigate('/goals')} style={styles.panel}><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={styles.heading}>{goal.name}</Text><Icon name="goal" /></View><Progress value={goal.target ? goal.saved / goal.target : 0} label="Goal saved" /><Text style={styles.body}>{money(goal.saved)} of {money(goal.target)}</Text></Pressable>
    </>}{!!error && <Text accessibilityRole="alert" style={styles.notice}>{error}</Text>}
  </Screen>;
}

