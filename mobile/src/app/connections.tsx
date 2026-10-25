import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { SectionTitle, StackPage } from '../components/design';
import { Button, Group, GroupRow, Notice, styles } from '../components/ui';
import { useBudget } from '../state/BudgetProvider';
import { ensureFirebaseUser, firebaseConfigured, saveCloudSnapshot } from '../services/firebase';
import { getNessieAccounts, getNessieSnapshot } from '../services/banking';
import { BankAccount } from '../domain/banking';
import { money } from '../domain/budget';
import { useHardwareWallet } from '../state/HardwareWalletProvider';
import { walletDatabaseUrl, walletDeviceId } from '../services/firebaseWallet';
import { firebaseWalletBudget, walletPlanReady, WALLET_CARD } from '../domain/hardware';

export default function Connections() {
  const { budget, ready, importBank } = useBudget();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [uid, setUid] = useState('');
  const wallet = useHardwareWallet();
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    if (!wallet.connected) return;
    const timer = setInterval(() => setClock(Date.now()), 10000);
    return () => clearInterval(timer);
  }, [wallet.connected]);
  const deviceOnline = !!wallet.status?.last_seen && clock - wallet.status.last_seen < 45000 && clock - wallet.status.last_seen >= -5000;
  const cardReady = firebaseWalletBudget(budget).cards.length > 0;
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
      <SectionTitle>Firebase wallet</SectionTitle>
      <Group>
        <GroupRow>
          <Text style={styles.heading}>{walletDeviceId}</Text>
          <Text style={styles.body}>{wallet.connected ? deviceOnline ? 'Device online' : 'Connected to Firebase · waiting for device' : 'Disconnected'}</Text>
          <Text style={styles.body}>{WALLET_CARD.uid} · Dining · {money(WALLET_CARD.amount_cents)}</Text>
          {wallet.connected && !cardReady && <Text style={styles.body}>{walletPlanReady(budget) ? 'NFC paused: Dining has less than $12 left.' : 'NFC paused: apply your budget in Insights.'}</Text>}
        </GroupRow>
        <GroupRow>
          {wallet.connected ? <Button secondary disabled={wallet.busy} onPress={wallet.disconnect}>Disconnect wallet</Button> : <Button disabled={!ready || wallet.busy || !walletDatabaseUrl} onPress={() => void wallet.connect()}>{wallet.busy ? 'Connecting…' : 'Connect wallet'}</Button>}
        </GroupRow>
        <GroupRow last>
          <Button disabled={!wallet.connected || wallet.busy} onPress={() => void wallet.sync()}>Send budget</Button>
          <Button secondary disabled={!wallet.connected || wallet.busy} onPress={() => void wallet.retry()}>Retry saved wallet purchase</Button>
          {!!wallet.message && <Notice>{wallet.message}</Notice>}
        </GroupRow>
      </Group>
    </View>
  </StackPage>;
}
