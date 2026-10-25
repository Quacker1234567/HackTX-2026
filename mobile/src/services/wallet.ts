import type { Category } from '../domain/budget';

export function walletSnapshot(category: Category, previewCents = 0) {
  const remainingCents = category.limit - category.spent;
  return {
    version: 1, categoryId: category.id, categoryName: category.name,
    budgetCents: category.limit, remainingCents, previewCents,
    percentageRemaining: category.limit > 0 ? Math.max(0, Math.min(100, Math.round(remainingCents / category.limit * 100))) : 0,
    status: remainingCents <= 0 ? 'red' : remainingCents / category.limit < 0.2 ? 'amber' : 'blue',
    updatedAt: new Date().toISOString(),
  };
}
export async function sendToWallet(endpoint: string, token: string, snapshot: ReturnType<typeof walletSnapshot>) {
  const url = new URL(endpoint);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Use an http:// or https:// device address.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${endpoint.replace(/\/$/, '')}/budget`, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(snapshot),
    });
    if (!response.ok) throw new Error(`Wallet returned ${response.status}. Check the device address and firmware.`);
  } finally { clearTimeout(timer); }
}
