// Fictional, deterministic student activity. No personal spreadsheet rows are copied.
export const STUDENT_DEMO_VERSION = 1;
const dollars = value => value * 100;
const iso = date => date.toISOString().slice(0, 10);
export function studentDemoFixture() {
  const asOf = '2026-10-25';
  const end = new Date(`${asOf}T12:00:00Z`);
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - 89);
  const merchants = [
    { id: 'groceries', name: 'West Campus Grocery', category: 'grocery', street: 'West Campus Demo Way', lat: 30.290, lng: -97.747 },
    { id: 'dining', name: 'Campus Cafe Restaurant', category: 'restaurant', street: 'Guadalupe Demo Lane', lat: 30.284, lng: -97.742 },
    { id: 'transport', name: 'North Campus Transit and Fuel', category: 'transport', street: 'North Campus Demo Road', lat: 30.302, lng: -97.735 },
    { id: 'other', name: 'Student Life Market', category: 'shopping', street: 'Campus Demo Plaza', lat: 30.280, lng: -97.737 },
  ];
  const purchases = [];
  const add = (date, categoryId, amount, detail) => purchases.push({ step: `purchase-${date}-${categoryId}-${detail}`, date, categoryId, cents: dollars(amount), detail });
  let groceries = 0, coffee = 0, lunches = 0, dinners = 0, rides = 0, fuel = 0, weekends = 0;
  for (let offset = 0; offset < 90; offset++) {
    const date = new Date(start); date.setUTCDate(start.getUTCDate() + offset);
    const key = iso(date), weekday = date.getUTCDay(), week = Math.floor(offset / 7);
    if (weekday === 6) add(key, 'groceries', [47, 56, 43, 59, 51, 48, 62, 45, 53, 58, 46, 55, 50][groceries++ % 13], 'weekly-essentials');
    if ([1, 3, 5].includes(weekday)) add(key, 'dining', [4, 5, 6, 4, 5][coffee++ % 5], 'coffee');
    if ([2, 4].includes(weekday)) add(key, 'dining', [9, 12, 10, 13, 11, 8][lunches++ % 6], 'campus-lunch');
    if (weekday === 6 && week % 2 === 1) add(key, 'dining', [18, 22, 16, 24][dinners++ % 4], 'weekend-dinner');
    if (weekday === 2) add(key, 'transport', [5, 7, 4, 6, 8][rides++ % 5], 'transit');
    if (weekday === 5 && week % 2 === 0) add(key, 'transport', [24, 28, 22, 26][fuel++ % 4], 'fuel');
    if (weekday === 0 && week % 2 === 0) add(key, 'other', [18, 24, 16, 28, 20][weekends++ % 5], 'weekend-activity');
    if (date.getUTCDate() === 5) add(key, 'other', 15, 'student-subscriptions');
  }
  for (const [date, amount] of [['2026-08-20', 65], ['2026-09-15', 40], ['2026-10-07', 32]]) add(date, 'other', amount, 'school-supplies');
  purchases.sort((a, b) => a.date.localeCompare(b.date) || a.step.localeCompare(b.step));
  const deposits = [];
  for (const month of ['08', '09', '10']) deposits.push({ step: `support-2026-${month}-01`, date: `2026-${month}-01`, cents: dollars(1200), description: 'Fictional student family support' });
  for (const date of ['2026-08-07', '2026-08-21', '2026-09-04', '2026-09-18', '2026-10-02', '2026-10-16']) deposits.push({ step: `payroll-${date}`, date, cents: dollars(500), description: 'Fictional campus job payroll' });
  deposits.sort((a, b) => a.date.localeCompare(b.date));
  const paidBills = [
    ...['08', '09', '10'].map(month => ({ step: `rent-paid-${month}`, date: `2026-${month}-01`, cents: dollars(1220), payee: 'Student Housing Demo', status: 'completed' })),
    ...['08', '09'].map(month => ({ step: `utilities-paid-${month}`, date: `2026-${month}-28`, cents: dollars(60), payee: 'Student Utilities Demo', status: 'completed' })),
  ];
  const upcomingBills = [
    { step: 'utilities-due-october', date: '2026-10-28', cents: dollars(60), payee: 'Student Utilities Demo', status: 'pending' },
    { step: 'rent-due-november', date: '2026-11-01', cents: dollars(1220), payee: 'Student Housing Demo', status: 'pending' },
    // Retained as a cancelled schedule: recurring_date would otherwise make this
    // a second October 28 obligation in this Nessie sandbox.
    { step: 'utilities-due-november', date: '2026-11-28', cents: dollars(60), payee: 'Student Utilities Demo', status: 'cancelled' },
  ];
  const sum = rows => rows.reduce((total, row) => total + row.cents, 0);
  const openingCheckingCents = dollars(200), savingsCents = dollars(400);
  const closingCheckingCents = openingCheckingCents + sum(deposits) - sum(purchases) - sum(paidBills);
  return { version: STUDENT_DEMO_VERSION, asOf, from: iso(start), customer: { first_name: 'Alex', last_name: 'Rivera' }, merchants, purchases, deposits, paidBills, upcomingBills, openingCheckingCents, closingCheckingCents, savingsCents };
}
