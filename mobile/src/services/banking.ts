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
export type NessiePurchaseRequest = { requestId: string; accountId: string; merchantId: string; amountCents: number; firebaseUid: string };
export type NessiePurchaseResult =
  | { state: 'created'; requestId: string; purchaseId: string; accountId: string; merchantId: string; amountCents: number; date: string; snapshot: BankSnapshot | null }
  | { state: 'uncertain' | 'rejected' | 'mismatch'; requestId: string; message: string };
export async function createNessiePurchase(request: NessiePurchaseRequest) {
  if (!process.env.EXPO_PUBLIC_NESSIE_BACKEND_URL?.trim()) throw new Error('Set the local backend HTTPS URL. Purchase writes are not deployed to Firebase Functions.');
  const user = await ensureFirebaseUser();
  if (user.uid !== request.firebaseUid) throw new Error('This purchase belongs to your original Firebase identity. Restore it before retrying.');
  return (await httpsCallable<NessiePurchaseRequest, NessiePurchaseResult>(firebaseFunctions(), 'nessiePurchase', { timeout: 120000 })(request)).data;
}
