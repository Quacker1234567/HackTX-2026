import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Icon, Screen, SectionTitle } from '../components/design';
import { colors, Divider, Group, GroupRow, Money, NavyFace, Notice, PressScale, styles, Switch } from '../components/ui';
import { displayMoney } from '../domain/budget';
import { useBudget } from '../state/BudgetProvider';

export default function Settings() {
  const { budget, settings, ready, updateSettings } = useBudget();
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [message, setMessage] = useState('');
  const saveName = () => {
    const name = draftName.trim().slice(0, 40);
    updateSettings({ displayName: name });
    setEditingName(false);
    setMessage(name ? 'Display name saved.' : 'Display name cleared.');
  };
  return <Screen title="Settings">
    {!ready ? <Text style={styles.body}>Loading your settings…</Text> : <>
      {budget.bank
        ? <NavyFace title={budget.bank.account.name} onPress={() => router.navigate('/banking')} accessibilityLabel={`${budget.bank.account.name}, ${displayMoney(budget.bank.account.balanceCents, settings.hideBalances)}`}>
          <Money size={40} color={colors.white} weight="700">{displayMoney(budget.bank.account.balanceCents, settings.hideBalances)}</Money>
        </NavyFace>
        : <NavyFace title="Bank" onPress={() => router.navigate('/connections')} accessibilityLabel="Connect your bank">
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: colors.onNavy, fontSize: 20, fontWeight: '600', letterSpacing: -0.3 }}>Connect your bank</Text>
            <Icon name="bank" color={colors.white} />
          </View>
        </NavyFace>}
      <View style={{ gap: 16 }}>
        <SectionTitle>Profile</SectionTitle>
        <Group>
          <GroupRow last>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, minHeight: 48 }}>
              <Text style={[styles.heading, { flexShrink: 1 }]}>Display name</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                {editingName
                  ? <TextInput accessibilityLabel="Display name" value={draftName} onChangeText={setDraftName} autoFocus maxLength={40} onSubmitEditing={saveName} style={[styles.input, { minWidth: 120, textAlign: 'right', paddingVertical: 8, minHeight: 48 }]} />
                  : <Text style={{ fontSize: 17, fontWeight: '400', color: settings.displayName ? colors.ink : colors.muted }}>{settings.displayName || 'Add a name'}</Text>}
                <PressScale accessibilityRole="button" accessibilityLabel={editingName ? 'Save display name' : 'Edit display name'} onPress={() => {
                  if (editingName) { saveName(); return; }
                  setDraftName(settings.displayName);
                  setEditingName(true);
                  setMessage('');
                }} style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="pencil" size={18} color={colors.navy} strokeWidth={1.6} />
                </PressScale>
              </View>
            </View>
          </GroupRow>
        </Group>
      </View>
      <View style={{ gap: 16 }}>
        <SectionTitle>Preferences</SectionTitle>
        <Group>
          <Switch label="Hide balances" value={settings.hideBalances} onChange={hideBalances => updateSettings({ hideBalances })} />
          <Divider />
          <Switch label="Purchase alerts" value={settings.purchaseAlerts} onChange={purchaseAlerts => updateSettings({ purchaseAlerts })} />
          <Divider />
          <Switch label="Goal reminders" value={settings.goalReminders} onChange={goalReminders => updateSettings({ goalReminders })} />
        </Group>
      </View>
    </>}
    {!!message && <Notice>{message}</Notice>}
  </Screen>;
}
