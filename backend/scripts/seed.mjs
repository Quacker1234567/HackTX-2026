import { readFile, writeFile } from 'node:fs/promises';
import { createNessieClient, validId } from '../src/nessie.mjs';
import { seededClosingBalance } from '../src/demo-balance.mjs';

const client = createNessieClient(process.env.NESSIE_API_KEY);
const journalPath = new URL('../.seed-state.json', import.meta.url);
let journal;
try { journal = JSON.parse(await readFile(journalPath, 'utf8')); }
catch (e) { if (e.code !== 'ENOENT') throw e; journal = { created: {}, pending: null, anchor: new Date().toISOString().slice(0, 10) }; }
if (journal.pending) throw new Error(`Previous write '${journal.pending}' had an uncertain result. Inspect Nessie before clearing the pending field in .seed-state.json; do not blindly retry.`);
const persist = () => writeFile(journalPath, JSON.stringify(journal, null, 2));
async function create(step, path, body) {
  if (journal.created[step]) return journal.created[step];
  journal.pending = step; await persist();
  const result = await client(path, body);
  const id = result.objectCreated?._id ?? result.object_created?._id ?? result._id;
  if (!validId(id)) throw new Error(`Created ${step} but no ID was returned. Check Nessie before retrying.`);
  journal.created[step] = id; journal.pending = null; await persist();
  console.log(`Created ${step}.`);
  return id;
}
const day = offset => { const d = new Date(`${journal.anchor}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };
const address = { street_number: '1', street_name: 'Demo Street', city: 'Austin', state: 'TX', zip: '78705' };
const customer = await create('customer', '/customers', { first_name: 'Flow', last_name: 'Demo', address });
const seedPurchases = Array.from({ length: 10 }, (_, week) => [35 + week % 3 * 4, 65, 18]).flat().map(amount => ({ amount, status: 'completed' }));
const seedDeposits = Array.from({ length: 6 }, () => ({ amount: 1200, status: 'completed' }));
const account = await create('checking', `/customers/${customer}/accounts`, { type: 'Checking', nickname: 'Flow demo checking', rewards: 0, balance: seededClosingBalance(seedPurchases, seedDeposits) / 100 });
const merchantIds = {};
for (const [id, name, category, lat, lng] of [
  ['dining', 'Campus Cafe', 'restaurant', 30.286, -97.738],
  ['groceries', 'Neighborhood Groceries', 'grocery', 30.292, -97.742],
  ['transport', 'Campus Transit', 'transport', 30.28, -97.735],
]) merchantIds[id] = await create(`merchant-${id}`, '/merchants', { name, category, address, geocode: { lat, lng } });
for (const offset of [-70, -56, -42, -28, -14, 0]) await create(`income-${offset}`, `/accounts/${account}/deposits`, { medium: 'balance', transaction_date: day(offset), status: 'completed', amount: 1200, description: 'Flow demo payroll' });
for (let week = 0; week < 10; week++) {
  for (const [category, amount] of [['dining', 35 + week % 3 * 4], ['groceries', 65], ['transport', 18]]) {
    await create(`${category}-${week}`, `/accounts/${account}/purchases`, { merchant_id: merchantIds[category], medium: 'balance', purchase_date: day(-week * 7 - 1), status: 'completed', amount, description: `Flow demo ${category} week ${week}` });
  }
}
for (const [name, amount, offset] of [['Utilities', 85, 4], ['Internet', 45, 9]]) await create(`bill-${name}`, `/accounts/${account}/bills`, { status: 'pending', payee: name, nickname: `Flow demo ${name}`, payment_date: day(offset), recurring_date: Number(day(offset).slice(-2)), payment_amount: amount });
console.log(`Demo ready. Set NESSIE_CUSTOMER_ID=${customer} in backend/.env.hacktx26.`);
console.log('Keep .seed-state.json to resume safely. No API key was printed.');
