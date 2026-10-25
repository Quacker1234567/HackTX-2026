import type { BankSnapshot, BudgetProposal } from './banking';
export type Category = { id: string; name: string; limit: number; spent: number };
export type Transaction = { id: string; categoryId: string; merchant: string; cents: number; createdAt: string; nessiePurchaseId?: string; accountId?: string };
export type Budget = { version: 1; categories: Category[]; transactions: Transaction[]; goal: { name: string; target: number; saved: number; days: number }; bank?: BankSnapshot; plan?: BudgetProposal };

export const seedBudget = (): Budget => ({
  version: 1,
  categories: [
    { id: 'dining', name: 'Dining', limit: 20000, spent: 15800 },
    { id: 'groceries', name: 'Groceries', limit: 30000, spent: 12500 },
    { id: 'transport', name: 'Transport', limit: 10000, spent: 3500 },
  ],
  transactions: [],
  goal: { name: 'Emergency fund', target: 100000, saved: 25000, days: 90 },
});
export const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
export const displayMoney = (cents: number, hide: boolean) => hide ? '••••' : money(cents);
export function parseMoney(value: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) return null;
  const cents = Math.round(Number(value) * 100);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}
export function commitPurchase(state: Budget, transaction: Transaction): Budget {
  if (state.transactions.some(t => t.id === transaction.id)) return state;
  const category = state.categories.find(c => c.id === transaction.categoryId);
  if (!category || !Number.isSafeInteger(transaction.cents) || transaction.cents <= 0) throw new Error('Enter a valid purchase amount.');
  if (transaction.cents > category.limit - category.spent) throw new Error('This purchase exceeds the category balance. Choose a smaller amount.');
  return { ...state, categories: state.categories.map(c => c.id === category.id ? { ...c, spent: c.spent + transaction.cents } : c), transactions: [transaction, ...state.transactions] };
}
export const dailyGoalReserve = (goal: Budget['goal']) => Math.ceil(Math.max(0, goal.target - goal.saved) / goal.days);
export function editLimits(state: Budget, limits: Record<string, number>): Budget {
  const categories = state.categories.map(category => {
    const limit = limits[category.id];
    if (!Number.isSafeInteger(limit) || limit < category.spent || limit < 0) throw new Error(`${category.name} must cover its ${money(category.spent)} already spent.`);
    return { ...category, limit };
  });
  const total = categories.reduce((sum, category) => sum + category.limit, 0);
  if (!Number.isSafeInteger(total)) throw new Error('Enter smaller budget amounts.');
  if (state.plan && total > state.plan.availableCents) throw new Error('These allocations exceed the funds available after bills and savings.');
  return { ...state, categories };
}
export function reconcileNessiePurchase(state: Budget, transaction: Transaction, snapshot: BankSnapshot | null): Budget {
  if (!transaction.nessiePurchaseId || !Number.isSafeInteger(transaction.cents) || transaction.cents <= 0 || !transaction.accountId || state.bank?.account.id !== transaction.accountId) throw new Error('Reconnect the original Nessie account before applying this receipt.');
  if (snapshot && snapshot.account.id !== transaction.accountId) throw new Error('The refreshed account does not match the purchase.');
  if (state.transactions.some(t => t.nessiePurchaseId === transaction.nessiePurchaseId)) return state;
  const category = state.categories.find(c => c.id === transaction.categoryId);
  if (!category) throw new Error('The original budget category is unavailable. Keep this receipt for review.');
  // A plan approved from a snapshot already containing this expense has reserved it already.
  const alreadyInPlan = state.plan?.snapshotAt === state.bank?.importedAt && state.bank?.purchases.some(p => p.id === transaction.nessiePurchaseId);
  return {
    ...state, bank: snapshot ?? state.bank,
    categories: alreadyInPlan ? state.categories : state.categories.map(c => c.id === category.id ? { ...c, spent: c.spent + transaction.cents } : c),
    transactions: [transaction, ...state.transactions],
  };
}
