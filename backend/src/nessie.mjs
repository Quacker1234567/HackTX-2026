export const NESSIE_ORIGIN = 'https://prod-api.nessieisreal.com';
// Current Nessie uses UUIDs; older sandboxes use Mongo-style object IDs.
export const validId = value => typeof value === 'string' && /^(?:[a-f\d]{24}|[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12})$/i.test(value);
export class NessieError extends Error {
  constructor(status) { super(`Nessie returned HTTP ${status}.`); this.status = status; }
}
export function createNessieClient(key, request = fetch) {
  if (!key) throw new Error('Nessie API key is not configured.');
  return async (path, body, method = body ? 'POST' : 'GET') => {
    if (!/^\/(customers|accounts|merchants|bills)(\/|$)/.test(path) || path.includes('?') || !['GET', 'POST', 'PUT'].includes(method)) throw new Error('Invalid Nessie path.');
    const url = new URL(path, NESSIE_ORIGIN);
    url.searchParams.set('key', key);
    let response;
    try {
      response = await request(url, {
        method,
        headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(10000), redirect: 'error',
      });
    } catch { throw new Error('Nessie could not be reached. Try again later.'); }
    // Never propagate response text, request URLs, or the key into errors/logs.
    if (!response.ok) throw new NessieError(response.status);
    return response.json();
  };
}
export function cents(value) {
  // Nessie monetary values are interpreted as dollars; normalize at the boundary.
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Invalid monetary value from Nessie.');
  const result = Math.round(value * 100);
  if (!Number.isSafeInteger(result)) throw new Error('Nessie amount is outside the supported range.');
  return result;
}
function text(value, fallback = '') { return typeof value === 'string' ? value.slice(0, 200) : fallback; }
function rows(value) {
  if (!Array.isArray(value) || value.length > 5000) throw new Error('Unexpected Nessie list response.');
  if (value.some(row => !row || !validId(row._id))) throw new Error('Nessie record is missing a valid ID.');
  return [...new Map(value.map(row => [row._id, row])).values()];
}
function date(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value ? value : null;
}
function nonnegativeCents(value) {
  const amount = cents(value);
  if (amount < 0) throw new Error('Unexpected negative transaction amount.');
  return amount;
}
function classify(merchant) {
  const label = `${merchant?.name ?? ''} ${Array.isArray(merchant?.category) ? merchant.category.join(' ') : merchant?.category ?? ''}`.toLowerCase();
  if (/grocery|grocer|supermarket/.test(label)) return 'groceries';
  if (/restaurant|cafe|café|coffee|dining|food/.test(label)) return 'dining';
  if (/transit|transport|gas|fuel|uber|lyft/.test(label)) return 'transport';
  return 'other';
}
export function normalizeAccount(row) {
  return { id: row._id, name: text(row.nickname, 'Account'), type: text(row.type), balanceCents: cents(row.balance) };
}
export async function loadSnapshot(client, customerId, accountId, now = new Date()) {
  if (!validId(customerId)) throw new Error('Configure a valid Nessie demo customer ID.');
  const rawAccounts = rows(await client(`/customers/${customerId}/accounts`));
  const account = rawAccounts.find(a => a._id === accountId);
  if (!account || account.type === 'Credit Card') throw new Error('Select a checking or savings account belonging to the configured demo customer.');
  const warnings = [];
  const [purchaseData, depositData, billData] = await Promise.all([
    client(`/accounts/${accountId}/purchases`), client(`/accounts/${accountId}/deposits`), client(`/accounts/${accountId}/bills`).catch(() => {
      warnings.push('Nessie bills could not be imported. Budget approval is blocked until bill data is available; do not treat missing bills as zero obligations.');
      return [];
    }),
  ]);
  const purchases = rows(purchaseData); const deposits = rows(depositData); const bills = rows(billData);
  const merchantIds = [...new Set(purchases.map(p => p.merchant_id).filter(validId))];
  if (merchantIds.length > 100) throw new Error('Demo import supports up to 100 merchants.');
  const merchantRows = [];
  // Bounded batches avoid hundreds of simultaneous API calls.
  for (let i = 0; i < merchantIds.length; i += 5) {
    merchantRows.push(...await Promise.all(merchantIds.slice(i, i + 5).map(async id => {
      try { return await client(`/merchants/${id}`); }
      catch { warnings.push('Some merchant details were unavailable; review uncategorized purchases.'); return { _id: id, name: 'Unknown merchant' }; }
    })));
  }
  const merchants = merchantRows.map(m => ({
    id: m._id, name: text(m.name, 'Merchant'), categoryId: classify(m),
    location: m.geocode && Number.isFinite(m.geocode.lat) && Number.isFinite(m.geocode.lng) ? { latitude: m.geocode.lat, longitude: m.geocode.lng } : null,
  }));
  const merchantMap = new Map(merchants.map(m => [m.id, m]));
  if (bills.some(b => !['pending', 'recurring', 'completed', 'cancelled', 'canceled'].includes(text(b.status).toLowerCase()))) warnings.push('Some bill statuses are unknown. Review them before approving a plan.');
  return {
    source: 'nessie', importedAt: now.toISOString(), account: normalizeAccount(account),
    accounts: rawAccounts.filter(a => ['Checking', 'Savings'].includes(a.type)).map(normalizeAccount),
    billSource: 'nessie', billReviewRequired: warnings.some(w => w.startsWith('Nessie bills could not be imported.')),
    purchases: purchases.map(p => ({ id: p._id, cents: nonnegativeCents(p.amount), date: date(p.transaction_date ?? p.purchase_date), status: text(p.status).toLowerCase(), merchantId: text(p.merchant_id), merchant: merchantMap.get(p.merchant_id)?.name ?? 'Unknown merchant', categoryId: merchantMap.get(p.merchant_id)?.categoryId ?? 'other' })),
    deposits: deposits.map(d => ({ id: d._id, cents: nonnegativeCents(d.amount), date: date(d.transaction_date), status: text(d.status).toLowerCase(), description: text(d.description, 'Deposit') })),
    bills: bills.map(b => ({ id: b._id, cents: nonnegativeCents(b.payment_amount), date: date(b.upcoming_payment_date ?? b.payment_date), status: text(b.status).toLowerCase(), payee: text(b.payee, 'Bill') })),
    merchants, warnings: [...new Set(warnings)],
  };
}
