import { useState } from 'react';
import { Text, View } from 'react-native';
import { Screen } from '../components/design';
import { Button, colors, Field, styles } from '../components/ui';
import { money, parseMoney } from '../domain/budget';
import { useBudget } from '../state/BudgetProvider';

export default function BudgetScreen() {
  const { budget, ready, setLimits } = useBudget();
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const total = budget.categories.reduce((sum, category) => sum + category.limit, 0);
  return <Screen title="Budget" subtitle="Make room for what matters to you.">
    {!ready ? <Text style={styles.body}>Loading your allocations…</Text> : <>
      <View style={[styles.panel, { padding: 0, overflow: 'hidden' }]}>{budget.categories.map((category, index) => <View key={category.id} style={{ padding: 20, gap: 8, borderTopWidth: index ? 1 : 0, borderTopColor: colors.paper }}>
        {editing ? <Field label={`${category.name} budget ($)`} value={drafts[category.id] ?? ''} onChangeText={value => setDrafts(current => ({ ...current, [category.id]: value }))} numeric /> : <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}><Text style={styles.heading}>{category.name}</Text><Text style={{ fontSize: 20, color: colors.ink }}>{money(category.limit)}</Text></View>}
        <Text style={{ fontSize: 13, color: colors.muted }}>{money(category.spent)} already spent</Text>
      </View>)}</View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 }}><Text style={styles.label}>Total allocated</Text><Text style={styles.label}>{money(total)}</Text></View>
      <Text style={styles.body}>{budget.plan ? `Up to ${money(budget.plan.availableCents)} available after bills and savings. Editing keeps these reserves protected.` : 'These are local demo allocations. Import your bank data and approve a plan in Tools to base them on your available funds.'}</Text>
      {editing ? <><Button onPress={() => {
        const limits: Record<string, number> = {};
        for (const category of budget.categories) {
          const text = (drafts[category.id] ?? '').trim();
          const cents = /^0(?:\.0{1,2})?$/.test(text) ? 0 : parseMoney(text);
          if (cents === null) { setMessage('Enter valid dollar amounts with up to two decimal places.'); return; }
          limits[category.id] = cents;
        }
        try { setLimits(limits); setEditing(false); setMessage('Budget saved.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Budget could not be saved.'); }
      }}>Save budget</Button><Button secondary onPress={() => { setEditing(false); setMessage(''); }}>Cancel</Button></> : <Button onPress={() => { setDrafts(Object.fromEntries(budget.categories.map(c => [c.id, String(c.limit / 100)]))); setMessage(''); setEditing(true); }}>Edit allocations</Button>}
    </>}
    {!!message && <Text accessibilityLiveRegion="polite" style={styles.notice}>{message}</Text>}
  </Screen>;
}
