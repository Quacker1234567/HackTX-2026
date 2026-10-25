import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Screen, Icon, IconName } from '../components/design';
import { Button, colors, styles } from '../components/ui';
import { useBudget } from '../state/BudgetProvider';

const tools = [
  { path: '/banking', name: 'Banking', description: 'Accounts, spending patterns and budget plans', icon: 'bank' },
  { path: '/connections', name: 'Connections', description: 'Nessie import, Firebase and ESP32 display', icon: 'tools' },
  { path: '/checkout', name: 'Test a purchase', description: 'Simulate a location, preview and confirm spending', icon: 'purchase' },
  { path: '/transactions', name: 'Transaction history', description: 'Imported purchases, income and local demo activity', icon: 'history' },
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

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={label} onPress={onPress} android_ripple={{ color: '#CDDDEA' }} style={[styles.button, { flexGrow: 1, backgroundColor: selected ? colors.navy : '#E4EFF7' }]}>
    <Text style={{ color: selected ? colors.white : colors.navy, fontWeight: '700', fontSize: 15 }}>{label}</Text>
  </Pressable>;
}

export default function Tools() {
  const { budget } = useBudget();
  const [location, setLocation] = useState<(typeof locations)[number]['id']>('restaurant');
  const [situation, setSituation] = useState<(typeof situations)[number]['id']>('unused');
  const [message, setMessage] = useState('');
  return <Screen title="Tools" subtitle="Everything you need to run the demo.">
    <View style={[styles.panel, { backgroundColor: colors.navy }]}><Text style={{ color: 'white', fontSize: 20, fontWeight: '600' }}>{budget.bank?.account.name ?? 'Your demo workspace'}</Text><Text style={{ color: '#DFEDF7', fontSize: 14, lineHeight: 22 }}>{budget.bank ? 'Nessie sandbox connected. Switch the sample customer in the backend, then import again in Connections.' : 'Connect a Nessie sample customer to bring in accounts and purchasing history.'}</Text></View>
    <Text style={styles.heading}>Simulation manager</Text>
    <View style={styles.panel}>
      <Text style={styles.body}>Choose a location and budget situation, then execute. These controls are placeholders and do not change your budget or send anything to a device.</Text>
      <Text style={styles.label}>Location</Text>
      <View style={styles.row}>{locations.map(item => <Choice key={item.id} label={item.label} selected={location === item.id} onPress={() => setLocation(item.id)} />)}</View>
      <Text style={styles.label}>Budget situation</Text>
      <View style={styles.row}>{situations.map(item => <Choice key={item.id} label={item.label} selected={situation === item.id} onPress={() => setSituation(item.id)} />)}</View>
      <Button onPress={() => setMessage('Execute is not wired yet. Nothing was sent to the device and your budget was not changed.')}>Execute</Button>
      <Button secondary onPress={() => { setLocation('restaurant'); setSituation('unused'); setMessage('Reset is not wired yet. Your budget values were not changed.'); }}>Reset to default</Button>
      {!!message && <Text accessibilityLiveRegion="polite" style={styles.notice}>{message}</Text>}
    </View>
    <View style={[styles.panel, { padding: 0, overflow: 'hidden' }]}>{tools.map((tool, index) => <Pressable key={tool.path} accessibilityRole="button" onPress={() => router.navigate(tool.path)} android_ripple={{ color: '#E6F0F7' }} style={{ padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16, borderTopWidth: index ? 1 : 0, borderTopColor: colors.paper }}><Icon name={tool.icon as IconName} /><View style={{ flex: 1, gap: 5 }}><Text style={styles.heading}>{tool.name}</Text><Text style={{ color: colors.muted, lineHeight: 20, fontSize: 14 }}>{tool.description}</Text></View><Icon name="arrow" size={18} color={colors.muted} /></Pressable>)}</View>
    <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 21 }}>Nessie uses sample financial data. Purchase previews update this device’s demo budget; they do not send payments. Simulation manager does not talk to hardware yet.</Text>
  </Screen>;
}
