import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Screen, Icon, IconName } from '../components/design';
import { colors, styles } from '../components/ui';
import { useBudget } from '../state/BudgetProvider';

const tools = [
  { path: '/banking', name: 'Banking', description: 'Accounts, spending patterns and budget plans', icon: 'bank' },
  { path: '/connections', name: 'Connections', description: 'Nessie import, Firebase and ESP32 display', icon: 'tools' },
  { path: '/checkout', name: 'Test a purchase', description: 'Simulate a location, preview and confirm spending', icon: 'purchase' },
  { path: '/nessie-purchase', name: 'Nessie purchase', description: 'Create a sandbox transaction and refresh bank history', icon: 'purchase' },
  { path: '/transactions', name: 'Transaction history', description: 'Imported purchases, income and local demo activity', icon: 'history' },
] as const;
export default function Tools() {
  const { budget } = useBudget();
  return <Screen title="Tools" subtitle="Everything you need to run the demo.">
    <View style={[styles.panel, { backgroundColor: colors.navy }]}><Text style={{ color: 'white', fontSize: 20, fontWeight: '600' }}>{budget.bank?.account.name ?? 'Your demo workspace'}</Text><Text style={{ color: '#DFEDF7', fontSize: 14, lineHeight: 22 }}>{budget.bank ? 'Nessie sandbox connected. Switch the sample customer in the backend, then import again in Connections.' : 'Connect a Nessie sample customer to bring in accounts and purchasing history.'}</Text></View>
    <View style={[styles.panel, { padding: 0, overflow: 'hidden' }]}>{tools.map((tool, index) => <Pressable key={tool.path} accessibilityRole="button" onPress={() => router.navigate(tool.path)} android_ripple={{ color: '#E6F0F7' }} style={{ padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16, borderTopWidth: index ? 1 : 0, borderTopColor: colors.paper }}><Icon name={tool.icon as IconName} /><View style={{ flex: 1, gap: 5 }}><Text style={styles.heading}>{tool.name}</Text><Text style={{ color: colors.muted, lineHeight: 20, fontSize: 14 }}>{tool.description}</Text></View><Icon name="arrow" size={18} color={colors.muted} /></Pressable>)}</View>
    <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 21 }}>Nessie uses sample financial data. Test a purchase changes local state only; Nessie purchase writes a sandbox transaction. Neither sends real payments.</Text>
  </Screen>;
}
