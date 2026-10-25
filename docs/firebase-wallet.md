# Firebase hardware bridge

Flow integrates the provided smart-wallet firmware through **Realtime Database direct mode**. Firestore remains the optional cloud budget snapshot store. No Cloud Functions or new Nessie customer are needed.

## Configuration

The public app settings are:

```dotenv
EXPO_PUBLIC_FIREBASE_DATABASE_URL=https://hacktx26-default-rtdb.firebaseio.com
EXPO_PUBLIC_WALLET_DEVICE_ID=wallet-001
```

Keep the existing Firebase app settings and Nessie backend URL. No Wi-Fi password, device password, Nessie key or service-account credential belongs in mobile code or committed files. The device credentials remain in the firmware's ignored secrets file. Its database URL must be a plain HTTPS string, not a Markdown link.

The imported sample remains Alex Rivera / Flow Student Checking. Purchasing history runs through October 25, 2026. New hardware purchases use the backend's current date; heartbeat and event timestamps always use real time. Do not backdate Firebase events to match a historical demo month.

## Ownership and rules

There are two Firebase Auth users:

- The **owner** is Flow's existing anonymous connection ID, already allowed by the Nessie backend.
- The **device** is the existing separate ESP32 email/password user. Never sign the mobile app in as the device.

In Realtime Database, `deviceAccess/wallet-001/ownerUid` must match Flow's connection ID. Keep `deviceUid` set to the ESP32 user. Changing ownerUid removes access for the previous app owner. Do not change ownership without coordinating with the hardware teammate.

`hardware/database.rules.json` is the ZIP's direct-mode rule set. It is prepared locally, not automatically deployed. If wallet paths already exist, compare/merge existing rules first; deploying this complete file replaces the current Realtime Database rules (it does not replace Firestore rules). Use only the direct-mode app bridge. Do not also deploy the ZIP's handleDeviceEvent function: it independently changes budget balances and could race the app's authoritative update.

Ownership was relinked to Flow’s existing allowed Firebase UID on October 25, 2026. The device UID was verified unchanged; the owner lookup was moved to Flow. Device credentials were not saved to this repository. Database rules have not been deployed by this integration.

## Card mapping

| NFC UID | Flow category | Nessie merchant | Amount |
| --- | --- | --- | --- |
| 04A1B2C3 | dining | Campus Cafe Restaurant | $12 / 1200 cents |

The incoming `food` / $12.50 example has been adapted to the app's Dining category and supported whole-dollar amount with user approval. Actual device previews must show Dining and $12 before confirmation. Flow publishes this table to the device; do not retain the old table. The adapter rejects a confirmation with the old `food` category or 1250-cent price.

All four funded categories use the actual approved limits and this calendar month's spending, not the seed's stored spent values. Negative remaining amounts are preserved; zero-limit categories are omitted because firmware requires positive totals. Cards are omitted while the selected checking account lacks a current approved plan, has import warnings, or cannot cover the price.

## Run the demo

1. Keep the existing local Nessie backend and Cloudflare tunnel running. Import Flow Student Checking and apply the budget in Insights.
2. Restart Expo after updating environment settings. Open **Tools → Connections → Firebase wallet → Connect wallet**.
3. Power the ESP32 and connect it to Wi-Fi. The screen and card table receive the current budget. “Connected to Firebase” is separate from a recent ESP32 heartbeat; check **Device online**.
4. Tap card 04A1B2C3 and verify Dining / $12 in the preview. Hold the hardware button to confirm.
5. Flow must remain open/connected to receive the event and call Nessie. After backend verification, it adds the receipt once and replaces the wallet budget with the authoritative app values. The firmware's local optimistic deduction is never subtracted again.
6. If a refreshed bank snapshot makes the plan stale, review/apply again in Insights before the next purchase. New cards are withheld until review. Use **Retry saved wallet purchase** for an uncertain request; do not clear app storage or the backend purchase journal.

Connecting is explicit each app session. The listener persists across Flow tabs. Disconnecting removes listeners; it does not delete the device or transaction history. The last display may remain on the ESP32 while the app is closed. Hardware confirmation is not proof that Nessie accepted the purchase; the app's verified receipt is the authoritative result.

## Delivery and recovery

The bridge checks ownership before publishing or listening. It listens from a persisted activation checkpoint, rather than a five-minute window that would lose confirmations while the app is closed. Requests and receipts are saved locally before posting/applying. A hardware event produces the same request ID across restarts (`hw_<device>_<boot>_<sequence>`); the existing backend journal prevents another Nessie POST for the same request. Journal state is scoped to owner and device and retains the original checking account. Replayed receipts are applied idempotently by Nessie purchase ID.

Pending phone purchases and account switches block new hardware settlement. Invalid/stale card confirmations are rejected and the app republishes its budget to undo optimistic display changes. Requests with uncertain outcomes remain recoverable; the app will not silently charge a different amount or a different account.

## Validation status

Pure adapter/processor tests cover category mapping, cents, duplicate/restart recovery, saved receipts, failed storage writes, stale plans, phone-purchase blocking and account switches. These are local tests, not a physical NFC test. Ownership, deployed database rules, physical previews, heartbeat, and one end-to-end Nessie transaction must be verified with the device connected before claiming the demo is complete. No live purchase is created as part of setup.
