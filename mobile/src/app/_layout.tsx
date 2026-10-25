import { router, Tabs, usePathname } from 'expo-router';
import { Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { NavigationBar as SystemNavigationBar } from 'expo-navigation-bar';
import { BudgetProvider } from '../state/BudgetProvider';
import { colors, PressScale, radius, shadow } from '../components/ui';
import { Icon, IconName } from '../components/design';

const destinations = [
  { path: '/', label: 'Home', icon: 'home' },
  { path: '/goals', label: 'Goals', icon: 'goal' },
  { path: '/budget', label: 'Budget', icon: 'budget' },
  { path: '/insights', label: 'Insights', icon: 'history' },
  { path: '/tools', label: 'Tools', icon: 'tools' },
] as const;

function Navigation() {
  const path = usePathname();
  const insets = useSafeAreaInsets();
  const active = destinations.some(d => d.path === path) ? path : path === '/transactions' ? '/insights' : '/tools';
  return <View pointerEvents="box-none" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingBottom: Math.max(insets.bottom, 12), paddingHorizontal: 16 }}>
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', width: '100%', maxWidth: 420, alignSelf: 'center', padding: 5, borderRadius: radius.nav, backgroundColor: colors.white, borderWidth: 1, borderColor: 'transparent', ...shadow.nav }}>
      {destinations.map(d => {
        const selected = active === d.path;
        return <Pressable key={d.path} accessibilityRole="tab" accessibilityState={{ selected }} accessibilityLabel={d.label} android_ripple={{ color: colors.mist, borderless: false }} onPress={() => router.navigate(d.path)} style={{ flex: 1, minHeight: 58, borderRadius: radius.navItem, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: 3, backgroundColor: selected ? colors.navy : 'transparent' }}>
          <Icon name={d.icon as IconName} size={22} color={selected ? colors.white : colors.muted} strokeWidth={selected ? 2.2 : 1.6} filled={selected} />
          <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: selected ? '700' : '500', color: selected ? colors.white : colors.muted }}>{d.label}</Text>
        </Pressable>;
      })}
    </View>
  </View>;
}

export default function Layout() {
  return <BudgetProvider>
    <StatusBar style="dark" />
    {Platform.OS === 'android' && <SystemNavigationBar hidden style="dark" />}
    <Tabs tabBar={() => <Navigation />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.paper }, headerTintColor: colors.navy, headerStyle: { backgroundColor: colors.paper }, headerShadowVisible: false, headerTitleStyle: { color: colors.ink, fontWeight: '600', fontSize: 17 } }}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="goals" options={{ title: 'Goals' }} />
      <Tabs.Screen name="budget" options={{ title: 'Budget' }} />
      <Tabs.Screen name="insights" options={{ title: 'Insights' }} />
      <Tabs.Screen name="tools" options={{ title: 'Tools' }} />
      {(['banking', 'connections', 'checkout', 'transactions', 'settings'] as const).map(name => <Tabs.Screen key={name} name={name} options={{
        headerShown: true,
        headerTitle: ({ children }) => <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><View style={{ width: 4, height: 24, borderRadius: 2, backgroundColor: colors.red }} /><Text style={{ color: colors.ink, fontWeight: '600', fontSize: 17 }}>{children}</Text></View>,
        title: name === 'checkout' ? 'Test a purchase' : name.charAt(0).toUpperCase() + name.slice(1),
        headerLeft: () => <PressScale accessibilityRole="button" accessibilityLabel="Back to Tools" onPress={() => router.navigate('/tools')} style={{ paddingHorizontal: 14, paddingVertical: 10, minHeight: 48, justifyContent: 'center' }}>
          <Text style={{ color: colors.navy, fontWeight: '600', fontSize: 16 }}>Tools</Text>
        </PressScale>,
      }} />)}
    </Tabs>
  </BudgetProvider>;
}
