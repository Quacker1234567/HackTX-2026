import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { colors, styles } from '../components/ui';
import { money } from '../domain/budget';
import { useBudget } from '../state/BudgetProvider';

export default function Transactions() {
  const { budget } = useBudget();
  const [filter, setFilter] = useState('All');
  const rows = [
    ...budget.transactions.map(t => ({ id: `local-${t.id}`, name: t.merchant, cents: -t.cents, date: t.createdAt, source: 'Local demo', status: 'confirmed' })),
    ...(budget.bank?.purchases ?? []).map(t => ({ id: `purchase-${t.id}`, name: t.merchant, cents: -t.cents, date: t.date, source: 'Nessie', status: t.status })),
    ...(budget.bank?.deposits ?? []).map(t => ({ id: `deposit-${t.id}`, name: t.description || 'Deposit', cents: t.cents, date: t.date, source: 'Nessie', status: t.status })),
  ].filter(t => filter === 'All' || t.source === filter).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  return <ScrollView contentContainerStyle={styles.page}>
    <Text style={styles.title}>Transaction history</Text><Text style={styles.body}>Imported bank activity and purchases confirmed on this device.</Text>
    <View style={styles.row}>{['All', 'Nessie', 'Local demo'].map(f => <Pressable key={f} accessibilityRole="button" accessibilityState={{ selected: f === filter }} onPress={() => setFilter(f)} style={[styles.button, { backgroundColor: f === filter ? colors.blue : colors.white }]}><Text style={{ color: f === filter ? 'white' : colors.ink }}>{f}</Text></Pressable>)}</View>
    <View style={[styles.panel, { gap: 0 }]}>{rows.length ? rows.map((t, index) => <View key={t.id} style={{ paddingVertical: 18, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line, gap: 7 }}><View style={{ flexDirection: 'row', gap: 12, justifyContent: 'space-between' }}><Text style={[styles.label, { flex: 1 }]}>{t.name}</Text><Text style={{ fontWeight: '700', color: t.cents > 0 ? colors.blue : colors.ink }}>{t.cents > 0 ? '+' : '−'}{money(Math.abs(t.cents))}</Text></View><Text style={{ color: colors.muted, fontSize: 13 }}>{t.source} · {t.status} · {t.date ? (t.date.includes('T') ? new Date(t.date).toLocaleDateString() : t.date) : 'Date unavailable'}</Text></View>) : <Text style={styles.body}>{filter === 'Local demo' ? 'Confirm a purchase in Tools to see it here.' : 'Import a Nessie account in Connections to see its activity.'}</Text>}</View>
  </ScrollView>;
}

