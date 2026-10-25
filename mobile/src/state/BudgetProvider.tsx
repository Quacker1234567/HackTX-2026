import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Budget, commitPurchase, editLimits, seedBudget, Transaction } from '../domain/budget';
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
} | null>(null);

export function BudgetProvider({ children }: { children: React.ReactNode }) {
  const [budget, setBudget] = useState(seedBudget);
  const [settings, setSettings] = useState(defaultSettings);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    Promise.all([AsyncStorage.getItem(KEY), AsyncStorage.getItem(SETTINGS_KEY)]).then(([raw, settingsRaw]) => {
      if (raw) {
        const data = JSON.parse(raw);
        if (data.version !== 1 || !Array.isArray(data.categories) || !Array.isArray(data.transactions) || !data.goal) throw new Error('Invalid saved data');
        setBudget(data);
      }
      if (settingsRaw) setSettings(parseSettings(JSON.parse(settingsRaw)));
    }).catch(() => setError('Saved demo could not be loaded. Using starter data.')).finally(() => setReady(true));
  }, []);
  useEffect(() => {
    if (ready) AsyncStorage.setItem(KEY, JSON.stringify(budget)).catch(() => setError('Changes could not be saved on this device.'));
  }, [budget, ready]);
  useEffect(() => {
    if (ready) AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)).catch(() => setError('Changes could not be saved on this device.'));
  }, [settings, ready]);
  return <Context.Provider value={{ budget, settings, ready, error,
    purchase: t => setBudget(current => commitPurchase(current, t)),
    setLimits: limits => setBudget(editLimits(budget, limits)),
    updateSettings: patch => setSettings(current => parseSettings({ ...current, ...patch })),
    setGoal: goal => setBudget(current => ({ ...current, goal })), reset: () => setBudget(seedBudget()),
    importBank: bank => setBudget(current => ({ ...current, bank })),
    approvePlan: plan => {
      if (!plan.canApprove || plan.availableCents < 0) throw new Error('Resolve the proposal warnings first.');
      setBudget(current => {
        if (plan.snapshotAt !== current.bank?.importedAt || plan.accountId !== current.bank?.account.id) return current;
        return { ...current, plan, categories: plan.allocations.map(c => ({ ...c })), transactions: [] };
      });
    },
  }}>{children}</Context.Provider>;
}
export function useBudget() {
  const value = useContext(Context);
  if (!value) throw new Error('BudgetProvider missing');
  return value;
}
