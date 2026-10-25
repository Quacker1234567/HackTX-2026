import { cents } from './nessie.mjs';

// Seed-only reconciliation. Never substitute this for a bank's balance in imports.
export function seededClosingBalance(purchases, deposits) {
  const sum = records => [...new Map(records.map((row, i) => [row._id ?? i, row])).values()]
    .filter(row => row.status === 'completed').reduce((amount, row) => {
      const value = cents(row.amount);
      if (value < 0) throw new Error('Negative seed transaction.');
      return amount + value;
    }, 0);
  const balance = sum(deposits) - sum(purchases);
  if (!Number.isSafeInteger(balance) || balance <= 0) throw new Error('The demo ledger must have a positive closing balance.');
  return balance;
}
