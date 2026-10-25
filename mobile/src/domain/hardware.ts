import type { Budget } from './budget';
import { monthSpentByCategory } from './budget.ts';
import { dayKey } from './banking.ts';

export const WALLET_CARD = { uid: '44339A9E', category: 'dining', amount_cents: 1200 };
export class WalletBudgetExceededError extends Error {
  constructor() { super('This card exceeds the remaining Dining budget.'); }
}
export type WalletEvent = { id: string; type: string; boot_id: string; sequence: number; uid: string; category: string; amount_cents: number; created_at: number };
export type WalletReply = { id: string; mood: 'happy' | 'sad'; message: string };
export function walletReply(id: string, mood: WalletReply['mood'], message: string): WalletReply {
  if (!/^[a-f0-9]{16}-[1-9][0-9]{0,9}$/.test(id) || Number(id.slice(17)) > 2147483647 || !/^[\x20-\x7e]{0,32}$/.test(message)) throw new Error('Invalid wallet result.');
  return { id, mood, message };
}
export function walletPlanReady(budget: Budget, now = new Date()) {
  return !!budget.bank && !!budget.plan && budget.bank.account.type === 'Checking' && budget.plan.accountId === budget.bank.account.id && budget.plan.snapshotAt === budget.bank.importedAt && budget.plan.periodEnd >= dayKey(now) && budget.plan.canApprove && !budget.bank.warnings.length;
}
export function firebaseWalletBudget(budget: Budget, now = new Date()) {
  const spent = monthSpentByCategory(budget, now);
  const categories = budget.categories.filter(c => c.limit > 0).map(c => ({ id: c.id, name: c.name.slice(0, 12), total_cents: c.limit, left_cents: c.limit - (spent[c.id] ?? 0) }));
  const dining = categories.find(c => c.id === WALLET_CARD.category);
  // Keep known cards recognizable even when they cannot afford another purchase.
  // Confirmation is checked against the latest balance before any Nessie request.
  const cards = walletPlanReady(budget, now) && dining ? [{ ...WALLET_CARD }] : [];
  return { categories, cards };
}
export function walletAttempt(budget: Budget, event: WalletEvent, firebaseUid: string, deviceId: string, now = new Date()) {
  if (!/^[A-Za-z0-9_-]{1,48}$/.test(deviceId)) throw new Error('Invalid wallet ID.');
  if (!/^[a-f0-9]{16}$/.test(event.boot_id) || !Number.isInteger(event.sequence) || event.sequence < 1 || event.sequence > 2147483647 || event.id !== `${event.boot_id}-${event.sequence}` || event.type !== 'purchase_confirm') throw new Error('Invalid wallet confirmation.');
  if (!Number.isFinite(event.created_at) || event.created_at < 0 || event.created_at > Date.now() + 60000) throw new Error('Invalid wallet event time.');
  if (event.uid !== WALLET_CARD.uid || event.category !== WALLET_CARD.category || event.amount_cents !== WALLET_CARD.amount_cents) throw new Error('Card or price changed. Tap the configured Dining card again.');
  if (!walletPlanReady(budget, now)) throw new Error('Review and apply your budget in Insights before using the wallet.');
  const category = firebaseWalletBudget(budget, now).categories.find(c => c.id === event.category);
  if (!category || category.left_cents < event.amount_cents) throw new WalletBudgetExceededError();
  const merchant = budget.bank!.merchants.find(m => m.categoryId === event.category && m.name === 'Campus Cafe Restaurant') ?? budget.bank!.merchants.find(m => m.categoryId === event.category);
  if (!merchant) throw new Error('Import the Dining merchant before using this card.');
  const requestId = `hw_${deviceId}_${event.boot_id}_${event.sequence}`;
  return {
    request: { requestId, accountId: budget.bank!.account.id, merchantId: merchant.id, amountCents: event.amount_cents, firebaseUid },
    transaction: { id: requestId, categoryId: event.category, merchant: merchant.name, cents: event.amount_cents, createdAt: now.toISOString(), accountId: budget.bank!.account.id },
  };
}
