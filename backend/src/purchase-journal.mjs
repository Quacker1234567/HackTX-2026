import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Keep this directory across restarts. Creating a claim exclusively precedes any POST.
export function filePurchaseJournal(directory) {
  const file = key => join(directory, `${key}.json`);
  return {
    async entries() {
      let files;
      try { files = await readdir(directory); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
      // The filename is the authoritative key, so older entries need no migration.
      return Promise.all(files.filter(name => /^[a-f0-9]{64}\.json$/.test(name)).map(async name => ({ ...JSON.parse(await readFile(join(directory, name), 'utf8')), key: name.slice(0, -'.json'.length) })));
    },
    async get(key) {
      try { return JSON.parse(await readFile(file(key), 'utf8')); }
      catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    },
    async claim(key, entry) {
      await mkdir(directory, { recursive: true });
      try { await writeFile(file(key), JSON.stringify(entry), { flag: 'wx', mode: 0o600 }); return null; }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
      return JSON.parse(await readFile(file(key), 'utf8'));
    },
    async save(key, entry) {
      const temporary = join(directory, `${key}.${randomUUID()}.tmp`);
      await writeFile(temporary, JSON.stringify(entry), { mode: 0o600 });
      await rename(temporary, file(key));
    },
  };
}
export const purchaseKey = (uid, requestId) => createHash('sha256').update(JSON.stringify([uid, requestId])).digest('hex');
export const DISPOSITIONS = ['settled', 'void'];
export async function withPurchaseReserves(snapshot, journal) {
  const verified = (await journal.entries()).filter(e => e.accountId === snapshot.account.id && e.state === 'created' && e.verified);
  const unique = [...new Map(verified.map(e => [e.purchaseId, e])).values()];
  // A reconciled entry has been reviewed: either settled against the balance, or
  // voided as rehearsal data. Both stop reserving funds; only void leaves history.
  const outstanding = unique.filter(e => e.balanceReflected !== true && !e.reconciledAt);
  const reserve = outstanding.reduce((sum, e) => sum + e.amountCents, 0);
  if (!Number.isSafeInteger(reserve) || reserve < 0) throw new Error('Purchase reserve journal needs review.');
  const warnings = [...(snapshot.warnings ?? [])];
  if (outstanding.some(e => e.balanceBeforeCents !== snapshot.account.balanceCents)) warnings.push('The reported bank balance changed while Flow purchases await reconciliation. Review the purchase journal before approving another plan.');
  return {
    ...snapshot, unreflectedPurchaseCents: reserve, warnings,
    voidedPurchaseIds: unique.filter(e => e.disposition === 'void').map(e => e.purchaseId),
    flowDebits: outstanding.map(e => ({ purchaseId: e.purchaseId, amountCents: e.amountCents, date: e.date ?? null })),
  };
}
