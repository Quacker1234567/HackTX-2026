import { useState } from 'react';
import { View } from 'react-native';
import { SectionTitle, StackPage } from '../components/design';
import { Button, Field, Group, GroupRow, Notice } from '../components/ui';
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
  return <StackPage>
    <View style={{ gap: 16 }}>
      <SectionTitle>Nessie</SectionTitle>
      <Group>
        <GroupRow>
          <Button disabled={!ready || busy || !firebaseConfigured} onPress={() => run(async () => { const user = await ensureFirebaseUser(); setUid(user.uid); return 'Connection ID ready. Add it to the backend tester allowlist before loading accounts.'; })}>Create connection ID</Button>
        </GroupRow>
        {!!uid && <GroupRow><Notice selectable>Connection ID: {uid}</Notice></GroupRow>}
        <GroupRow>
          <Button disabled={!ready || busy || !firebaseConfigured} onPress={() => run(async () => { const rows = await getNessieAccounts(); setAccounts(rows); return rows.length ? 'Choose an account to import.' : 'No checking or savings accounts found for the configured demo customer.'; })}>Load Nessie accounts</Button>
        </GroupRow>
        {accounts.map((account, index) => <GroupRow key={account.id} last={index === accounts.length - 1 && firebaseConfigured && !message}>
          <Button secondary disabled={busy} onPress={() => run(async () => { const snapshot = await getNessieSnapshot(account.id); importBank(snapshot); return 'Nessie data imported. Open Insights to review history and adjust your budget. Your current budget has not changed.'; })}>{account.name} · {money(account.balanceCents)}</Button>
        </GroupRow>)}
        {!firebaseConfigured && <GroupRow last={!message}><Notice>Add the Firebase web configuration to mobile/.env first. No bank connection is active yet.</Notice></GroupRow>}
        {!!message && <GroupRow last><Notice>{message}</Notice></GroupRow>}
      </Group>
    </View>
    <View style={{ gap: 16 }}>
      <SectionTitle>Firebase</SectionTitle>
      <Group>
        <GroupRow last>
          <Button disabled={!ready || busy || !firebaseConfigured} onPress={() => run(async () => { await saveCloudSnapshot(budget); return 'Budget snapshot saved to Firebase.'; })}>Save cloud snapshot</Button>
        </GroupRow>
      </Group>
    </View>
    <View style={{ gap: 16 }}>
      <SectionTitle>ESP32 over Wi-Fi</SectionTitle>
      <Group>
        <GroupRow>
          <Field label="Device base URL" value={endpoint} onChangeText={setEndpoint} />
        </GroupRow>
        <GroupRow>
          <Field label="Device access token" value={token} onChangeText={setToken} secure />
        </GroupRow>
        <GroupRow last>
          <Button disabled={!ready || busy} onPress={() => run(async () => { await sendToWallet(endpoint, token, walletSnapshot(budget.categories[0])); return `Wallet acknowledged Dining snapshot at ${new Date().toLocaleTimeString()}.`; })}>Send to wallet</Button>
        </GroupRow>
      </Group>
    </View>
  </StackPage>;
}
