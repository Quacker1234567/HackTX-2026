import { useState } from 'react';
import { Text, View } from 'react-native';
import { SectionTitle, StackPage } from '../components/design';
import { AmountRow, Chip, colors, Group, GroupRow, Money, styles } from '../components/ui';
import { money } from '../domain/budget';
import { useBudget } from '../state/BudgetProvider';

export default function Transactions() {
  const { budget } = useBudget();
  const [filter, setFilter] = useState('All');
  const rows = [
    ...budget.transactions.filter(t => !t.nessiePurchaseId || !budget.bank?.purchases.some(p => p.id === t.nessiePurchaseId)).map(t => ({ id: `local-${t.id}`, name: t.merchant, cents: -t.cents, date: t.createdAt, source: t.nessiePurchaseId ? 'Nessie' : 'Local demo', status: t.nessiePurchaseId ? 'created; refresh pending' : 'confirmed' })),
    ...(budget.bank?.purchases ?? []).map(t => ({ id: `purchase-${t.id}`, name: t.merchant, cents: -t.cents, date: t.date, source: 'Nessie', status: t.status })),
    ...(budget.bank?.deposits ?? []).map(t => ({ id: `deposit-${t.id}`, name: t.description || 'Deposit', cents: t.cents, date: t.date, source: 'Nessie', status: t.status })),
  ].filter(t => filter === 'All' || t.source === filter).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  return <StackPage>
    <View style={styles.row}>{['All', 'Nessie', 'Local demo'].map(f => <Chip key={f} label={f} selected={f === filter} onPress={() => setFilter(f)} />)}</View>
    <View style={{ gap: 16 }}>
      <SectionTitle>Activity</SectionTitle>
      <Group>
        {rows.length ? rows.map((t, index) => <GroupRow key={t.id} last={index === rows.length - 1}>
          <AmountRow label={t.name}>
            <Money size={17} weight="600" color={t.cents > 0 ? colors.blue : colors.ink}>{t.cents > 0 ? '+' : '−'}{money(Math.abs(t.cents))}</Money>
          </AmountRow>
          <Text style={styles.label}>{t.source} · {t.status}</Text>
        </GroupRow>) : <GroupRow last><Text style={styles.body}>No transactions in this filter.</Text></GroupRow>}
      </Group>
    </View>
  </StackPage>;
}
