import test from 'node:test';
import assert from 'node:assert/strict';
import { studentDemoFixture } from '../../backend/src/student-demo.mjs';
import { analyzeHistory, proposeBudget } from '../src/domain/banking.ts';
import { applyBudgetPlan, categoriesWithSpend, seedBudget } from '../src/domain/budget.ts';
const f = studentDemoFixture();
const now = new Date(`${f.asOf}T12:00:00`);
const bank = { source: 'nessie', importedAt: now.toISOString(), account: { id: 'student', balanceCents: f.closingCheckingCents }, purchases: f.purchases.map(p => ({ id: p.step, cents: p.cents, date: p.date, categoryId: p.categoryId, merchantId: p.categoryId, status: 'completed' })), deposits: f.deposits.map(d => ({ id: d.step, cents: d.cents, date: d.date, status: 'completed' })), bills: [...f.paidBills, ...f.upcomingBills].map(b => ({ id: b.step, ...b })), merchants: [], warnings: [] };
const goal = { target: 100000, saved: f.savingsCents, days: 120 };
test('existing algorithm derives a funded four-category baseline from the complete student history', () => {
  const plan = proposeBudget(bank, goal, { diningReduction: 0, protectedCategory: 'groceries' }, now);
  assert.equal(plan.canApprove, true); assert.equal(plan.allocations.length, 4);
  assert.equal(plan.billsCents, 6000); assert.equal(plan.savingsCents, 15500);
  assert.equal(plan.availableCents, 97600);
  assert.equal(plan.allocations.reduce((sum, c) => sum + c.limit, 0) + plan.unallocatedCents, plan.availableCents);
  const categories = categoriesWithSpend({ ...seedBudget(), bank, categories: plan.allocations }, now);
  assert.ok(categories.every(c => c.spent > 0 && c.spent < c.limit));
  assert.ok(categories.find(c => c.id === 'dining').limit - categories.find(c => c.id === 'dining').spent >= 3500);
  assert.equal(analyzeHistory(bank, now).count, f.purchases.length);
});
test('a later dining reduction changes the computed limit, preserving the baseline fixture', () => {
  const base = proposeBudget(bank, goal, { diningReduction: 0, protectedCategory: 'groceries' }, now);
  const reduced = proposeBudget(bank, goal, { diningReduction: 20, protectedCategory: 'groceries' }, now);
  assert.ok(reduced.allocations.find(c => c.id === 'dining').limit < base.allocations.find(c => c.id === 'dining').limit);
  assert.ok(reduced.unallocatedCents > base.unallocatedCents);
  assert.equal(f.purchases.length, 116);
});

test('all four categories can be reduced independently, including the priority category', () => {
  const base = proposeBudget(bank, goal, { diningReduction: 0, protectedCategory: 'groceries', reductions: {} }, now);
  for (const id of ['dining', 'groceries', 'transport', 'other']) {
    const plan = proposeBudget(bank, goal, { diningReduction: 0, protectedCategory: id, reductions: { [id]: 50 } }, now);
    assert.equal(plan.canApprove, true);
    assert.ok(plan.allocations.find(c => c.id === id).limit < base.allocations.find(c => c.id === id).limit);
    assert.ok(plan.unallocatedCents > base.unallocatedCents);
    assert.equal(plan.preferences.reductions[id], 50);
  }
  const zero = proposeBudget(bank, goal, { diningReduction: 0, protectedCategory: 'groceries', reductions: { dining: 100, groceries: 100, transport: 100, other: 100 } }, now);
  assert.ok(zero.allocations.every(c => c.limit === 0));
  assert.equal(zero.unallocatedCents, zero.availableCents);
  for (const invalid of [-1, 101, 1.5, NaN]) {
    assert.equal(proposeBudget(bank, goal, { diningReduction: 0, protectedCategory: 'groceries', reductions: { transport: invalid } }, now).canApprove, false);
  }
});

test('applying a bank plan keeps purchases and goal, counting imported and local spending once', () => {
  const plan = proposeBudget(bank, goal, { diningReduction: 0, protectedCategory: 'groceries' }, now);
  const transactions = [
    { id: 'local', categoryId: 'dining', cents: 100, createdAt: f.asOf },
    { id: 'receipt', categoryId: 'dining', cents: bank.purchases.find(p => p.date.startsWith('2026-10') && p.categoryId === 'dining').cents, createdAt: f.asOf, nessiePurchaseId: bank.purchases.find(p => p.date.startsWith('2026-10') && p.categoryId === 'dining').id },
  ];
  const state = { ...seedBudget(), bank, transactions };
  const updated = applyBudgetPlan(state, plan);
  assert.equal(updated.transactions, transactions);
  assert.equal(updated.goal, state.goal);
  assert.equal(updated.bank, bank);
  assert.equal(categoriesWithSpend(updated, now).find(c => c.id === 'dining').spent, 16400);
  assert.equal(updated.categories.length, 4);
  assert.throws(() => applyBudgetPlan(state, { ...plan, accountId: 'wrong' }));
});
