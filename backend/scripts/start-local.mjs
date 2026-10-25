import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { authorize, nessieAccounts, nessieSnapshot } from '../src/index.mjs';
import { createLocalServer } from '../src/local-server.mjs';
import { createNessieClient, validId } from '../src/nessie.mjs';
import { createPurchaseHandler, createReconcileHandler } from '../src/purchases.mjs';
import { filePurchaseJournal, withPurchaseReserves } from '../src/purchase-journal.mjs';
import { fileURLToPath } from 'node:url';

if (!process.env.NESSIE_API_KEY || !validId(process.env.NESSIE_CUSTOMER_ID) || !process.env.NESSIE_ALLOWED_UIDS?.trim()) {
  throw new Error('Configure .env.local with the Nessie key and .env.hacktx26 with the customer ID and tester UID first.');
}
// ID-token verification uses public Google certificates and an explicit project ID;
// no service-account file, admin password, paid secret storage, or deployment needed.
if (process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Unset FIREBASE_AUTH_EMULATOR_HOST: this server verifies real Firebase tokens.');
const app = initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || 'hacktx26' });
const purchaseJournal = filePurchaseJournal(fileURLToPath(new URL('../.purchase-journal/', import.meta.url)));
const purchaseOptions = {
  authorize, client: createNessieClient(process.env.NESSIE_API_KEY),
  customerId: () => process.env.NESSIE_CUSTOMER_ID,
  journal: purchaseJournal,
};
const nessiePurchase = createPurchaseHandler(purchaseOptions);
const nessieReconcile = createReconcileHandler(purchaseOptions);
const server = createLocalServer({
  verifyToken: token => getAuth(app).verifyIdToken(token),
  handlers: { nessieAccounts: request => nessieAccounts.run(request), nessieSnapshot: async request => withPurchaseReserves(await nessieSnapshot.run(request), purchaseJournal), nessiePurchase, nessieReconcile },
});
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? 'Port 8787 is already in use. Stop the other local backend first.' : 'Local backend could not start.'); process.exitCode = 1; });
server.listen(8787, '127.0.0.1', () => console.log('Flow backend ready at http://127.0.0.1:8787. Keep this terminal open.'));
