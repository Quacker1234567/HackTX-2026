import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';

export const colors = {
  navy: '#004977',
  navyDeep: '#003356',
  blue: '#006EB6',
  red: '#D03027',
  paper: '#EEF1F4',
  ink: '#12202B',
  muted: '#4A5C6A',
  line: '#D5DEE6',
  white: '#FFFFFF',
  well: '#E4EAF0',
  mist: '#E4EFF7',
  onNavy: '#F3F8FC',
  onNavyMuted: '#C5D8E8',
};

export const space = { 4: 4, 8: 8, 12: 12, 16: 16, 20: 20, 24: 24, 32: 32 };
export const radius = { card: 16, control: 12, input: 12, pill: 999, nav: 28, navItem: 23 };
export const motion = { pressScale: 0.96, pressMs: 150, ease: Easing.out(Easing.quad) };

export const shadow = {
  card: Platform.select({
    ios: { shadowColor: '#12202B', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 3 },
    android: { elevation: 2 },
    default: { boxShadow: '0 1px 2px -1px rgba(18,32,43,0.06), 0 2px 4px rgba(18,32,43,0.04)' },
  }),
  nav: Platform.select({
    ios: { shadowColor: '#12202B', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 16 },
    android: { elevation: 8 },
    default: { boxShadow: '0 8px 24px rgba(18,32,43,0.12)' },
  }),
} as const;

const type = {
  title: { fontSize: 34, lineHeight: 40, fontWeight: '700' as const, color: colors.ink, letterSpacing: -0.7, includeFontPadding: false },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: '600' as const, color: colors.ink, letterSpacing: -0.2, includeFontPadding: false },
  rowLead: { fontSize: 20, lineHeight: 24, fontWeight: '700' as const, color: colors.ink, letterSpacing: -0.3, includeFontPadding: false },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' as const, color: colors.muted },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600' as const, color: colors.muted, letterSpacing: 0.1 },
  money: { fontVariant: ['tabular-nums'] as const, includeFontPadding: false, letterSpacing: -0.4 },
};

export function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const apply = (value: boolean) => setReduce(value);
    void AccessibilityInfo.isReduceMotionEnabled().then(apply);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', apply);
    return () => sub.remove();
  }, []);
  return reduce;
}

export function PressScale({ children, onPress, disabled = false, static: isStatic = false, style, accessibilityRole = 'button', accessibilityLabel, accessibilityState, android_ripple }: {
  children: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  static?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityRole?: 'button' | 'tab' | 'switch';
  accessibilityLabel?: string;
  accessibilityState?: { selected?: boolean; checked?: boolean; disabled?: boolean };
  android_ripple?: { color: string; borderless?: boolean };
}) {
  const reduce = useReduceMotion();
  const [scale] = useState(() => new Animated.Value(1));
  const animate = (value: number) => {
    if (disabled || isStatic || reduce) {
      scale.setValue(1);
      return;
    }
    Animated.timing(scale, { toValue: value, duration: motion.pressMs, easing: motion.ease, useNativeDriver: Platform.OS !== 'web' }).start();
  };
  return <Animated.View style={{ transform: [{ scale }] }}>
    <Pressable accessibilityRole={accessibilityRole} accessibilityLabel={accessibilityLabel} accessibilityState={{ ...accessibilityState, disabled }} disabled={disabled} onPress={onPress} onPressIn={() => animate(motion.pressScale)} onPressOut={() => animate(1)} android_ripple={android_ripple} style={style}>
      {children}
    </Pressable>
  </Animated.View>;
}

export function Button({ children, onPress, disabled = false, secondary = false, static: isStatic = false }: { children: ReactNode; onPress: () => void; disabled?: boolean; secondary?: boolean; static?: boolean }) {
  return <PressScale disabled={disabled} static={isStatic} onPress={onPress} android_ripple={{ color: secondary ? colors.well : '#003356' }} style={[styles.button, secondary ? styles.buttonSecondary : styles.buttonPrimary, disabled && { opacity: 0.4 }]}>
    <Text style={[styles.buttonLabel, { color: secondary ? colors.navy : colors.white }]}>{children}</Text>
  </PressScale>;
}

export function Chip({ label, selected, onPress, disabled = false }: { label: string; selected: boolean; onPress: () => void; disabled?: boolean }) {
  return <PressScale accessibilityState={{ selected, disabled }} accessibilityLabel={label} disabled={disabled} onPress={onPress} android_ripple={{ color: colors.well }} style={[styles.chip, selected ? styles.chipSelected : styles.chipIdle, disabled && { opacity: 0.4 }]}>
    <Text style={[styles.chipLabel, { color: selected ? colors.white : colors.navy }]}>{label}</Text>
  </PressScale>;
}

export function Field({ label, value, onChangeText, numeric = false, secure = false }: { label: string; value: string; onChangeText: (s: string) => void; numeric?: boolean; secure?: boolean }) {
  return <View style={{ gap: 8 }}>
    <Text style={styles.label}>{label}</Text>
    <TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} keyboardType={numeric ? 'decimal-pad' : 'default'} autoCapitalize="none" secureTextEntry={secure} style={styles.input} />
  </View>;
}

export function Switch({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  const reduce = useReduceMotion();
  const [offset] = useState(() => new Animated.Value(value ? 1 : 0));
  useEffect(() => {
    if (reduce) {
      offset.setValue(value ? 1 : 0);
      return;
    }
    Animated.timing(offset, { toValue: value ? 1 : 0, duration: motion.pressMs, easing: motion.ease, useNativeDriver: false }).start();
  }, [offset, reduce, value]);
  const translateX = offset.interpolate({ inputRange: [0, 1], outputRange: [0, 20] });
  return <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} accessibilityLabel={label} onPress={() => onChange(!value)} style={styles.switchRow}>
    <Text style={[styles.heading, { flexShrink: 1 }]}>{label}</Text>
    <View style={[styles.switchTrack, { backgroundColor: value ? colors.navy : colors.line }]}>
      <Animated.View style={[styles.switchThumb, { transform: [{ translateX }] }]} />
    </View>
  </Pressable>;
}

