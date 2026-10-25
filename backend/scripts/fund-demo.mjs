import { readFile, writeFile } from 'node:fs/promises';
import { createNessieClient, validId, cents } from '../src/nessie.mjs';
import { seededClosingBalance } from '../src/demo-balance.mjs';

const client = createNessieClient(process.env.NESSIE_API_KEY);
const original = JSON.parse(await readFile(new URL('../.seed-state.json', import.meta.url), 'utf8'));
const sourceAccount = original.created.checking;
const customer = original.created.customer;
const old = await client(`/accounts/${sourceAccount}`);
if (old.customer_id !== customer || !validId(customer) || !validId(sourceAccount)) throw new Error('Original demo account ownership does not match seed journal.');
const [purchases, deposits] = await Promise.all([client(`/accounts/${sourceAccount}/purchases`), client(`/accounts/${sourceAccount}/deposits`)]);
if (!Array.isArray(purchases) || !Array.isArray(deposits) || purchases.length !== 30 || deposits.length !== 6) throw new Error('Demo history differs from expected fixture. Stop for review.');
const expected = seededClosingBalance(purchases, deposits);
const path = new URL('../.funded-demo-state.json', import.meta.url);
let journal;
try { journal = JSON.parse(await readFile(path, 'utf8')); }
catch (e) { if (e.code !== 'ENOENT') throw e; journal = { sourceAccount, customer, expectedCents: expected, created: {}, pending: null }; }
if (journal.pending) throw new Error('An earlier write has an uncertain result. Inspect the funded-demo journal before retrying.');
if (journal.sourceAccount !== sourceAccount || journal.expectedCents !== expected) throw new Error('Source data changed. Stop for review.');
const save = () => writeFile(path, JSON.stringify(journal, null, 2));
async function create(step, endpoint, payload) {
  if (journal.created[step]) return journal.created[step];
  journal.pending = step; await save();
  const result = await client(endpoint, payload);
  const id = result.objectCreated?._id ?? result.object_created?._id ?? result._id;
  if (!validId(id)) throw new Error('Write outcome is uncertain. Inspect journal before retrying.');
  journal.created[step] = id; journal.pending = null; await save();
  return id;
}
const account = await create('account', `/customers/${customer}/accounts`, { type: 'Checking', nickname: 'Flow funded demo checking', rewards: 0, balance: expected / 100 });
for (const row of deposits) await create(`deposit-${row._id}`, `/accounts/${account}/deposits`, { medium: row.medium, transaction_date: row.transaction_date, status: row.status, amount: row.amount, description: row.description });
for (const row of purchases) await create(`purchase-${row._id}`, `/accounts/${account}/purchases`, { merchant_id: row.merchant_id, medium: row.medium, purchase_date: row.purchase_date ?? row.transaction_date, status: row.status, amount: row.amount, description: row.description });
const day = offset => { const d = new Date(`${original.anchor}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };
for (const [name, amount, offset] of [['Utilities', 85, 4], ['Internet', 45, 9]]) await create(`bill-${name}`, `/accounts/${account}/bills`, { status: 'pending', payee: name, nickname: `Flow demo ${name}`, payment_date: day(offset), recurring_date: Number(day(offset).slice(-2)), payment_amount: amount });
const [result, copiedPurchases, copiedDeposits] = await Promise.all([client(`/accounts/${account}`), client(`/accounts/${account}/purchases`), client(`/accounts/${account}/deposits`)]);
if (cents(result.balance) !== expected || copiedPurchases.length !== 30 || copiedDeposits.length !== 6) throw new Error('Funded account did not reconcile. Stop for review.');
console.log(JSON.stringify({ accountName: result.nickname, balanceCents: expected, purchases: copiedPurchases.length, deposits: copiedDeposits.length, bills: 2, originalAccountPreserved: true }));
