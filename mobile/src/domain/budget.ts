import type { BankSnapshot, BudgetProposal } from './banking';
export type Category = { id: string; name: string; limit: number; spent: number };
export type Transaction = { id: string; categoryId: string; merchant: string; cents: number; createdAt: string; nessiePurchaseId?: string; accountId?: string };
export type Goal = { id: string; name: string; target: number; saved: number; days: number; accountId?: string };
export type Budget = { version: 1; categories: Category[]; transactions: Transaction[]; goal: { name: string; target: number; saved: number; days: number }; goals?: Goal[]; studentSavingsLinked?: boolean; bank?: BankSnapshot; plan?: BudgetProposal };

// Upgrade the original single goal without dropping existing targets or history.
// Each bank balance can belong to one goal only; additional goals start unfunded.
export function normalizeGoals(state: Budget): Budget {
  const savings = state.bank?.accounts?.find(a => a.type.toLowerCase() === 'savings' && a.name === 'Flow Student Emergency Savings');
  const existing = state.goals?.length ? state.goals : [{ ...state.goal, id: 'primary', ...(savings ? { name: savings.name, accountId: savings.id } : {}) }];
  const linked = savings && !state.studentSavingsLinked ? existing.map((g, index) => index === 0 ? { ...g, name: savings.name, accountId: savings.id } : g) : existing;
  const goals = linked.map(goal => {
    const account = state.bank?.accounts?.find(a => a.id === goal.accountId);
    return account ? { ...goal, saved: account.balanceCents } : goal;
  });
  return { ...state, goals, goal: goals[0], studentSavingsLinked: state.studentSavingsLinked || !!savings };
}
export function planningGoal(state: Budget) {
  return { ...state.goal, additionalGoals: state.goals?.slice(1) ?? [] };
}

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
// Spending for the current calendar month: imported Nessie purchases plus local
// rehearsal activity, deduplicated by Nessie ID and excluding voided rehearsals.
// Without an imported bank there is nothing to derive from, so the stored demo
// figures stand and UI-only development keeps working.
export function monthSpentByCategory(state: Budget, now = new Date()): Record<string, number> {
  const totals: Record<string, number> = {};
  const add = (categoryId: string, cents: number) => { totals[categoryId] = (totals[categoryId] ?? 0) + cents; };
  if (!state.bank) {
    for (const category of state.categories) add(category.id, category.spent);
    return totals;
  }
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const voided = new Set(state.bank.voidedPurchaseIds ?? []);
  const counted = new Set<string>();
  for (const purchase of state.bank.purchases) {
    if (purchase.status !== 'completed' || !purchase.date || purchase.date.slice(0, 7) !== month) continue;
    if (voided.has(purchase.id) || purchase.cents < 0 || counted.has(purchase.id)) continue;
    counted.add(purchase.id);
    add(purchase.categoryId, purchase.cents);
  }
  for (const transaction of state.transactions) {
    if (transaction.createdAt.slice(0, 7) !== month) continue;
    // A confirmed Flow purchase is already in the imported history, or was released.
    if (transaction.nessiePurchaseId && (counted.has(transaction.nessiePurchaseId) || voided.has(transaction.nessiePurchaseId))) continue;
    add(transaction.categoryId, transaction.cents);
  }
  return totals;
}
export function categoriesWithSpend(state: Budget, now = new Date()): Category[] {
  const spent = monthSpentByCategory(state, now);
  return state.categories.map(category => ({ ...category, spent: spent[category.id] ?? 0 }));
}
export const displayMoney = (cents: number, hide: boolean) => hide ? '••••' : money(cents);
export function applyBudgetPlan(state: Budget, plan: BudgetProposal): Budget {
  if (!plan.canApprove || plan.availableCents < 0) throw new Error('Resolve the proposal warnings first.');
  if (plan.snapshotAt !== state.bank?.importedAt || plan.accountId !== state.bank?.account.id) throw new Error('Bank data changed. Review a new proposal first.');
  return { ...state, plan, categories: plan.allocations.map(c => ({ ...c })) };
}
export function parseMoney(value: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) return null;
  const cents = Math.round(Number(value) * 100);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}
