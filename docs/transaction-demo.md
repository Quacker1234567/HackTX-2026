# Nessie transaction demo

Checkout can write a real purchase to the Nessie sandbox, or stay entirely on
the device in **Rehearsal only** mode. The visual design is unchanged.

## Run the demo

1. Restart the local backend from `backend/` with `npm run start:local`. An older
   running process will not have the new `nessiePurchase` endpoint.
2. Keep its Cloudflare tunnel running. If the tunnel URL changed, update the
   mobile `.env` and restart Expo as described in README.
3. Open Flow in Expo Go on Android. In Tools → Connections, import **Flow funded
   demo checking**. Reuse the existing Firebase connection ID and allowlist.
4. If using an approved plan, review it in Tools → Banking after a new import.
   Confirm the complete bill list if the sandbox bill reader is unavailable.
5. Open **Tools → Test a purchase**, choose **Campus Cafe**, leave the mode on
   **Send to Nessie**, and enter a whole-dollar amount your category can cover
   (for example, $1 to keep a live check cheap).
6. Tap **Preview purchase**, inspect the cutout and category remainder, then
   **Confirm Nessie purchase**. Only this final button submits the sandbox write.
7. A successful result verifies the stored transaction, refreshes bank data and
   reduces the local category once. Check Home and Tools → Transaction history.
   Imported history and the local receipt are deduplicated by the Nessie ID.

A fresh device still starts with demo allocations. Importing a bank does not
silently approve category limits. Use Banking to generate and explicitly approve
an account-based plan when demonstrating allocation calculations.

## Live sandbox observations (October 24, 2026)

- A $0.01 smoke test was saved upstream as $0.00. Fractional-dollar submissions
  are now blocked before writing; internal app amounts remain integer cents.
- A subsequent $1 Campus Cafe purchase was verified in the funded account's
  history. Replaying its operation returned the same purchase, with one record.
- Nessie’s reported balance remained $5,984.00 after that $1 purchase. The backend
  therefore tracks verified Flow debits not reflected in the reported balance.
  Planning subtracts this separate reserve once; the displayed bank balance stays
  the actual reported value. Do not subtract all imported history again.
- Both smoke records were retained. No original history, customer, merchant,
  account, or bill was deleted or recreated.
- The successful $1 receipt held a $1 unreflected-balance reserve in this laptop’s
  private purchase journal. The journal is not shared by Git.

## Live reconciliation check (October 25, 2026)

The $1 debit above was reviewed as **rehearsal** against the live sandbox, which
exercised `nessieReconcile` end to end for the first time:

- The reserve went from $1.00 to $0.00 and the outstanding list emptied.
- The purchase ID is now reported in `voidedPurchaseIds`, so it no longer informs
  90-day category pacing.
- The upstream record is intact at $1.00 and the account still holds 32
  purchases. Nothing was deleted from Nessie.
- Repeating the review is idempotent: the reserve stays released and no second
  write occurs.
- The journal entry predates the key-from-filename change and was read correctly
  with no migration, confirming older records stay compatible.

This laptop's journal currently has no outstanding reserves. The $0.01 smoke
record remains unverified and has never reserved funds.

If a later reported balance changes while those reserves remain, planning warns
for journal review rather than guessing whether the debits settled.

## Releasing a reserve

**Tools → Banking** lists verified Flow purchases awaiting review under
*Flow purchases awaiting review*. Each one offers two outcomes:

- **Settled in balance** — the reported balance now accounts for it. The reserve
  is released and the purchase keeps informing 90-day category pacing.
- **Rehearsal — ignore** — practice data. The reserve is released and the ID is
  returned in `voidedPurchaseIds`, so `analyzeHistory` stops counting it toward
  category pacing.

Neither outcome deletes or alters the Nessie record, and both re-check account
ownership on the backend. Reviewing is idempotent and can be reclassified.
Releasing a reserve changes available funds, so approve a fresh plan afterwards.

The better habit is to avoid creating reserves you do not want: checkout's
**Rehearsal only** mode never contacts Nessie.

## Recovery and limits

Before POST, the backend creates an exclusive on-disk request claim. Retries of
that request read its saved outcome and/or search the upstream transaction marker;
they do not automatically POST again. The mobile app saves the pending request
before submission and the receipt before updating the budget. Persistence writes
are serialized; replaying a saved receipt cannot charge the category twice.

If the result is uncertain, use **Check saved purchase**, keeping the same ID.
Do not clear app storage, delete the journal, or start a replacement request to
work around an uncertain outcome. A mismatched upstream amount/status is held
for review and never presented as a successful local charge.

Keep `backend/.purchase-journal/` on the same backend laptop. It contains no API
key, but its private operation records must not be committed or discarded.
Use one backend/journal for the shared demo. Other laptops/clones cannot infer
which previously created Flow purchases the sandbox balance failed to reflect.
The current endpoint is local-only; Firebase Functions deployment would need a
shared durable journal implementation before exposing purchase writes.

## Device verification (October 25, 2026)

The complete flow was exercised from Expo Go on Android, through the Cloudflare
tunnel and the authenticated callable path:

- A rehearsal purchase changed the device budget and sent nothing to Nessie.
- A $1 Campus Cafe purchase was created and verified from the phone, taking the
  account from 32 to 33 purchases.
- Banking showed its $1 reserve, and **Rehearsal — ignore** released it back to
  $0.00 from the device.

This closes the previous gap: the phone's full authenticated HTTP flow for both
purchase creation and reconciliation is now live-tested, not just the backend.

## Contract for the UI teammate

`mobile/src/services/banking.ts` exports:

- `createNessiePurchase({ requestId, firebaseUid, accountId, merchantId, amountCents })`.
- Outcomes: `created` (verified receipt plus optional refreshed snapshot),
  `uncertain`, `rejected`, or `mismatch`.
- The request ID must remain unchanged for retries, and the original Firebase
  identity must be preserved. Do not call this service directly from new UI: use
  the `useNessiePurchase` hook, which owns the durable pending request, the
  recovery of a saved receipt, and the one-at-a-time request guarantee.
- `BudgetProvider.applyNessiePurchase(transaction, snapshot)` persists the receipt
  and bank refresh while preventing duplicate category charges.
- `BankSnapshot.unreflectedPurchaseCents` is a separate planning reserve, not a
  replacement bank balance. Domain proposal logic subtracts it exactly once.

Checkout owns both paths now; the separate Nessie purchase screen was removed
because it duplicated the same hook. Hardware updates and real geolocation are
separate work.
