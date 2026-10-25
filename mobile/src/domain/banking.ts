export type BankAccount = { id: string; name: string; type: string; balanceCents: number };
export type BankPurchase = { id: string; cents: number; date: string | null; status: string; merchantId: string; merchant: string; categoryId: string };
export type BankSnapshot = {
  source: 'nessie'; importedAt: string; account: BankAccount;
  // Related owned balances provide context; only the selected account funds this plan.
  accounts?: BankAccount[];
  purchases: BankPurchase[];
  deposits: { id: string; cents: number; date: string | null; status: string; description: string }[];
  bills: { id: string; cents: number; date: string | null; status: string; payee: string }[];
  merchants: { id: string; name: string; categoryId: string; location: { latitude: number; longitude: number } | null }[];
  warnings: string[];
  billSource?: 'nessie' | 'manual';
  billReviewRequired?: boolean;
  unreflectedPurchaseCents?: number;
  // Flow purchases reviewed as rehearsal data: kept in Nessie, excluded from pacing.
  voidedPurchaseIds?: string[];
  // Verified Flow purchases still awaiting review, for the reconciliation list.
  flowDebits?: { purchaseId: string; amountCents: number; date: string | null }[];
};
export type Preferences = { diningReduction: number; protectedCategory: string; reductions?: Record<string, number> };
export const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
export const monthLabel = (date: Date) => date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
// Budgets run over a calendar month so that limits and month-to-date spending
// cover the same window, and the period resets on its own.
export function monthBounds(now: Date) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 12);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 12);
  return { start: dayKey(start), end: dayKey(end), days: end.getDate(), label: monthLabel(start) };
}
export type BudgetProposal = {
  preferences?: Preferences;
  snapshotAt: string; accountId: string; periodStart: string; periodEnd: string; periodLabel: string; days: number;
  balanceCents: number; billsCents: number; savingsCents: number; availableCents: number; unallocatedCents: number;
  allocations: { id: string; name: string; limit: number; spent: number }[];
  warnings: string[]; canApprove: boolean;
};
export const categoryNames: Record<string, string> = { dining: 'Dining', groceries: 'Groceries', transport: 'Transport', other: 'Other' };
export function confirmManualBills(bank: BankSnapshot, bills: BankSnapshot['bills']): BankSnapshot {
  if (bills.some(b => !validDate(b.date ?? '') || !Number.isSafeInteger(b.cents) || b.cents <= 0 || !b.payee.trim())) throw new Error('Each bill needs a name, date, and positive amount.');
  return { ...bank, bills: bills.map(b => ({ ...b })), billSource: 'manual', billReviewRequired: false, warnings: bank.warnings.filter(w => !w.startsWith('Nessie bills could not be imported.')) };
}
export const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export function validDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const value = new Date(`${date}T12:00:00`);
  return !Number.isNaN(value.getTime()) && dayKey(value) === date;
}
const total = (items: { cents: number }[]) => items.reduce((sum, item) => sum + item.cents, 0);
const unique = <T extends { id: string }>(items: T[]) => [...new Map(items.map(item => [item.id, item])).values()];
export function analyzeHistory(bank: BankSnapshot, now = new Date()) {
  const today = dayKey(now);
  const start = new Date(`${today}T12:00:00`); start.setDate(start.getDate() - 89);
  const from = dayKey(start);
  // Rehearsal purchases stay visible in history but must not teach category pacing.
  const voided = new Set(bank.voidedPurchaseIds ?? []);
  const settled = unique(bank.purchases).filter(p => p.status === 'completed' && p.date && p.date >= from && p.date <= today && p.cents >= 0 && !voided.has(p.id));
  const byCategory = Object.keys(categoryNames).map(id => ({ id, cents: total(settled.filter(p => p.categoryId === id)) }));
  const weekdays = Array.from({ length: 7 }, () => ({ cents: 0, days: 0 }));
  for (let i = 0; i < 90; i++) { const d = new Date(start); d.setDate(d.getDate() + i); weekdays[d.getDay()].days++; }
  for (const p of settled) weekdays[new Date(`${p.date}T12:00:00`).getDay()].cents += p.cents;
  const income = unique(bank.deposits).filter(d => d.status === 'completed' && d.date && d.date >= from && d.date <= today && d.cents >= 0);
  const dates = [...new Set(income.map(d => d.date!))].sort();
  const gaps = dates.slice(1).map((d, i) => Math.round((Date.parse(d) - Date.parse(dates[i])) / 86400000)).sort((a, b) => a - b);
  return {
    count: settled.length, totalCents: total(settled), byCategory, incomeCents: total(income), incomeCount: income.length,
    estimatedPaydayGap: gaps.length >= 2 ? gaps[Math.floor(gaps.length / 2)] : null,
    weekdays: weekdays.map((d, day) => ({ day, averageCents: Math.round(d.cents / d.days) })),
    ignoredCount: unique(bank.purchases).length - settled.length,
  };
}
export function proposeBudget(bank: BankSnapshot, goal: { target: number; saved: number; days: number; additionalGoals?: { target: number; saved: number; days: number }[] }, preferences: Preferences, now = new Date()): BudgetProposal {
  const today = dayKey(now);
  const period = monthBounds(now);
  const days = period.days;
  const warnings = [...bank.warnings];
  if (bank.billReviewRequired && !warnings.some(w => w.startsWith('Nessie bills could not be imported.'))) warnings.push('Review and confirm the complete bill list before approving a budget.');
  const reduction = Number.isFinite(preferences.diningReduction) ? Math.max(0, Math.min(100, preferences.diningReduction)) : 0;
  if (!Number.isInteger(preferences.diningReduction) || preferences.diningReduction < 0 || preferences.diningReduction > 100) warnings.push('Dining reduction must be a whole percentage from 0 to 100.');
  for (const id of Object.keys(categoryNames)) {
    const value = preferences.reductions?.[id] ?? 0;
    if (!Number.isInteger(value) || value < 0 || value > 100) warnings.push(`${categoryNames[id]} reduction must be a whole percentage from 0 to 100.`);
  }
  const activeBills = unique(bank.bills).filter(b => ['pending', 'recurring'].includes(b.status));
  if (activeBills.some(b => !b.date || b.date < today)) warnings.push('Some active bills have missing or past dates. Update those bills in Nessie before approving.');
  // Only bills still to be paid in this month are reserved.
  const billsCents = total(activeBills.filter(b => b.date && b.date >= today && b.date <= period.end));
  const savingsCents = [goal, ...(goal.additionalGoals ?? [])].reduce((sum, item) => sum + (item.days > 0 ? Math.min(Math.max(0, item.target - item.saved), Math.ceil(Math.max(0, item.target - item.saved) * Math.max(0, days) / item.days)) : 0), 0);
  const unreflected = bank.unreflectedPurchaseCents ?? 0;
  if (!Number.isSafeInteger(unreflected) || unreflected < 0) warnings.push('The purchase reserve is invalid. Refresh bank data before approving.');
  const availableCents = bank.account.balanceCents - (Number.isSafeInteger(unreflected) && unreflected >= 0 ? unreflected : 0) - billsCents - savingsCents;
  if (availableCents < 0) warnings.push('The account balance cannot cover bills and the requested savings pace. Adjust the goal.');
  const history = analyzeHistory(bank, now);
  if (history.count < 5) warnings.push('Import at least five completed purchases from the last 90 days before generating a history-based plan.');
  const needs = history.byCategory.map(c => {
    // Explicit category settings also apply to the priority category. Priority
    // determines funding order only; it must not silently cancel a user's cut.
    const cut = preferences.reductions ? preferences.reductions[c.id] ?? 0 : c.id === 'dining' && preferences.protectedCategory !== 'dining' ? reduction : 0;
    const safeCut = Number.isFinite(cut) ? Math.max(0, Math.min(100, cut)) : 0;
    return { ...c, cents: Math.ceil(c.cents * Math.max(0, days) / 90 * (1 - safeCut / 100)) };
  });
  const protectedAmount = needs.find(n => n.id === preferences.protectedCategory)?.cents ?? 0;
  if (protectedAmount > availableCents) warnings.push('Available funds cannot protect the selected category at its historical pace.');
  const available = Math.max(0, availableCents);
  const protectedReserve = Math.min(available, protectedAmount);
  const others = needs.filter(n => n.id !== preferences.protectedCategory);
  const denominator = total(others);
  const free = available - protectedReserve;
  // Historical pace is a ceiling, not a target. Funds beyond it stay unallocated
  // rather than inflating every category or silently collecting in Other.
  const constrained = denominator > 0 && free < denominator;
  const scale = constrained ? free / denominator : 1;
  const allocations = needs.map(n => ({ id: n.id, name: categoryNames[n.id], spent: 0, limit: n.id === preferences.protectedCategory ? protectedReserve : Math.floor(n.cents * scale) }));
  const assigned = () => allocations.reduce((sum, c) => sum + c.limit, 0);
  // Only the rounding dust left by scaling down belongs in a category.
  if (constrained) allocations.find(c => c.id === 'other')!.limit += available - assigned();
  const unallocatedCents = available - assigned();
  return { preferences: { ...preferences, reductions: preferences.reductions ? { ...preferences.reductions } : undefined }, snapshotAt: bank.importedAt, accountId: bank.account.id, periodStart: period.start, periodEnd: period.end, periodLabel: period.label, days, balanceCents: bank.account.balanceCents, billsCents, savingsCents, availableCents, unallocatedCents, allocations, warnings, canApprove: warnings.length === 0 };
}
export function estimateAtMerchant(bank: BankSnapshot, merchantId: string) {
  const history = bank.purchases.filter(p => p.merchantId === merchantId && p.status === 'completed' && p.cents > 0).map(p => p.cents).sort((a, b) => a - b);
  return history.length ? history[Math.floor(history.length / 2)] : null;
}
