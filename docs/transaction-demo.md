# Nessie transaction demo — mike-branch

This adds backend behavior and a separate Tools screen. The original local
checkout simulator and the main visual design are preserved for the UI teammate.

## Run the demo

1. Restart the local backend from `backend/` with `npm run start:local`. An older
   running process will not have the new `nessiePurchase` endpoint.
2. Keep its Cloudflare tunnel running. If the tunnel URL changed, update the
   mobile `.env` and restart Expo as described in README.
3. Open Flow in Expo Go on Android. In Tools → Connections, import **Flow funded
   demo checking**. Reuse the existing Firebase connection ID and allowlist.
4. If using an approved plan, review it in Tools → Banking after a new import.
   Confirm the complete bill list if the sandbox bill reader is unavailable.
5. Open **Tools → Nessie purchase**, choose **Campus Cafe**, and enter a whole-dollar
   amount your category can cover (for example, $35 if at least $35 remains).
6. Tap **Preview Nessie purchase**, inspect the amount/category remainder, then
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
- The successful $1 receipt has a $1 unreflected-balance reserve in this laptop’s
  private purchase journal. The journal is not shared by Git.

If a later reported balance changes while those reserves remain, planning blocks
for journal review rather than guessing whether the debits settled. A future
settlement/reconciliation workflow is separate work.

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

The physical Android confirmation/refresh flow still needs a device check.
Backend behavior was live-checked directly with the private sandbox key; this is
not a claim that the phone’s full authenticated HTTP flow was live-tested.

## Contract for the UI teammate

`mobile/src/services/banking.ts` exports:

- `createNessiePurchase({ requestId, firebaseUid, accountId, merchantId, amountCents })`.
- Outcomes: `created` (verified receipt plus optional refreshed snapshot),
  `uncertain`, `rejected`, or `mismatch`.
- The request ID must remain unchanged for retries, and the original Firebase
  identity must be preserved. New UI should retain the durable pending request
  and receipt behavior shown in `nessie-purchase.tsx`.
- `BudgetProvider.applyNessiePurchase(transaction, snapshot)` persists the receipt
  and bank refresh while preventing duplicate category charges.
- `BankSnapshot.unreflectedPurchaseCents` is a separate planning reserve, not a
  replacement bank balance. Domain proposal logic subtracts it exactly once.

The existing Test a purchase route continues to be purely local. Hardware
updates and real geolocation are separate work.
