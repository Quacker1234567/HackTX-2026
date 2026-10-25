import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { studentDemoFixture } from '../src/student-demo.mjs';
import { cents, createNessieClient, loadSnapshot, validId } from '../src/nessie.mjs';
import { analyzeHistory, confirmManualBills, proposeBudget } from '../../mobile/src/domain/banking.ts';
import { categoriesWithSpend, seedBudget } from '../../mobile/src/domain/budget.ts';

const fixture = studentDemoFixture();
const directory = new URL('../.student-demo/', import.meta.url);
const journalFile = new URL('journal.json', directory);
const fixtureHash = createHash('sha256').update(JSON.stringify(fixture)).digest('hex');
const goal = { name: 'Emergency fund', target: 100000, saved: fixture.savingsCents, days: 120 };
const asOf = new Date(`${fixture.asOf}T12:00:00`);
function report(snapshot, manualBills, source = 'live') {
  const planning = manualBills ? confirmManualBills(snapshot, fixture.upcomingBills.map(b => ({ id: b.step, cents: b.cents, date: b.date, status: b.status, payee: b.payee }))) : snapshot;
  const plan = proposeBudget(planning, goal, { diningReduction: 0, protectedCategory: 'groceries' }, asOf);
  const spent = categoriesWithSpend({ ...seedBudget(), bank: snapshot, categories: plan.allocations }, asOf);
  return { asOf: fixture.asOf, historyFrom: fixture.from, purchases: snapshot.purchases.length, deposits: snapshot.deposits.length, bankBalanceCents: snapshot.account.balanceCents, savingsBalanceCents: fixture.savingsCents, billBasis: source === 'preview' ? 'Fictional fixture preview; no Nessie requests' : manualBills ? 'Explicitly confirmed fictional fixture bill list; not a working Nessie bill reader' : 'Nessie bill reader', goal, days: plan.days, savingsReserveCents: plan.savingsCents, billsReserveCents: plan.billsCents, availableCents: plan.availableCents, unallocatedCents: plan.unallocatedCents, canApprove: plan.canApprove, warnings: plan.warnings, categories: spent.map(c => ({ id: c.id, name: c.name, limitCents: c.limit, spentCents: c.spent, remainingCents: c.limit - c.spent })), history: analyzeHistory(planning, asOf) };
}
function previewSnapshot() {
  return { source: 'nessie', importedAt: asOf.toISOString(), account: { id: 'preview', name: 'Flow Student Checking', type: 'Checking', balanceCents: fixture.closingCheckingCents }, purchases: fixture.purchases.map(p => ({ id: p.step, cents: p.cents, date: p.date, status: 'completed', merchantId: p.categoryId, merchant: fixture.merchants.find(m => m.id === p.categoryId).name, categoryId: p.categoryId })), deposits: fixture.deposits.map(d => ({ id: d.step, cents: d.cents, date: d.date, status: 'completed', description: d.description })), bills: [...fixture.paidBills, ...fixture.upcomingBills].map(b => ({ id: b.step, cents: b.cents, date: b.date, status: b.status, payee: b.payee })), merchants: [], warnings: [] };
}
const mode = process.argv[2] || '--plan';
if (mode === '--plan') { console.log(JSON.stringify(report(previewSnapshot(), false, 'preview'), null, 2)); process.exit(0); }
if (!['--apply', '--verify', '--activate'].includes(mode)) throw new Error('Use --plan, --apply, --verify or --activate.');
const key = process.env.NESSIE_API_KEY;
const client = createNessieClient(key);
const keyHash = createHash('sha256').update(key).digest('hex');
await mkdir(directory, { recursive: true });
let journal;
try { journal = JSON.parse(await readFile(journalFile, 'utf8')); }
catch (error) {
  if (error.code !== 'ENOENT' || mode !== '--apply') throw new Error('Create the student dataset with --apply before verification or activation.');
  journal = { fixtureHash, keyHash, previousCustomerId: process.env.NESSIE_CUSTOMER_ID, created: {}, pending: null };
}
if (journal.fixtureHash !== fixtureHash || journal.keyHash !== keyHash) throw new Error('Fixture or API key differs from this journal. Stop; do not reuse it for another dataset.');
if (journal.pending) throw new Error(`Uncertain write '${journal.pending}'. Inspect Nessie before retrying; never clear it blindly.`);
async function persist() {
  const temporary = new URL(`journal-${randomUUID()}.tmp`, directory);
  await writeFile(temporary, JSON.stringify(journal, null, 2), { mode: 0o600 });
  await rename(temporary, journalFile);
}
async function create(step, path, payload) {
  if (journal.created[step]) return journal.created[step];
  journal.pending = step; await persist();
  const result = await client(path, payload);
  const id = result.objectCreated?._id ?? result.object_created?._id ?? result._id;
  if (!validId(id)) throw new Error('Nessie did not return a valid created ID. Keep the pending journal and inspect the write.');
  journal.created[step] = id; journal.pending = null; await persist();
  const count = Object.keys(journal.created).length;
  if (count % 10 === 0 || step === 'customer') console.log(`Student fixture records created: ${count}`);
  return id;
}
if (mode === '--apply') {
  const address = { street_number: '1', street_name: 'Fictional Student Demo Way', city: 'Austin', state: 'TX', zip: '78705' };
  const customer = await create('customer', '/customers', { ...fixture.customer, address });
  const checking = await create('checking', `/customers/${customer}/accounts`, { type: 'Checking', nickname: 'Flow Student Checking', rewards: 0, balance: fixture.closingCheckingCents / 100 });
  await create('savings', `/customers/${customer}/accounts`, { type: 'Savings', nickname: 'Flow Student Emergency Savings', rewards: 0, balance: fixture.savingsCents / 100 });
  for (const m of fixture.merchants) await create(`merchant-${m.id}`, '/merchants', { name: m.name, category: m.category, address: { ...address, street_name: m.street }, geocode: { lat: m.lat, lng: m.lng } });
  for (const d of fixture.deposits) await create(d.step, `/accounts/${checking}/deposits`, { medium: 'balance', transaction_date: d.date, status: 'completed', amount: d.cents / 100, description: d.description });
  for (const p of fixture.purchases) await create(p.step, `/accounts/${checking}/purchases`, { merchant_id: journal.created[`merchant-${p.categoryId}`], medium: 'balance', purchase_date: p.date, status: 'completed', amount: p.cents / 100, description: `Flow student v1 ${p.step}` });
  for (const b of [...fixture.paidBills, ...fixture.upcomingBills]) await create(b.step, `/accounts/${checking}/bills`, { status: b.status, payee: b.payee, nickname: `Flow student ${b.step}`, payment_date: b.date, recurring_date: Number(b.date.slice(-2)), payment_amount: b.cents / 100 });
}
const customer = journal.created.customer, checking = journal.created.checking, savings = journal.created.savings;
if (![customer, checking, savings].every(validId)) throw new Error('Student accounts are incomplete.');
if (Object.keys(journal.created).length !== 3 + fixture.merchants.length + fixture.deposits.length + fixture.purchases.length + fixture.paidBills.length + fixture.upcomingBills.length) throw new Error('Student fixture journal is incomplete.');
const [snapshot, accounts] = await Promise.all([loadSnapshot(client, customer, checking, asOf), client(`/customers/${customer}/accounts`)]);
if (snapshot.account.balanceCents !== fixture.closingCheckingCents || !accounts.some(a => a._id === savings && a.type === 'Savings' && cents(a.balance) === fixture.savingsCents)) throw new Error('Account balances or ownership did not reconcile.');
for (const p of fixture.purchases) {
  const actual = snapshot.purchases.find(row => row.id === journal.created[p.step]);
  if (!actual || actual.cents !== p.cents || actual.date !== p.date || actual.categoryId !== p.categoryId || actual.status !== 'completed') throw new Error('A seeded purchase failed read-back verification. Stop before activation.');
}
for (const d of fixture.deposits) {
  const actual = snapshot.deposits.find(row => row.id === journal.created[d.step]);
  if (!actual || actual.cents !== d.cents || actual.date !== d.date || actual.status !== 'completed') throw new Error('A seeded deposit failed read-back verification.');
}
if (snapshot.purchases.length !== fixture.purchases.length || snapshot.deposits.length !== fixture.deposits.length || snapshot.merchants.length !== 4) throw new Error('Unexpected extra or missing data. Inspect the dataset before activation.');
if (!snapshot.billReviewRequired) {
  for (const bill of [...fixture.paidBills, ...fixture.upcomingBills]) {
    const actual = snapshot.bills.find(row => row.id === journal.created[bill.step]);
    if (!actual || actual.cents !== bill.cents || actual.status !== bill.status || (bill.status === 'pending' && actual.date !== bill.date)) throw new Error('Seeded bills differ from their intended amount, status or due date. Stop before activation.');
  }
}
const income = snapshot.deposits.reduce((total, row) => total + row.cents, 0);
const spending = snapshot.purchases.reduce((total, row) => total + row.cents, 0);
const fixedPaid = fixture.paidBills.reduce((total, row) => total + row.cents, 0);
if (fixture.openingCheckingCents + income - spending - fixedPaid !== snapshot.account.balanceCents) throw new Error('Student ledger does not reconcile.');
const summary = report(snapshot, snapshot.billReviewRequired);
const expectedBills = fixture.upcomingBills.filter(b => b.status === 'pending' && b.date <= '2026-10-31').reduce((total, b) => total + b.cents, 0);
if (summary.billsReserveCents !== expectedBills) throw new Error('The algorithm reserved unexpected bills. Review before activation.');
if (!summary.canApprove || summary.categories.some(c => c.remainingCents < 0)) throw new Error('The baseline proposal needs review before activating the student demo.');
await writeFile(new URL('verification.json', directory), JSON.stringify(summary, null, 2));
journal.verifiedAt = new Date().toISOString(); await persist();
if (mode === '--activate') {
  const configFile = new URL('../.env.hacktx26', import.meta.url);
  const original = await readFile(configFile, 'utf8');
  const current = original.match(/^NESSIE_CUSTOMER_ID=(.*)$/m)?.[1].trim().replace(/^['"]|['"]$/g, '');
  if (current !== journal.previousCustomerId && current !== customer) throw new Error('Backend customer changed during this work. No configuration was overwritten.');
  try { await writeFile(new URL('previous-backend.env', directory), original, { flag: 'wx', mode: 0o600 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  await writeFile(configFile, original.replace(/^NESSIE_CUSTOMER_ID=.*$/m, `NESSIE_CUSTOMER_ID=${customer}`));
  journal.activatedAt = new Date().toISOString(); await persist();
  console.log('Student customer selected. Restart the backend, then import Flow Student Checking in Connections. Tester allowlist unchanged.');
}
console.log(JSON.stringify(summary, null, 2));

