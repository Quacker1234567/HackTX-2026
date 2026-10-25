export type AppSettings = {
  displayName: string;
  hideBalances: boolean;
  purchaseAlerts: boolean;
  goalReminders: boolean;
};

export const defaultSettings = (): AppSettings => ({
  displayName: '',
  hideBalances: false,
  purchaseAlerts: true,
  goalReminders: true,
});

export function parseSettings(value: unknown): AppSettings {
  const fallback = defaultSettings();
  if (!value || typeof value !== 'object') return fallback;
  const data = value as Record<string, unknown>;
  return {
    displayName: typeof data.displayName === 'string' ? data.displayName.trim().slice(0, 40) : fallback.displayName,
    hideBalances: typeof data.hideBalances === 'boolean' ? data.hideBalances : fallback.hideBalances,
    purchaseAlerts: typeof data.purchaseAlerts === 'boolean' ? data.purchaseAlerts : fallback.purchaseAlerts,
    goalReminders: typeof data.goalReminders === 'boolean' ? data.goalReminders : fallback.goalReminders,
  };
}
