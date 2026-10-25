import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Budget, commitPurchase, editLimits, seedBudget, Transaction } from '../domain/budget';
import { BankSnapshot, BudgetProposal } from '../domain/banking';

const KEY = 'flow.budget.v1';
const Context = createContext<{
  budget: Budget; ready: boolean; error: string; purchase: (t: Transaction) => void;
  setGoal: (g: Budget['goal']) => void; reset: () => void;
  setLimits: (limits: Record<string, number>) => void;
  importBank: (bank: BankSnapshot) => void; approvePlan: (plan: BudgetProposal) => void;
} | null>(null);

export function BudgetProvider({ children }: { children: React.ReactNode }) {
  const [budget, setBudget] = useState(seedBudget);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    AsyncStorage.getItem(KEY).then(raw => {
      if (raw) {
        const data = JSON.parse(raw);
        if (data.version !== 1 || !Array.isArray(data.categories) || !Array.isArray(data.transactions) || !data.goal) throw new Error('Invalid saved data');
        setBudget(data);
      }
    }).catch(() => setError('Saved demo could not be loaded. Using starter data.')).finally(() => setReady(true));
  }, []);
  useEffect(() => {
    if (ready) AsyncStorage.setItem(KEY, JSON.stringify(budget)).catch(() => setError('Changes could not be saved on this device.'));
  }, [budget, ready]);
  return <Context.Provider value={{ budget, ready, error,
    purchase: t => setBudget(current => commitPurchase(current, t)),
    setLimits: limits => setBudget(editLimits(budget, limits)),
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
