import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { Screen, Progress, Icon, SectionTitle } from '../components/design';
import { colors, Group, GroupRow, Money, NavyFace, Notice, PressScale, styles } from '../components/ui';
import { categoriesWithSpend, displayMoney } from '../domain/budget';
import { useBudget } from '../state/BudgetProvider';

export default function Home() {
  const { budget, settings, ready, error } = useBudget();
  const categories = categoriesWithSpend(budget);
  const goal = budget.goal;
  const name = settings.displayName.trim();
  const funded = categories.filter(category => category.limit > 0);
  const remainingTotal = funded.reduce((sum, category) => sum + Math.max(0, category.limit - category.spent), 0);
  const limitTotal = funded.reduce((sum, category) => sum + category.limit, 0);
  const spentTotal = funded.reduce((sum, category) => sum + category.spent, 0);
  const faceTitle = budget.bank?.account.name ?? 'Remaining';
  return <Screen title={name || 'Home'} mark={false}>
    {!ready ? <Text style={styles.body}>Loading your budget…</Text> : <>
      <NavyFace title={faceTitle} accessibilityLabel={`${faceTitle}: ${displayMoney(remainingTotal, settings.hideBalances)} left`}>
        <Money size={40} color={colors.white} weight="700">{displayMoney(remainingTotal, settings.hideBalances)}</Money>
        <Progress onNavy value={limitTotal ? spentTotal / limitTotal : 0} label="Budget used" />
      </NavyFace>
      <View style={{ gap: 16 }}>
        <SectionTitle>Categories</SectionTitle>
        <Group>
          {funded.length ? funded.map((category, index) => {
            const remaining = Math.max(0, category.limit - category.spent);
            const over = category.spent > category.limit;
            const leftover = `${displayMoney(remaining, settings.hideBalances)} left`;
            return <GroupRow key={category.id} last={index === funded.length - 1} accessibilityLabel={`${category.name}: ${leftover}`}>
              <View style={styles.amountRow}>
                <Text style={[styles.rowLead, { flexShrink: 1, color: over ? colors.red : colors.ink }]}>{category.name}</Text>
                <Money size={16} weight="400" color={over ? colors.red : colors.muted}>{leftover}</Money>
              </View>
              <Progress value={category.limit ? category.spent / category.limit : 0} label={`${category.name} used`} />
            </GroupRow>;
          }) : <GroupRow last><Text style={styles.body}>No funded categories yet. Set limits in Budget.</Text></GroupRow>}
        </Group>
      </View>
      <PressScale accessibilityLabel={`View saving goal. ${goal.name}, saved ${displayMoney(goal.saved, settings.hideBalances)} of ${displayMoney(goal.target, settings.hideBalances)}`} onPress={() => router.navigate('/goals')} android_ripple={{ color: colors.well }} style={{ alignSelf: 'stretch' }}>
        <View style={styles.goalPlate}>
          <View style={{ flex: 1, gap: 10, minWidth: 0 }}>
            <Text style={styles.rowLead}>{goal.name}</Text>
            <Money size={16} weight="400" color={colors.muted}>{`Saved ${displayMoney(goal.saved, settings.hideBalances)} of ${displayMoney(goal.target, settings.hideBalances)}`}</Money>
            <Progress value={goal.target ? goal.saved / goal.target : 0} label="Goal saved" />
          </View>
          <Icon name="arrow" size={16} color={colors.navy} />
        </View>
      </PressScale>
    </>}
    {!!error && <Notice tone="alert">{error}</Notice>}
  </Screen>;
}
