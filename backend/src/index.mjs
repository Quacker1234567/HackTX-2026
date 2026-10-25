import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret, defineString } from 'firebase-functions/params';
import { createNessieClient, loadSnapshot, normalizeAccount, validId } from './nessie.mjs';

const apiKey = defineSecret('NESSIE_API_KEY');
const customerId = defineString('NESSIE_CUSTOMER_ID', { default: '' });
const allowedUids = defineString('NESSIE_ALLOWED_UIDS', { default: '' });
const options = { region: 'us-central1', secrets: [apiKey], maxInstances: 2, timeoutSeconds: 120, cors: true };

function authorize(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to Firebase first.');
  // The backend key owns a shared mock dataset. Limit it to explicitly allowed testers.
  const allowed = allowedUids.value().split(',').map(s => s.trim()).filter(Boolean);
  if (!allowed.includes(request.auth.uid)) throw new HttpsError('permission-denied', 'Add your connection ID to NESSIE_ALLOWED_UIDS in the backend configuration.');
  if (!validId(customerId.value())) throw new HttpsError('failed-precondition', 'Set NESSIE_CUSTOMER_ID after creating the demo customer.');
}
async function safe(action) {
  try { return await action(); }
  catch (error) {
    if (error instanceof HttpsError) throw error;
    if (error.status === 401 || error.status === 403) throw new HttpsError('failed-precondition', 'Nessie rejected the backend API key. Check NESSIE_API_KEY.');
    throw new HttpsError('unavailable', 'Nessie import failed. Existing local data is unchanged. Check the configured customer and try again.');
  }
}
export const nessieAccounts = onCall(options, async request => {
  authorize(request);
  return safe(async () => {
    const result = await createNessieClient(apiKey.value())(`/customers/${customerId.value()}/accounts`);
    if (!Array.isArray(result)) throw new Error('Invalid account response');
    return result.filter(row => validId(row._id) && ['Checking', 'Savings'].includes(row.type)).map(normalizeAccount);
  });
});
export const nessieSnapshot = onCall(options, async request => {
  authorize(request);
  const accountId = request.data?.accountId;
  if (!validId(accountId)) throw new HttpsError('invalid-argument', 'Select a valid account.');
  return safe(() => loadSnapshot(createNessieClient(apiKey.value()), customerId.value(), accountId));
});
