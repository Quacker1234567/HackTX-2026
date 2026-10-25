import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ReactNode } from 'react';
export const colors = { navy: '#004977', blue: '#006EB6', red: '#D03027', paper: '#F2F4F7', ink: '#19232D', muted: '#596775', line: '#DFE5EB', white: '#FFFFFF' };
export function Button({ children, onPress, disabled = false, secondary = false }: { children: ReactNode; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, secondary && { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line }, (pressed || disabled) && { opacity: 0.5 }]}><Text style={{ color: secondary ? colors.navy : colors.white, fontWeight: '700', fontSize: 15 }}>{children}</Text></Pressable>;
}
export function Field({ label, value, onChangeText, numeric = false, secure = false }: { label: string; value: string; onChangeText: (s: string) => void; numeric?: boolean; secure?: boolean }) {
  return <View style={{ gap: 8 }}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} keyboardType={numeric ? 'decimal-pad' : 'default'} autoCapitalize="none" secureTextEntry={secure} style={styles.input} /></View>;
}
export const styles = StyleSheet.create({
  page: { padding: 20, gap: 20, width: '100%', maxWidth: 560, alignSelf: 'center', paddingBottom: 130 },
  title: { fontSize: 32, fontWeight: '700', color: colors.ink, letterSpacing: -1 },
  heading: { fontSize: 20, fontWeight: '600', color: colors.ink },
  body: { fontSize: 16, lineHeight: 24, color: colors.muted },
  label: { fontSize: 14, fontWeight: '600', color: colors.ink },
  panel: { backgroundColor: colors.white, borderRadius: 20, padding: 20, gap: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  button: { backgroundColor: colors.blue, borderRadius: 24, paddingHorizontal: 20, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  input: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 14, fontSize: 16, color: colors.ink },
  notice: { color: colors.navy, backgroundColor: '#E4EFF7', padding: 14, borderRadius: 8, lineHeight: 21 },
});
