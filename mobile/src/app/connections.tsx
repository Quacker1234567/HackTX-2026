import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Button, Field, styles } from '../components/ui';
import { useBudget } from '../state/BudgetProvider';
import { ensureFirebaseUser, firebaseConfigured, saveCloudSnapshot } from '../services/firebase';
import { getNessieAccounts, getNessieSnapshot } from '../services/banking';
import { BankAccount } from '../domain/banking';
import { money } from '../domain/budget';
import { sendToWallet, walletSnapshot } from '../services/wallet';

export default function Connections() {
  const { budget, ready, importBank } = useBudget();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [uid, setUid] = useState('');
  const [endpoint, setEndpoint] = useState('http://192.168.1.100');
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<string>) {
    setBusy(true); setMessage('Connecting…');
    try { setMessage(await action()); } catch (e) { setMessage(e instanceof Error ? e.message : 'Connection failed. Check your settings.'); } finally { setBusy(false); }
  }
  return <ScrollView contentContainerStyle={styles.page}>
    <Text style={styles.title}>From app to wallet.</Text>
    <View style={styles.panel}>
      <Text style={styles.heading}>Connect Nessie</Text>
      <Text style={styles.body}>Import mock account balances, purchases, income, bills, and merchant locations through Firebase. Your Nessie key stays in the backend.</Text>
      <Button disabled={!ready || busy || !firebaseConfigured} onPress={() => run(async () => { const user = await ensureFirebaseUser(); setUid(user.uid); return 'Connection ID ready. Add it to the backend tester allowlist before loading accounts.'; })}>Create connection ID</Button>
      {!!message && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" selectable style={styles.notice}>{message}</Text>}
      {!!uid && <Text selectable style={styles.notice}>Connection ID: {uid}</Text>}
      <Button disabled={!ready || busy || !firebaseConfigured} onPress={() => run(async () => { const rows = await getNessieAccounts(); setAccounts(rows); return rows.length ? 'Choose an account to import.' : 'No checking or savings accounts found for the configured demo customer.'; })}>Load Nessie accounts</Button>
      {accounts.map(account => <Button key={account.id} secondary disabled={busy} onPress={() => run(async () => { const snapshot = await getNessieSnapshot(account.id); importBank(snapshot); return 'Nessie data imported. Open Banking to review history and a proposed budget. Your current budget has not changed.'; })}>{account.name} · {money(account.balanceCents)}</Button>)}
      {!!budget.bank && <Text style={styles.body}>Last import: {new Date(budget.bank.importedAt).toLocaleString()} · {budget.bank.account.name}</Text>}
      {!firebaseConfigured && <Text style={styles.notice}>Add the Firebase web configuration to mobile/.env first. No bank connection is active yet.</Text>}
    </View>
    <View style={styles.panel}><Text style={styles.heading}>Firebase</Text><Text style={styles.body}>{firebaseConfigured ? 'Configuration detected. Enable anonymous sign-in and deploy Firestore rules before saving.' : 'Add your Firebase web app configuration to mobile/.env to enable cloud snapshots.'}</Text><Button disabled={!ready || busy || !firebaseConfigured} onPress={() => run(async () => { await saveCloudSnapshot(budget); return 'Budget snapshot saved to Firebase.'; })}>Save cloud snapshot</Button></View>
    <View style={styles.panel}><Text style={styles.heading}>ESP32 over Wi-Fi</Text><Text style={styles.body}>Use the same network as your device. Send the current Dining budget to firmware implementing the documented /budget endpoint.</Text><Field label="Device base URL" value={endpoint} onChangeText={setEndpoint} /><Field label="Device access token (optional for local demo)" value={token} onChangeText={setToken} secure /><Button disabled={!ready || busy} onPress={() => run(async () => { await sendToWallet(endpoint, token, walletSnapshot(budget.categories[0])); return `Wallet acknowledged Dining snapshot at ${new Date().toLocaleTimeString()}.`; })}>Send to wallet</Button></View>
  </ScrollView>;
}
