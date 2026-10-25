import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors, styles } from './ui';

export type IconName = 'home' | 'goal' | 'budget' | 'tools' | 'arrow' | 'bank' | 'history' | 'purchase' | 'pencil';
export function Icon({ name, color = colors.blue, size = 24, strokeWidth = 1.8 }: { name: IconName; color?: string; size?: number; strokeWidth?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    {name === 'home' && <Path d="m3 10 9-7 9 7v10H15v-7H9v7H3Z" />}
    {name === 'goal' && <><Circle cx="12" cy="12" r="9" /><Circle cx="12" cy="12" r="5" /><Circle cx="12" cy="12" r="1" /></>}
    {name === 'budget' && <><Rect x="5" y="4" width="14" height="17" rx="2" /><Path d="M9 3h6v4H9zM9 12h6M9 16h4" /></>}
    {name === 'tools' && <><Rect x="3" y="3" width="7" height="7" rx="2" /><Rect x="14" y="3" width="7" height="7" rx="2" /><Rect x="3" y="14" width="7" height="7" rx="2" /><Rect x="14" y="14" width="7" height="7" rx="2" /></>}
    {name === 'arrow' && <Path d="m9 5 7 7-7 7" />}
    {name === 'bank' && <Path d="m3 8 9-5 9 5H3ZM5 11v6m7-6v6m7-6v6M3 21h18M3 18h18" />}
    {name === 'history' && <><Path d="M3 10a9 9 0 1 1 0 5M3 4v6h6M12 7v5l3 2" /></>}
    {name === 'purchase' && <><Path d="M3 4h2l3 12h10l3-9H6M9 20h.01M18 20h.01" /><Circle cx="9" cy="20" r="1" /><Circle cx="18" cy="20" r="1" /></>}
    {name === 'pencil' && <Path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />}
  </Svg>;
}
export function Screen({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.paper }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
    <View style={{ gap: 6, paddingTop: 12, paddingBottom: 4 }}><Text style={styles.title}>{title}</Text>{subtitle && <Text style={styles.body}>{subtitle}</Text>}</View>{children}
  </ScrollView></SafeAreaView>;
}
export function Progress({ value, label }: { value: number; label: string }) {
  const percent = Math.max(0, Math.min(100, value * 100));
  return <View accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: Math.round(percent) }} style={{ height: 7, backgroundColor: '#E7EDF3', borderRadius: 8, overflow: 'hidden' }}><View style={{ width: `${percent}%`, height: '100%', borderRadius: 8, backgroundColor: colors.blue }} /></View>;
}