export function commitPurchase(state: Budget, transaction: Transaction): Budget {
  if (state.transactions.some(t => t.id === transaction.id)) return state;
  const category = state.categories.find(c => c.id === transaction.categoryId);
  if (!category || !Number.isSafeInteger(transaction.cents) || transaction.cents <= 0) throw new Error('Enter a valid purchase amount.');
  const spent = monthSpentByCategory(state)[category.id] ?? 0;
  if (transaction.cents > category.limit - spent) throw new Error('This purchase exceeds the category balance. Choose a smaller amount.');
  return { ...state, categories: state.categories.map(c => c.id === category.id ? { ...c, spent: c.spent + transaction.cents } : c), transactions: [transaction, ...state.transactions] };
}
export const dailyGoalReserve = (goal: Budget['goal']) => Math.ceil(Math.max(0, goal.target - goal.saved) / goal.days);
export function editLimits(state: Budget, limits: Record<string, number>): Budget {
  const spent = monthSpentByCategory(state);
  const categories = state.categories.map(category => {
    const limit = limits[category.id];
    const alreadySpent = spent[category.id] ?? 0;
    if (!Number.isSafeInteger(limit) || limit < alreadySpent || limit < 0) throw new Error(`${category.name} must cover its ${money(alreadySpent)} already spent.`);
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
  const next: Budget = {
    ...state, bank: snapshot ?? state.bank,
    categories: alreadyInPlan ? state.categories : state.categories.map(c => c.id === category.id ? { ...c, spent: c.spent + transaction.cents } : c),
    transactions: [transaction, ...state.transactions],
  };
  // A receipt without a matching refresh cannot authorize another purchase.
  if (state.plan && !alreadyInPlan) next.plan = { ...state.plan, snapshotAt: '' };
  // Keep the approved monthly limits through our own verified purchase. A plain
  // bank import still requires review; this exception is limited to a matched
  // receipt, the exact expected debit, and otherwise unchanged planning data.
  const previous = state.bank!;
  const plan = state.plan;
  if (snapshot && plan?.canApprove && plan.accountId === previous.account.id && plan.snapshotAt === previous.importedAt && !snapshot.warnings.length && !snapshot.billReviewRequired) {
    const purchase = snapshot.purchases.find(p => p.id === transaction.nessiePurchaseId);
    const rows = (items: { id: string }[]) => JSON.stringify([...items].sort((a, b) => a.id.localeCompare(b.id)));
    const withoutReceipt = (bank: BankSnapshot) => bank.purchases.filter(p => p.id !== transaction.nessiePurchaseId);
    const savings = (bank: BankSnapshot) => (bank.accounts ?? []).filter(a => a.type === 'Savings').map(a => ({ id: a.id, balanceCents: a.balanceCents }));
    const oldFunds = previous.account.balanceCents - (previous.unreflectedPurchaseCents ?? 0);
    const newFunds = snapshot.account.balanceCents - (snapshot.unreflectedPurchaseCents ?? 0);
    const expectedDebit = previous.purchases.some(p => p.id === transaction.nessiePurchaseId) ? 0 : transaction.cents;
    const currentSpent = monthSpentByCategory(next);
    const remaining = next.categories.reduce((sum, c) => sum + Math.max(0, c.limit - (currentSpent[c.id] ?? 0)), 0);
    const covered = newFunds >= remaining + (plan.billsCents ?? 0) + (plan.savingsCents ?? 0);
    const receiptMatches = purchase?.status === 'completed' && purchase.cents === transaction.cents && purchase.categoryId === transaction.categoryId;
    const historyUnchanged = rows(withoutReceipt(previous)) === rows(withoutReceipt(snapshot)) && rows(previous.deposits) === rows(snapshot.deposits);
    const reservesUnchanged = rows(previous.bills) === rows(snapshot.bills) && rows(savings(previous)) === rows(savings(snapshot));
    const voidsUnchanged = rows((previous.voidedPurchaseIds ?? []).map(id => ({ id }))) === rows((snapshot.voidedPurchaseIds ?? []).map(id => ({ id })));
    if (receiptMatches && covered && Number.isSafeInteger(newFunds) && newFunds === oldFunds - expectedDebit && historyUnchanged && reservesUnchanged && voidsUnchanged) {
      next.plan = { ...plan, snapshotAt: snapshot.importedAt };
    }
  }
  return next;
}
