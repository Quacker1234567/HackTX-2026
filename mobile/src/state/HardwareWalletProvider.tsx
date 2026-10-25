import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { connectFirebaseWallet, type WalletStatus } from '../services/firebaseWallet';
import { useBudget } from './BudgetProvider';

type Bridge = Awaited<ReturnType<typeof connectFirebaseWallet>>;
const Context = createContext<{
  connected: boolean; busy: boolean; message: string; status: WalletStatus | null;
  connect: () => Promise<void>; disconnect: () => void; sync: () => Promise<void>; retry: () => Promise<void>;
} | null>(null);
export function HardwareWalletProvider({ children }: { children: ReactNode }) {
  const { budget, applyNessiePurchase, getBudgetSnapshot } = useBudget();
  const bridge = useRef<Bridge | null>(null);
  const connecting = useRef(false);
  const generation = useRef(0);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<WalletStatus | null>(null);
  useEffect(() => {
    if (bridge.current) void bridge.current.sync().catch(e => setMessage(e instanceof Error ? e.message : 'Could not update wallet.'));
  }, [budget]);
  const disconnect = useCallback(() => {
    generation.current++;
    bridge.current?.stop(); bridge.current = null;
    setConnected(false); setStatus(null);
  }, []);
  useEffect(() => () => { generation.current++; bridge.current?.stop(); }, []);
  async function connect() {
    if (connecting.current || bridge.current) return;
    connecting.current = true; setBusy(true); setMessage('Connecting…');
    const current = ++generation.current;
    try {
      const next = await connectFirebaseWallet({ getBudget: getBudgetSnapshot, apply: applyNessiePurchase, onStatus: value => { if (generation.current === current) setStatus(value); }, onMessage: text => { if (generation.current === current) setMessage(text); } });
      if (generation.current !== current) { next.stop(); return; }
      bridge.current = next; setConnected(true); setMessage('Wallet connected.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not connect wallet.'); }
    finally { connecting.current = false; setBusy(false); }
  }
  async function run(action: 'sync' | 'retry') {
    if (!bridge.current || busy) return;
    setBusy(true);
    try { await bridge.current[action](); setMessage(action === 'retry' ? 'Saved wallet purchases checked.' : 'Budget sent.'); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Wallet request failed.'); }
    finally { setBusy(false); }
  }
  return <Context.Provider value={{ connected, busy, message, status, connect, disconnect, sync: () => run('sync'), retry: () => run('retry') }}>{children}</Context.Provider>;
}
export function useHardwareWallet() {
  const value = useContext(Context);
  if (!value) throw new Error('Hardware wallet provider missing.');
  return value;
}
