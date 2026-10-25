import { router, Tabs, usePathname } from 'expo-router';
import { Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { NavigationBar as SystemNavigationBar } from 'expo-navigation-bar';
import { BudgetProvider } from '../state/BudgetProvider';
import { colors } from '../components/ui';
import { Icon, IconName } from '../components/design';

const destinations = [
  { path: '/', label: 'Home', icon: 'home' },
  { path: '/goals', label: 'Goal', icon: 'goal' },
  { path: '/budget', label: 'Budget', icon: 'budget' },
  { path: '/tools', label: 'Tools', icon: 'tools' },
] as const;
function Navigation() {
  const path = usePathname();
  const insets = useSafeAreaInsets();
  const active = destinations.some(d => d.path === path) ? path : '/tools';
  return <View pointerEvents="box-none" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingBottom: Math.max(insets.bottom, 12), paddingHorizontal: 20 }}>
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', width: '100%', maxWidth: 420, alignSelf: 'center', padding: 5, borderRadius: 28, backgroundColor: '#E3E8EE', borderColor: '#D5DDE5', borderWidth: 1, elevation: 4 }}>
      {destinations.map(d => <Pressable key={d.path} accessibilityRole="tab" accessibilityState={{ selected: active === d.path }} accessibilityLabel={d.label} android_ripple={{ color: '#CDDDEA', borderless: false }} onPress={() => router.navigate(d.path)} style={{ flex: 1, minHeight: 58, borderRadius: 23, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: 3, backgroundColor: active === d.path ? colors.white : 'transparent' }}>
        <Icon name={d.icon as IconName} color={active === d.path ? colors.blue : colors.muted} /><Text style={{ fontSize: 12, fontWeight: active === d.path ? '700' : '500', color: active === d.path ? colors.blue : colors.muted }}>{d.label}</Text>
      </Pressable>)}
    </View>
  </View>;
}
export default function Layout() {
  return <BudgetProvider><StatusBar style="dark" />{Platform.OS === 'android' && <SystemNavigationBar hidden style="dark" />}<Tabs tabBar={() => <Navigation />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.paper }, headerTintColor: colors.navy, headerStyle: { backgroundColor: colors.paper } }}>
    <Tabs.Screen name="index" options={{ title: 'Home' }} />
    <Tabs.Screen name="goals" options={{ title: 'Goal' }} />
    <Tabs.Screen name="budget" options={{ title: 'Budget' }} />
    <Tabs.Screen name="tools" options={{ title: 'Tools' }} />
    {(['banking', 'connections', 'checkout', 'transactions'] as const).map(name => <Tabs.Screen key={name} name={name} options={{ headerShown: true, title: name === 'checkout' ? 'Test a purchase' : name.charAt(0).toUpperCase() + name.slice(1), headerLeft: () => <Pressable accessibilityRole="button" accessibilityLabel="Back to Tools" onPress={() => router.navigate('/tools')} style={{ padding: 16 }}><Text style={{ color: colors.blue }}>‹ Tools</Text></Pressable> }} />)}
  </Tabs></BudgetProvider>;
}

