import { httpsCallable } from 'firebase/functions';
import type { BankAccount, BankSnapshot } from '../domain/banking';
import { ensureFirebaseUser, firebaseFunctions } from './firebase';

export async function getNessieAccounts() {
  await ensureFirebaseUser();
  return (await httpsCallable<void, BankAccount[]>(firebaseFunctions(), 'nessieAccounts')()).data;
}
export async function getNessieSnapshot(accountId: string) {
  await ensureFirebaseUser();
  return (await httpsCallable<{ accountId: string }, BankSnapshot>(firebaseFunctions(), 'nessieSnapshot', { timeout: 120000 })({ accountId })).data;
}
