import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Icon, Screen, SectionTitle } from '../components/design';
import { AmountRow, colors, Group, GroupRow, Money, NavyFace, Notice, PressScale, styles } from '../components/ui';
import { categoriesWithSpend, displayMoney, parseMoney } from '../domain/budget';
import { useBudget } from '../state/BudgetProvider';

export default function BudgetScreen() {
  const { budget, settings, ready, setLimits } = useBudget();
  const categories = categoriesWithSpend(budget);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState('');
  const allocated = categories.reduce((sum, category) => sum + category.limit, 0);
  const unallocated = budget.plan ? Math.max(0, budget.plan.availableCents - allocated) : 0;
  const save = () => {
    if (!editingId) return false;
    const text = draft.trim();
    const cents = /^0(?:\.0{1,2})?$/.test(text) ? 0 : parseMoney(text);
    if (cents === null) { setMessage('Enter valid dollar amounts with up to two decimal places.'); return false; }
    try {
      setLimits(Object.fromEntries(categories.map(category => [category.id, category.id === editingId ? cents : category.limit])));
      setEditingId(null);
      setMessage('');
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Budget could not be saved.');
      return false;
    }
  };
  return <Screen title="Budget">
    {!ready ? <Text style={styles.body}>Loading your allocations…</Text> : <>
      <NavyFace title="Allocated">
        <Money size={40} color={colors.white} weight="700">{displayMoney(allocated, settings.hideBalances)}</Money>
      </NavyFace>
      <View style={{ gap: 16 }}>
        <SectionTitle>Category limits</SectionTitle>
        <Group>
          {categories.map((category, index) => <GroupRow key={category.id} last={index === categories.length - 1}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <Text style={[styles.heading, { flexShrink: 1 }]}>{category.name}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                {editingId === category.id
                  ? <TextInput accessibilityLabel={`${category.name} budget`} value={draft} onChangeText={setDraft} keyboardType="decimal-pad" autoFocus onSubmitEditing={save} style={[styles.input, styles.money, { minWidth: 104, textAlign: 'right', paddingVertical: 8, fontSize: 20, minHeight: 48 }]} />
                  : <Money size={17} weight="600">{displayMoney(category.limit, settings.hideBalances)}</Money>}
                <PressScale accessibilityRole="button" accessibilityLabel={editingId === category.id ? `Save ${category.name} budget` : `Edit ${category.name} budget`} onPress={() => {
                  if (editingId === category.id) { save(); return; }
                  if (editingId && !save()) return;
                  setEditingId(category.id);
                  setDraft(String(category.limit / 100));
                  setMessage('');
                }} style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="pencil" size={18} color={colors.navy} strokeWidth={1.6} />
                </PressScale>
              </View>
            </View>
          </GroupRow>)}
        </Group>
      </View>
      {!!budget.plan && <View style={{ gap: 16 }}>
        <SectionTitle>Plan leftover</SectionTitle>
        <Group>
          <GroupRow last>
            <AmountRow label="Unallocated">
              <Money size={17} weight="600">{displayMoney(unallocated, settings.hideBalances)}</Money>
            </AmountRow>
          </GroupRow>
        </Group>
      </View>}
    </>}
    {!!message && <Notice>{message}</Notice>}
  </Screen>;
}
