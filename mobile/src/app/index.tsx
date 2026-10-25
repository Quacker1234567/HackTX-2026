import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Screen, Progress, Icon } from '../components/design';
import { colors, styles } from '../components/ui';
import { displayMoney } from '../domain/budget';
import { useBudget } from '../state/BudgetProvider';

export default function Home() {
  const { budget, settings, ready, error } = useBudget();
  const goal = budget.goal;
  const name = settings.displayName.trim();
  return <Screen title={name ? `${name}'s budget` : 'Your budget'} subtitle={budget.plan ? `Your approved plan until ${budget.plan.payday}` : 'A little clarity before your next purchase.'}>
    {!ready ? <Text style={styles.body}>Loading your budget…</Text> : <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.blue }} /><Text style={{ color: colors.muted, fontSize: 13 }}>{budget.plan ? 'Approved allocations' : 'Local demo allocations'}</Text></View>
      {budget.categories.map(category => {
        const remaining = Math.max(0, category.limit - category.spent);
        return <View key={category.id} accessible accessibilityLabel={`${category.name}: ${displayMoney(remaining, settings.hideBalances)} left`} style={[styles.panel, { overflow: 'hidden', gap: 18 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
            <Text style={[styles.heading, { flexShrink: 1 }]}>{category.name}</Text>
            <Text style={[styles.heading, { fontWeight: '400', flexShrink: 1, textAlign: 'right' }]}>{displayMoney(remaining, settings.hideBalances)} left</Text>
          </View>
          <Progress value={category.limit ? category.spent / category.limit : 0} label={`${category.name} used`} />
        </View>;
      })}
      <Text style={[styles.heading, { marginTop: 4 }]}>Saving goal</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="View saving goal" onPress={() => router.navigate('/goals')} style={styles.panel}><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={styles.heading}>{goal.name}</Text><Icon name="goal" /></View><Progress value={goal.target ? goal.saved / goal.target : 0} label="Goal saved" /><Text style={styles.body}>{displayMoney(goal.saved, settings.hideBalances)} of {displayMoney(goal.target, settings.hideBalances)}</Text></Pressable>
    </>}{!!error && <Text accessibilityRole="alert" style={styles.notice}>{error}</Text>}
  </Screen>;
}

