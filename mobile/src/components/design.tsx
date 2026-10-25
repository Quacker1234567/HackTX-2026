import type { ReactNode } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors, radius, styles } from './ui';

export type IconName = 'home' | 'goal' | 'budget' | 'settings' | 'tools' | 'arrow' | 'bank' | 'history' | 'purchase' | 'pencil';

export function Icon({ name, color = colors.navy, size = 24, strokeWidth = 1.8, filled = false }: { name: IconName; color?: string; size?: number; strokeWidth?: number; filled?: boolean }) {
  const stroke = filled ? 0 : strokeWidth;
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? color : 'none'} stroke={filled ? 'none' : color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
    {name === 'home' && (filled ? <Path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-6v-7H10v7H4a1 1 0 0 1-1-1Z" /> : <Path d="m3 10 9-7 9 7v10H15v-7H9v7H3Z" />)}
    {name === 'goal' && (filled ? <><Circle cx="12" cy="12" r="9" /><Circle cx="12" cy="12" r="5" fill={colors.white} /><Circle cx="12" cy="12" r="2" /></> : <><Circle cx="12" cy="12" r="9" /><Circle cx="12" cy="12" r="5" /><Circle cx="12" cy="12" r="1" /></>)}
    {name === 'budget' && (filled ? <><Rect x="5" y="4" width="14" height="17" rx="2" /><Path d="M9 3h6v4H9z" fill={colors.white} /><Path d="M9 12h6M9 16h4" stroke={colors.white} strokeWidth="1.8" /></> : <><Rect x="5" y="4" width="14" height="17" rx="2" /><Path d="M9 3h6v4H9zM9 12h6M9 16h4" /></>)}
    {name === 'settings' && (filled
      ? <Path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1ZM12 15.2A3.2 3.2 0 1 0 12 8.8a3.2 3.2 0 0 0 0 6.4Z" />
      : <><Circle cx="12" cy="12" r="3" /><Path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>)}
    {name === 'tools' && (filled
      ? <><Rect x="3" y="3" width="7" height="7" rx="2" /><Rect x="14" y="3" width="7" height="7" rx="2" /><Rect x="3" y="14" width="7" height="7" rx="2" /><Rect x="14" y="14" width="7" height="7" rx="2" /></>
      : <><Rect x="3" y="3" width="7" height="7" rx="2" /><Rect x="14" y="3" width="7" height="7" rx="2" /><Rect x="3" y="14" width="7" height="7" rx="2" /><Rect x="14" y="14" width="7" height="7" rx="2" /></>)}
    {name === 'arrow' && <Path d="m9 5 7 7-7 7" />}
    {name === 'bank' && <Path d="m3 8 9-5 9 5H3ZM5 11v6m7-6v6m7-6v6M3 21h18M3 18h18" />}
    {name === 'history' && <><Path d="M3 10a9 9 0 1 1 0 5M3 4v6h6M12 7v5l3 2" /></>}
    {name === 'purchase' && <><Path d="M3 4h2l3 12h10l3-9H6M9 20h.01M18 20h.01" /><Circle cx="9" cy="20" r="1" /><Circle cx="18" cy="20" r="1" /></>}
    {name === 'pencil' && <Path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />}
  </Svg>;
}

export function Screen({ title, subtitle, children, mark = true, center = false }: { title: string; subtitle?: string; children: ReactNode; mark?: boolean; center?: boolean }) {
  return <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.paper }}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.page, center && { flexGrow: 1 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12 }}>
        {mark && <View style={{ width: 4, height: 32, borderRadius: 2, backgroundColor: colors.red }} />}
        <Text style={[styles.title, { flex: 1 }]}>{title}</Text>
      </View>
      {!!subtitle && <Text style={styles.body}>{subtitle}</Text>}
      {center ? <View style={{ flexGrow: 1, justifyContent: 'center', width: '100%' }}>{children}</View> : children}
    </ScrollView>
  </SafeAreaView>;
}

export function GoalRing({ value, label, size = 208, children }: { value: number; label: string; size?: number; children: ReactNode }) {
  const stroke = 7;
  const radius = (size - stroke) / 2 - 1;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const track = circumference * 0.8;
  const filled = track * Math.max(0, Math.min(1, value));
  const start = 90 + 36;
  const percent = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return <View accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: percent }} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    <Svg width={size} height={size} style={{ position: 'absolute' }}>
      <Circle cx={center} cy={center} r={radius} stroke={colors.well} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${track} ${circumference - track}`} transform={`rotate(${start} ${center} ${center})`} />
      {filled > 0 && <Circle cx={center} cy={center} r={radius} stroke={colors.navy} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={`${filled} ${circumference - filled}`} transform={`rotate(${start} ${center} ${center})`} />}
    </Svg>
    <View style={{ alignItems: 'center', justifyContent: 'center', gap: 2 }}>{children}</View>
  </View>;
}

export function Progress({ value, label, onNavy = false, fill, flush = false }: { value: number; label: string; onNavy?: boolean; fill?: string; flush?: boolean }) {
  const percent = Math.max(0, Math.min(100, value * 100));
  return <View accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: Math.round(percent) }} style={{ width: '100%', height: flush ? 6 : 4, backgroundColor: onNavy ? colors.navyDeep : colors.well, borderRadius: flush ? 0 : radius.pill, overflow: 'hidden' }}>
    <View style={{ width: `${percent}%`, height: '100%', borderRadius: flush ? 0 : radius.pill, backgroundColor: onNavy ? colors.white : fill ?? colors.blue }} />
  </View>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.section}>{children}</Text>;
}

export function StackPage({ children }: { children: ReactNode }) {
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>{children}</ScrollView>;
}
