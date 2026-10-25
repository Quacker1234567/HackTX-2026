import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Icon, Screen } from '../components/design';
import { colors, styles } from '../components/ui';
import { displayMoney } from '../domain/budget';
import { useBudget } from '../state/BudgetProvider';

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} accessibilityLabel={label} onPress={() => onChange(!value)} style={{ padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
    <Text style={[styles.heading, { flexShrink: 1 }]}>{label}</Text>
    <View style={{ width: 48, height: 28, borderRadius: 14, padding: 3, backgroundColor: value ? colors.blue : colors.line, justifyContent: 'center', alignItems: value ? 'flex-end' : 'flex-start' }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.white }} />
    </View>
  </Pressable>;
}

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
  return <Screen title="Settings" subtitle="Your account and how Flow should behave.">
    {!ready ? <Text style={styles.body}>Loading your settings…</Text> : <>
      <Pressable accessibilityRole="button" onPress={() => router.navigate(budget.bank ? '/banking' : '/connections')} style={[styles.panel, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
        <View style={{ gap: 5, flexShrink: 1 }}><Text style={styles.heading}>{budget.bank ? budget.bank.account.name : 'Connect your bank'}</Text><Text style={{ color: colors.muted, fontSize: 13 }}>{budget.bank ? 'Nessie sandbox account balance' : 'Import your Nessie sample customer'}</Text></View>
        {budget.bank ? <Text style={styles.label}>{displayMoney(budget.bank.account.balanceCents, settings.hideBalances)}</Text> : <Icon name="bank" />}
      </Pressable>
      <Text style={[styles.heading, { marginTop: 4 }]}>Profile</Text>
      <View style={[styles.panel, { padding: 0, overflow: 'hidden' }]}>
        <View style={{ padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <Text style={[styles.heading, { flexShrink: 1 }]}>Display name</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {editingName
              ? <TextInput accessibilityLabel="Display name" value={draftName} onChangeText={setDraftName} autoFocus maxLength={40} onSubmitEditing={saveName} style={[styles.input, { minWidth: 120, textAlign: 'right', paddingVertical: 8 }]} />
              : <Text style={{ fontSize: 20, color: settings.displayName ? colors.ink : colors.muted }}>{settings.displayName || 'Add a name'}</Text>}
            <Pressable accessibilityRole="button" accessibilityLabel={editingName ? 'Save display name' : 'Edit display name'} onPress={() => {
              if (editingName) { saveName(); return; }
              setDraftName(settings.displayName);
              setEditingName(true);
              setMessage('');
            }} hitSlop={8} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="pencil" size={18} color={colors.blue} strokeWidth={1.3} />
            </Pressable>
          </View>
        </View>
      </View>
      <Text style={[styles.heading, { marginTop: 4 }]}>Preferences</Text>
      <View style={[styles.panel, { padding: 0, overflow: 'hidden' }]}>
        <Toggle label="Hide balances" value={settings.hideBalances} onChange={hideBalances => updateSettings({ hideBalances })} />
        <View style={{ height: 1, backgroundColor: colors.paper }} />
        <Toggle label="Purchase alerts" value={settings.purchaseAlerts} onChange={purchaseAlerts => updateSettings({ purchaseAlerts })} />
        <View style={{ height: 1, backgroundColor: colors.paper }} />
        <Toggle label="Goal reminders" value={settings.goalReminders} onChange={goalReminders => updateSettings({ goalReminders })} />
      </View>
      <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 21 }}>Preferences stay on this device. Hide balances covers Home, Goal, and Budget. Flow does not send push notifications yet.</Text>
    </>}
    {!!message && <Text accessibilityLiveRegion="polite" style={styles.notice}>{message}</Text>}
  </Screen>;
}
