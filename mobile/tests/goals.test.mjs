import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGoals, planningGoal, seedBudget } from '../src/domain/budget.ts';
import { proposeBudget } from '../src/domain/banking.ts';
const account = { id: 'checking', name: 'Checking', type: 'Checking', balanceCents: 200000 };
const savings = { id: 'savings', name: 'Flow Student Emergency Savings', type: 'Savings', balanceCents: 40000 };
const bank = { source: 'nessie', importedAt: '2026-10-25T12:00:00Z', account, accounts: [account, savings], purchases: Array.from({length: 5}, (_, i) => ({ id: String(i), cents: 1000, status: 'completed', date: '2026-10-20', categoryId: 'dining' })), deposits: [], bills: [], merchants: [], warnings: [] };

test('old single-goal data links student savings on import and preserves purchases and target', () => {
  const old = seedBudget();
  const beforeImport = normalizeGoals(old);
  const migrated = normalizeGoals({ ...beforeImport, bank });
  assert.equal(migrated.goal.name, savings.name);
  assert.equal(migrated.goal.saved, 40000);
  assert.equal(migrated.goal.target, old.goal.target);
  assert.equal(migrated.transactions, old.transactions);
  assert.equal(migrated.goals.length, 1);
  assert.equal(normalizeGoals(migrated).goals.length, 1);
});

test('additional goals stay separate and linked savings refresh only its own goal', () => {
  const first = normalizeGoals({ ...seedBudget(), bank });
  const second = { id: 'laptop', name: 'Laptop', target: 50000, saved: 0, days: 100 };
  const updated = normalizeGoals({ ...first, goals: [...first.goals, second], bank: { ...bank, accounts: [account, { ...savings, balanceCents: 45000 }] } });
  assert.equal(updated.goals[0].saved, 45000);
  assert.equal(updated.goals[1].saved, 0);
  const removed = normalizeGoals({ ...updated, goals: [second] });
  assert.equal(removed.goal.name, 'Laptop');
  assert.equal(removed.goal.saved, 0);
});

test('budget reserves the combined pace of all goals once and caps completed goals', () => {
  const state = normalizeGoals({ ...seedBudget(), bank });
  const base = proposeBudget(bank, planningGoal(state), { diningReduction: 0, protectedCategory: 'groceries' }, new Date('2026-10-25T12:00:00'));
  const added = { ...state, goals: [...state.goals, { id: 'laptop', name: 'Laptop', target: 50000, saved: 0, days: 100 }, { id: 'done', name: 'Done', target: 10000, saved: 10000, days: 30 }] };
  const plan = proposeBudget(bank, planningGoal(added), { diningReduction: 0, protectedCategory: 'groceries' }, new Date('2026-10-25T12:00:00'));
  assert.equal(plan.savingsCents, base.savingsCents + 15500);
  assert.equal(plan.availableCents, base.availableCents - 15500);
});
