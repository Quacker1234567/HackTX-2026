import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Icon, Screen } from '../components/design';
import { colors, styles } from '../components/ui';
import { displayMoney, parseMoney } from '../domain/budget';
import { useBudget } from '../state/BudgetProvider';

export default function BudgetScreen() {
  const { budget, settings, ready, setLimits } = useBudget();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState('');
  const save = () => {
    if (!editingId) return false;
    const text = draft.trim();
    const cents = /^0(?:\.0{1,2})?$/.test(text) ? 0 : parseMoney(text);
    if (cents === null) { setMessage('Enter valid dollar amounts with up to two decimal places.'); return false; }
    try {
      setLimits(Object.fromEntries(budget.categories.map(category => [category.id, category.id === editingId ? cents : category.limit])));
      setEditingId(null);
      setMessage('');
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Budget could not be saved.');
      return false;
    }
  };
  return <Screen title="Budget" subtitle="Make room for what matters to you.">
    {!ready ? <Text style={styles.body}>Loading your allocations…</Text> : <View style={[styles.panel, { padding: 0, overflow: 'hidden' }]}>{budget.categories.map((category, index) => <View key={category.id} style={{ padding: 20, borderTopWidth: index ? 1 : 0, borderTopColor: colors.paper }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <Text style={[styles.heading, { flexShrink: 1 }]}>{category.name}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {editingId === category.id
            ? <TextInput accessibilityLabel={`${category.name} budget`} value={draft} onChangeText={setDraft} keyboardType="decimal-pad" autoFocus onSubmitEditing={save} style={[styles.input, { minWidth: 104, textAlign: 'right', paddingVertical: 8, fontSize: 20 }]} />
            : <Text style={{ fontSize: 20, color: colors.ink }}>{displayMoney(category.limit, settings.hideBalances)}</Text>}
          <Pressable accessibilityRole="button" accessibilityLabel={editingId === category.id ? `Save ${category.name} budget` : `Edit ${category.name} budget`} onPress={() => {
            if (editingId === category.id) { save(); return; }
            if (editingId && !save()) return;
            setEditingId(category.id);
            setDraft(String(category.limit / 100));
            setMessage('');
          }} hitSlop={8} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="pencil" size={18} color={colors.blue} strokeWidth={1.3} />
          </Pressable>
        </View>
      </View>
    </View>)}</View>}
    {!!message && <Text accessibilityLiveRegion="polite" style={styles.notice}>{message}</Text>}
  </Screen>;
}
