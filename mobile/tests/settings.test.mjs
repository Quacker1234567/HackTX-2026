import test from 'node:test';
import assert from 'node:assert/strict';
import { displayMoney } from '../src/domain/budget.ts';
import { defaultSettings, parseSettings } from '../src/domain/settings.ts';

test('settings parsing keeps valid fields and ignores unsafe values', () => {
  const parsed = parseSettings({ displayName: '  Chen  ', hideBalances: true, purchaseAlerts: false, extra: true });
  assert.equal(parsed.displayName, 'Chen');
  assert.equal(parsed.hideBalances, true);
  assert.equal(parsed.purchaseAlerts, false);
  assert.equal(parsed.goalReminders, defaultSettings().goalReminders);
  assert.equal(parseSettings(null).displayName, '');
  assert.equal(parseSettings({ displayName: 'x'.repeat(50) }).displayName.length, 40);
});

test('hidden money never exposes the dollar amount', () => {
  assert.equal(displayMoney(4200, false), '$42.00');
  assert.equal(displayMoney(4200, true), '••••');
});
