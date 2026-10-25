import { useState } from 'react';
import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { Screen, Icon, IconName, SectionTitle } from '../components/design';
import { Button, Chip, colors, Group, GroupRow, NavyFace, Notice, styles } from '../components/ui';
import { useBudget } from '../state/BudgetProvider';

const tools = [
  { path: '/settings', name: 'Demo preferences', description: 'Display name and balance visibility', icon: 'settings' },
  { path: '/banking', name: 'Bank diagnostics', description: 'Bill review, purchase reserves and bank import details', icon: 'bank' },
  { path: '/connections', name: 'Connections', description: 'Nessie import, Firebase and ESP32 display', icon: 'tools' },
  { path: '/checkout', name: 'Test a purchase', description: 'Simulate a location, preview and confirm spending', icon: 'purchase' },
] as const;
const locations = [
  { id: 'restaurant', label: 'Restaurant' },
  { id: 'grocery', label: 'Grocery store' },
  { id: 'bus', label: 'Bus stop' },
] as const;
const situations = [
  { id: 'unused', label: 'Unused budget' },
  { id: 'maxed', label: 'Maxed out' },
] as const;

export default function Tools() {
  const { budget } = useBudget();
  const [location, setLocation] = useState<(typeof locations)[number]['id']>('restaurant');
  const [situation, setSituation] = useState<(typeof situations)[number]['id']>('unused');
  const [message, setMessage] = useState('');
  return <Screen title="Tools">
    <NavyFace title="Workspace">
      <Text style={{ color: colors.white, fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.5 }}>{budget.bank?.account.name ?? 'Demo workspace'}</Text>
    </NavyFace>
    <View style={{ gap: 16 }}>
      <SectionTitle>Simulation</SectionTitle>
      <Group>
        <GroupRow>
          <Text style={styles.label}>Location</Text>
          <View style={{ gap: 10, alignSelf: 'stretch' }}>{locations.map(item => <Chip key={item.id} label={item.label} selected={location === item.id} onPress={() => setLocation(item.id)} />)}</View>
        </GroupRow>
        <GroupRow>
          <Text style={styles.label}>Budget situation</Text>
          <View style={{ gap: 10, alignSelf: 'stretch' }}>{situations.map(item => <Chip key={item.id} label={item.label} selected={situation === item.id} onPress={() => setSituation(item.id)} />)}</View>
        </GroupRow>
        <GroupRow>
          <Button onPress={() => setMessage('Execute is not wired yet. Nothing was sent to the device and your budget was not changed.')}>Execute</Button>
        </GroupRow>
        <GroupRow last>
          <Button secondary onPress={() => { setLocation('restaurant'); setSituation('unused'); setMessage('Reset is not wired yet. Your budget values were not changed.'); }}>Reset to default</Button>
          {!!message && <Notice>{message}</Notice>}
        </GroupRow>
      </Group>
    </View>
    <View style={{ gap: 16 }}>
      <SectionTitle>Development</SectionTitle>
      <Group>
        {tools.map((tool, index) => <GroupRow key={tool.path} last={index === tools.length - 1} onPress={() => router.navigate(tool.path)} accessibilityLabel={tool.name}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 32 }}>
            <Icon name={tool.icon as IconName} color={colors.navy} />
            <Text style={[styles.heading, { flex: 1 }]}>{tool.name}</Text>
            <Icon name="arrow" size={18} color={colors.muted} />
          </View>
        </GroupRow>)}
      </Group>
    </View>
  </Screen>;
}