export function Money({ children, size = 20, color = colors.ink, weight = '400' }: { children: ReactNode; size?: number; color?: string; weight?: '400' | '600' | '700' }) {
  return <Text style={[type.money, { fontSize: size, lineHeight: Math.round(size * 1.15), color, fontWeight: weight }]}>{children}</Text>;
}

export function Card({ children, style, padded = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  return <View style={[styles.panel, !padded && { padding: 0 }, style]}>{children}</View>;
}

export function NavyFace({ title, children, onPress, accessibilityLabel }: { title: string; children: ReactNode; onPress?: () => void; accessibilityLabel?: string }) {
  const body = <View style={styles.navyFace}>
    <View style={styles.navyHairline} />
    <Text style={styles.navyTitle}>{title}</Text>
    {children}
  </View>;
  if (!onPress) return body;
  return <PressScale accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} onPress={onPress} android_ripple={{ color: colors.navyDeep }}>{body}</PressScale>;
}

export function Group({ children }: { children: ReactNode }) {
  return <View style={styles.group}>{children}</View>;
}

export function GroupRow({ children, onPress, accessibilityLabel, last = false }: { children: ReactNode; onPress?: () => void; accessibilityLabel?: string; last?: boolean }) {
  const row = <View style={[styles.groupRow, !last && styles.groupRowLine]}>{children}</View>;
  if (!onPress) return row;
  return <PressScale accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} android_ripple={{ color: colors.mist }}>{row}</PressScale>;
}

export function AmountRow({ label, children, color }: { label: string; children: ReactNode; color?: string }) {
  return <View style={styles.amountRow}>
    <Text style={[styles.heading, { flexShrink: 1, color: color ?? colors.ink }]}>{label}</Text>
    {children}
  </View>;
}

export function Divider() {
  return <View style={styles.divider} />;
}

export function Notice({ children, tone = 'info', selectable = false }: { children: ReactNode; tone?: 'info' | 'alert'; selectable?: boolean }) {
  return <Text accessibilityRole={tone === 'alert' ? 'alert' : undefined} accessibilityLiveRegion="polite" selectable={selectable} style={[styles.notice, tone === 'alert' && { backgroundColor: '#F8E8E6', color: colors.navyDeep }]}>{children}</Text>;
}

export const styles = StyleSheet.create({
  page: { paddingHorizontal: 20, paddingTop: 8, gap: 28, width: '100%', maxWidth: 560, alignSelf: 'center', paddingBottom: 130 },
  title: type.title,
  heading: type.heading,
  rowLead: type.rowLead,
  body: type.body,
  label: type.label,
  money: type.money,
  panel: { backgroundColor: colors.white, borderRadius: radius.card, padding: 20, gap: 16, ...shadow.card },
  navyFace: { backgroundColor: colors.navy, borderRadius: radius.card, padding: 24, gap: 16, overflow: 'hidden' },
  navyHairline: { width: 28, height: 3, borderRadius: 2, backgroundColor: colors.red },
  navyTitle: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: colors.onNavy, letterSpacing: -0.1 },
  group: { backgroundColor: colors.white, borderRadius: radius.card, overflow: 'hidden', ...shadow.card },
  groupRow: { paddingHorizontal: 20, paddingVertical: 16, gap: 10, minHeight: 56, justifyContent: 'center' },
  groupRowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  amountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  button: { borderRadius: radius.control, paddingHorizontal: 20, paddingVertical: 14, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  buttonPrimary: { backgroundColor: colors.navy },
  buttonSecondary: { backgroundColor: colors.white, borderColor: colors.line },
  buttonLabel: { fontSize: 16, fontWeight: '600', letterSpacing: -0.1 },
  chip: { borderRadius: radius.control, paddingHorizontal: 16, paddingVertical: 12, minHeight: 48, alignItems: 'center', justifyContent: 'center', flexGrow: 1, borderWidth: 1 },
  chipSelected: { backgroundColor: colors.navy, borderColor: colors.navy },
  chipIdle: { backgroundColor: colors.mist, borderColor: 'transparent' },
  chipLabel: { fontSize: 15, fontWeight: '600', letterSpacing: -0.1 },
  input: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: radius.input, paddingHorizontal: 14, paddingVertical: 14, minHeight: 48, fontSize: 16, color: colors.ink },
  notice: { color: colors.navy, backgroundColor: colors.mist, padding: 14, borderRadius: radius.control, lineHeight: 21, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  switchRow: { paddingHorizontal: 20, paddingVertical: 16, minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  switchTrack: { width: 48, height: 28, borderRadius: 14, padding: 3, justifyContent: 'center' },
  switchThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.white, ...Platform.select({ ios: { shadowColor: '#12202B', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.16, shadowRadius: 1.5 }, android: { elevation: 2 }, default: { boxShadow: '0 1px 2px rgba(18,32,43,0.16)' } }) },
  section: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: colors.muted, letterSpacing: 0.2, marginBottom: -6 },
  goalPlate: { backgroundColor: colors.mist, borderRadius: radius.card, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16, overflow: 'hidden' },
  goalCard: { backgroundColor: colors.white, borderRadius: radius.card, padding: 24, width: '100%', maxWidth: 360, aspectRatio: 10 / 9, alignSelf: 'center', alignItems: 'center', overflow: 'hidden', ...shadow.card },
});
