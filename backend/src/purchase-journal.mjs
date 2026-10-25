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
      return Promise.all(files.filter(name => /^[a-f0-9]{64}\.json$/.test(name)).map(async name => JSON.parse(await readFile(join(directory, name), 'utf8'))));
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
export async function withPurchaseReserves(snapshot, journal) {
  const entries = (await journal.entries()).filter(e => e.accountId === snapshot.account.id && e.state === 'created' && e.verified && e.balanceReflected !== true);
  const unique = [...new Map(entries.map(e => [e.purchaseId, e])).values()];
  const reserve = unique.reduce((sum, e) => sum + e.amountCents, 0);
  if (!Number.isSafeInteger(reserve) || reserve < 0) throw new Error('Purchase reserve journal needs review.');
  const warnings = [...(snapshot.warnings ?? [])];
  if (unique.some(e => e.balanceBeforeCents !== snapshot.account.balanceCents)) warnings.push('The reported bank balance changed while Flow purchases await reconciliation. Review the purchase journal before approving another plan.');
  return { ...snapshot, unreflectedPurchaseCents: reserve, warnings };
}
