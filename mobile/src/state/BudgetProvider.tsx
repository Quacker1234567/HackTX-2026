import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Budget, commitPurchase, editLimits, reconcileNessiePurchase, seedBudget, Transaction } from '../domain/budget';
import { BankSnapshot, BudgetProposal } from '../domain/banking';
import { AppSettings, defaultSettings, parseSettings } from '../domain/settings';

const KEY = 'flow.budget.v1';
const SETTINGS_KEY = 'flow.settings.v1';
const Context = createContext<{
  budget: Budget; settings: AppSettings; ready: boolean; error: string; purchase: (t: Transaction) => void;
  setGoal: (g: Budget['goal']) => void; reset: () => void;
  setLimits: (limits: Record<string, number>) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
  importBank: (bank: BankSnapshot) => void; approvePlan: (plan: BudgetProposal) => void;
  applyNessiePurchase: (transaction: Transaction, snapshot: BankSnapshot | null) => Promise<void>;
} | null>(null);

export function BudgetProvider({ children }: { children: React.ReactNode }) {
  const [budget, setBudget] = useState(seedBudget);
  const [settings, setSettings] = useState(defaultSettings);
  const current = useRef(budget);
  const currentSettings = useRef(settings);
  const initialized = useRef(false);
  const persistence = useRef<Promise<void>>(Promise.resolve());
  const settingsPersistence = useRef<Promise<void>>(Promise.resolve());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    Promise.all([AsyncStorage.getItem(KEY), AsyncStorage.getItem(SETTINGS_KEY)]).then(([raw, settingsRaw]) => {
      if (!active) return;
      // Settings are restored first so unreadable budget data cannot discard them.
      if (settingsRaw) { const parsed = parseSettings(JSON.parse(settingsRaw)); currentSettings.current = parsed; setSettings(parsed); }
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.version !== 1 || !Array.isArray(data.categories) || !Array.isArray(data.transactions) || !data.goal) throw new Error('Invalid saved data');
      current.current = data; setBudget(data);
    }).catch(() => { if (active) setError('Saved demo could not be loaded. Using starter data.'); }).finally(() => {
      if (active) { initialized.current = true; setReady(true); }
    });
    return () => { active = false; };
  }, []);
  // Serialize persistence so an older asynchronous write cannot overwrite a newer receipt.
  const change = useCallback((transform: (value: Budget) => Budget) => {
    if (!initialized.current) throw new Error('Wait for your saved budget to load.');
    const next = transform(current.current);
    current.current = next; setBudget(next);
    const saved = persistence.current.catch(() => {}).then(() => AsyncStorage.setItem(KEY, JSON.stringify(next)));
    persistence.current = saved;
    void saved.catch(() => setError('Changes could not be saved on this device.'));
    return saved;
  }, []);
  const applyNessiePurchase = useCallback((transaction: Transaction, snapshot: BankSnapshot | null) => change(value => reconcileNessiePurchase(value, transaction, snapshot)), [change]);
  // Settings use their own key, so their writes are ordered separately from budget writes.
  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    if (!initialized.current) return;
    const next = parseSettings({ ...currentSettings.current, ...patch });
    currentSettings.current = next; setSettings(next);
    const saved = settingsPersistence.current.catch(() => {}).then(() => AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next)));
    settingsPersistence.current = saved;
    void saved.catch(() => setError('Changes could not be saved on this device.'));
  }, []);
  return <Context.Provider value={{ budget, settings, ready, error,
    purchase: t => { void change(value => commitPurchase(value, t)).catch(() => {}); },
    setLimits: limits => { void change(value => editLimits(value, limits)).catch(() => {}); },
    setGoal: goal => { void change(value => ({ ...value, goal })).catch(() => {}); },
    reset: () => { void change(seedBudget).catch(() => {}); },
    importBank: bank => { void change(value => ({ ...value, bank })).catch(() => {}); },
    updateSettings,
    approvePlan: plan => {
      if (!plan.canApprove || plan.availableCents < 0) throw new Error('Resolve the proposal warnings first.');
      void change(value => {
        if (plan.snapshotAt !== value.bank?.importedAt || plan.accountId !== value.bank?.account.id) throw new Error('Bank data changed. Review a new proposal first.');
        return { ...value, plan, categories: plan.allocations.map(c => ({ ...c })), transactions: [] };
      }).catch(() => {});
    },
    applyNessiePurchase,
  }}>{children}</Context.Provider>;
}
export function useBudget() {
  const value = useContext(Context);
  if (!value) throw new Error('BudgetProvider missing');
  return value;
}
