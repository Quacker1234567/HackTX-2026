# Student demo customer — October 25, 2026

Created on `mike-branch` using the private Nessie key. Existing customers, accounts
and transactions were preserved. The backend configuration now selects this
separate fictional customer; restart the backend to load the change.

## What was created

- Alex Rivera, fictional student.
- **Flow Student Checking:** $1,191 reported balance.
- **Flow Student Emergency Savings:** $400 reported balance, separate from checking.
- Four fictional Austin merchant locations: West Campus Grocery, Campus Cafe
  Restaurant, North Campus Transit and Fuel, Student Life Market.
- 116 completed whole-dollar purchases from July 28–October 25, 2026.
- Nine completed deposits: monthly family support and fortnightly campus payroll.
- Five completed rent/utility bills, two active future bills, and one cancelled
  duplicate schedule retained for traceability. Rent is not duplicated as a
  merchant purchase or included in the discretionary category bars.

Purchases are spread across all weekdays: weekly groceries, weekday coffee and
lunch, transit/fuel, occasional weekend activity and school supplies. Dates,
amounts, merchant/category classification, account ownership, and all bill
amounts/statuses were read back before activation.

The ledger reconciles in dollars:

`$200 opening + $6,600 deposits − $1,829 purchases − $3,660 paid rent − $120 paid utilities = $1,191 checking`.

Savings is a separate opening balance and is not added to spendable checking.
No personal spreadsheet transactions were copied into the fixture.

## In-house algorithm baseline

No category limits were written into Nessie or fitted to the old spreadsheet.
The current `proposeBudget` and `categoriesWithSpend` functions were run against
read-back data, as of October 25, with dining reduction **0%** and groceries
protected. The analysis covers 90 calendar days; the plan covers October.

| Category | Calculated monthly limit | October spent | Left |
| --- | ---: | ---: | ---: |
| Dining | $198.40 | $163.00 | $35.40 |
| Groceries | $231.82 | $209.00 | $22.82 |
| Transport | $86.12 | $66.00 | $20.12 |
| Other (school, shopping and fun) | $113.67 | $89.00 | $24.67 |
| Total | $630.01 | $527.00 | $103.01 |

The example goal input was a $1,000 emergency fund, $400 already saved and 120
remaining days. The algorithm reserves $155 for savings and $60 for the active
October 28 utility bill, leaving $976 eligible for allocation. Historical pace
caps the categories at $630.01, leaving $345.99 unallocated.

The phone keeps its existing goal and local settings when a customer changes.
The algorithm report's goal is an explicit example input using the new savings
balance; there is **no automatic link between savings accounts and goal.saved**
yet. Different goal settings may change reserves and unallocated funds. With
sufficient checking funds, the same history still produces these category caps.

The default reduction in Banking is now 0%, so the first proposal is a baseline.
The UI currently exposes dining reduction only. The planned next feature is
per-category reductions for all four categories, using their stable IDs rather
than adding more category-specific fields. The new fixture supports that work.

## Use it on Android

1. Restart the existing backend terminal with `npm run start:local` from backend/.
   Keep the Cloudflare process running; its URL need not change if it stays open.
2. Reload Expo Go to pick up the 0% default. In Tools → Connections, load accounts
   and select **Flow Student Checking**, not the savings account.
3. In Tools → Banking, review the imported month, bills, goal and baseline proposal,
   then approve it. Importing alone does not replace saved allocations.
4. Home will derive month-to-date spending from the new imported history.
5. A $35 dining purchase fits the baseline's $35.40 remainder, leaving $0.40.
   Use Rehearsal only for practice; Send to Nessie creates a sandbox record.

A new savings account is present in account listings and snapshot account context.
Selecting savings is not required to view or budget checking. Never sum savings
into checking funds automatically.

## Bill-reader result

The new bill records contain the fields required by this sandbox, and the bill
reader passed live verification. Its active October reserve is $60, so the
manual-bill fallback was not used for this baseline.

Nessie derives `upcoming_payment_date` from `recurring_date` even when a later
`payment_date` was supplied. A separate November utility schedule therefore
became a duplicate October 28 bill. Only that newly created duplicate was marked
cancelled and verified; the intended October utility and November rent remain
pending. Historical bill dates are preserved as payment dates even when their
normalized upcoming dates reflect the next recurrence.

## Scripts, journals and rollback

From the repository root:

```powershell
npm run seed:student:plan --prefix backend
```

This is a local preview of the fixture through the existing algorithm and makes
no API calls. The apply, verify and activate commands are documented in
backend/package.json, but do **not** rerun them as routine app startup. The
verification assumes a pristine seeded baseline; live demo purchases can change
its expected counts without implying that anything should be deleted/reseeded.

`backend/.student-demo/` is private and ignored. It contains the resumable journal,
read-back report and previous `.env.hacktx26` configuration. Keep it; a pending
write stops seeding rather than blindly creating duplicates. A fixture/key hash
prevents reusing it for a different dataset.

To revert the backend selection, restore only the previous `NESSIE_CUSTOMER_ID`
from `.student-demo/previous-backend.env`, preserving the current tester allowlist,
then restart the backend and re-import an account. Do not delete either customer.

## Account information available for future features

Snapshots now include normalized owned checking/savings accounts in `accounts`,
while `account` remains the selected funding account. This reuses an existing
customer-scoped API request and does not pool balances. Possible next features:

- Checking runway: compare liquid funds with historical spending and upcoming bills.
- A protected cash buffer before discretionary allocations.
- Explicitly link a dedicated savings account to a goal and measure the shortfall.
- Income-aware planning using deposit amounts/cadence, with expected income clearly
  distinguished from received deposits.
- Category-wide habit reductions and merchant/day-of-week insights.

These are future features. Credit limits, overdraft facilities, income guarantees
and savings earmarks cannot be inferred just from a reported account balance.
