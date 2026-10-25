import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { colors, styles } from '../components/ui';
import { displayMoney } from '../domain/budget';
import { useBudget } from '../state/BudgetProvider';

export function Activity() {
  const { budget, settings } = useBudget();
  const [filter, setFilter] = useState('All');
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState<'newest' | 'oldest'>('newest');
  const search = query.trim().toLocaleLowerCase();
  const rows = [
    ...budget.transactions.filter(t => !t.nessiePurchaseId || !budget.bank?.purchases.some(p => p.id === t.nessiePurchaseId)).map(t => ({ id: `local-${t.id}`, name: t.merchant, cents: -t.cents, date: t.createdAt, source: t.nessiePurchaseId ? 'Nessie' : 'Local demo', status: t.nessiePurchaseId ? 'created; refresh pending' : 'confirmed' })),
    ...(budget.bank?.purchases ?? []).map(t => ({ id: `purchase-${t.id}`, name: t.merchant, cents: -t.cents, date: t.date, source: 'Nessie', status: t.status })),
    ...(budget.bank?.deposits ?? []).map(t => ({ id: `deposit-${t.id}`, name: t.description || 'Deposit', cents: t.cents, date: t.date, source: 'Nessie', status: t.status })),
  ].filter(t => (filter === 'All' || t.source === filter) && (!search || `${t.name} ${t.source} ${t.status} ${t.date ?? ''}`.toLocaleLowerCase().includes(search))).sort((a, b) => {
    const aDate = a.date ? Date.parse(a.date) : NaN;
    const bDate = b.date ? Date.parse(b.date) : NaN;
    // Undated activity remains at the bottom in either direction.
    if (!Number.isFinite(aDate)) return Number.isFinite(bDate) ? 1 : a.id.localeCompare(b.id);
    if (!Number.isFinite(bDate)) return -1;
    return (order === 'newest' ? bDate - aDate : aDate - bDate) || a.id.localeCompare(b.id);
  });
  return <View style={{ gap: 20 }}>
    <Text style={styles.heading}>Transaction history</Text>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <TextInput accessibilityLabel="Search transactions" placeholder="Search transactions" value={query} onChangeText={setQuery} autoCorrect={false} autoCapitalize="none" returnKeyType="search" style={[styles.input, { flex: 1, minWidth: 0 }]} />
      {!!query && <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQuery('')} style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.blue }}>Clear</Text></Pressable>}
    </View>
    <View style={styles.row}>{['All', 'Nessie', 'Local demo'].map(f => <Pressable key={f} accessibilityRole="button" accessibilityState={{ selected: f === filter }} onPress={() => setFilter(f)} style={[styles.button, { backgroundColor: f === filter ? colors.blue : colors.white }]}><Text style={{ color: f === filter ? 'white' : colors.ink }}>{f}</Text></Pressable>)}</View>
    <View style={styles.row}>{(['newest', 'oldest'] as const).map(value => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: order === value }} accessibilityLabel={value === 'newest' ? 'Sort newest first' : 'Sort oldest first'} onPress={() => setOrder(value)} style={[styles.button, { flexGrow: 1, backgroundColor: order === value ? colors.navy : colors.white }]}><Text style={{ color: order === value ? colors.white : colors.ink }}>{value === 'newest' ? 'Newest first' : 'Oldest first'}</Text></Pressable>)}</View>
    <Text accessibilityLiveRegion="polite" style={styles.label}>{rows.length} {rows.length === 1 ? 'transaction' : 'transactions'}</Text>
    <View style={[styles.panel, { gap: 0 }]}>{rows.length ? rows.map((t, index) => <View key={t.id} style={{ paddingVertical: 18, borderTopWidth: index ? 1 : 0, borderTopColor: colors.line, gap: 7 }}><View style={{ flexDirection: 'row', gap: 12, justifyContent: 'space-between' }}><Text style={[styles.label, { flex: 1 }]}>{t.name}</Text><Text style={{ fontWeight: '700', color: t.cents > 0 ? colors.blue : colors.ink }}>{t.cents > 0 ? '+' : '−'}{displayMoney(Math.abs(t.cents), settings.hideBalances)}</Text></View><Text style={{ color: colors.muted, fontSize: 13 }}>{t.source} · {t.status} · {t.date ? (t.date.includes('T') ? new Date(t.date).toLocaleDateString() : t.date) : 'Date unavailable'}</Text></View>) : <Text style={styles.body}>{search ? 'No matching transactions.' : 'No transactions yet.'}</Text>}</View>
  </View>;
}

