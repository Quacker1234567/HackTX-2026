# Flow — teammate and agent handoff

Updated: October 24, 2026. Read this before changing the project.
This is a working hackathon prototype, not a production banking integration.

## Product and current direction

Flow is a visual budgeting app for the Capital One “Best Use of Nessie” track.
Its main idea is to show the effect of a purchase before the user commits, on an
Android phone and eventually a small ESP32-connected screen.

The agreed stack is Expo/React Native, Firebase, Nessie sandbox data, and ESP32
communication over Wi-Fi. Android is the primary target, with web kept as a
fallback. The UI follows the supplied wallet-app reference: cool gray background,
white rounded cards, thin blue progress bars, and a floating five-item navigation
bar (Home, Goal, Budget, Settings, Tools). Blue/navy and red come from the
Capital One direction. Keep Home focused on remaining balances; ordinary
preferences belong in Settings; development controls belong in Tools.

Android system navigation is hidden using SDK 58's `expo-navigation-bar`; users
can swipe from the bottom edge to reveal it temporarily. The app's own tabs stay
visible. Native plugin settings remove the contrast scrim and use dark system
buttons over the light app background. Check this on physical Android after a
reload/rebuild; browser previews cannot verify the system bar.

## What works now

- **Home:** remaining category balances and progress (display-only; cards no
  longer open checkout), a saving-goal summary, and a title that uses the
  display name when one is set. Bank connection is no longer on Home.
- **Goal:** name-first view of saved amount, remaining days, and required daily
  pace; edit name, target, and duration. Saving a goal does not transfer money
  or automatically approve a plan.
- **Budget:** edit each category limit in place. Limits cannot fall below
  spending already committed or exceed an approved plan’s funds after bills
  and savings.
- **Settings:** open the imported Nessie account or start a connection, set a
  display name, and toggle hide-balances / purchase-alerts / goal-reminders.
  Preferences persist on this device. Hide balances covers Home, Goal, Budget,
  and the Settings bank amount. Alerts and reminders are stored only; Flow
  does not send push notifications yet.
- **Tools → Connections:** create a Firebase anonymous connection ID, load Nessie
  accounts, import one account’s snapshot, manually save a Firestore snapshot,
  and manually send a Dining budget payload to an ESP32 endpoint.
- **Tools → Banking:** balances, imported history analysis, weekday spending,
  income patterns, bills, habit preferences, and budget-proposal review/approval.
- **Tools → Test a purchase:** simulated merchant location, median historical
  spending estimate when available, estimated/actual cutout, and explicit local
  purchase confirmation. Confirmed spending updates the local budget once.
- **Tools → Transaction history:** imported purchases/deposits and local confirmed
  purchases, with source filters and status labels.
- Budget state and device settings are saved on the device with AsyncStorage
  (separate keys). Imported history remains available after the backend stops.
  Firestore saving is manual; there is no automatic cloud restore or
  cross-device synchronization flow yet. Settings do not sync.

The project owner has successfully imported live Nessie sandbox purchasing history
through the local backend and tunnel. The Android-focused UI was checked at phone
viewport sizes in a browser and successfully bundled for Android. This does not
substitute for checking the latest UI on a physical Android device.

## Architecture and file map

```text
Android app / Expo Go
  ├─ AsyncStorage: local budget, imported snapshot, local purchase history,
  │                and device settings
  ├─ Firebase Authentication: anonymous identity and ID token
  ├─ Firestore: manual per-user snapshot upload
  ├─ HTTPS Cloudflare tunnel → laptop backend on 127.0.0.1:8787
  │                            ├─ verifies Firebase token and tester UID
  │                            └─ calls Nessie with private API key
  └─ Wi-Fi POST /budget → ESP32 (firmware still to implement)
```

- `mobile/src/app/_layout.tsx`: navigation and Android-safe bottom spacing.
- `mobile/src/app/index.tsx`, `goals.tsx`, `budget.tsx`, `settings.tsx`,
  `tools.tsx`: main tabs.
- `mobile/src/app/banking.tsx`, `connections.tsx`, `checkout.tsx`,
  `transactions.tsx`: testing/detail screens reached from Tools. Settings
  also links to Connections or Banking when a bank card is tapped.
- `mobile/src/components/ui.tsx`, `design.tsx`: shared visual tokens and controls.
- `mobile/src/state/BudgetProvider.tsx`: device persistence for budget and
  settings, plus budget mutations.
- `mobile/src/domain/budget.ts`: local purchase, allocation, money, hidden
  money display, and goal logic.
- `mobile/src/domain/settings.ts`: display name and preference parsing.
- `mobile/src/domain/banking.ts`: snapshot types, history analysis, estimates,
  manual bill review, and budget proposal calculations.
- `mobile/src/services/`: Firebase, banking callable client, ESP32 adapter.
- `backend/src/nessie.mjs`: Nessie HTTP adapter, schema normalization, ownership
  checks, and credential-safe errors.
- `backend/src/index.mjs`: authenticated callable handlers.
- `backend/src/local-server.mjs`: local server for the callable protocol.
- `backend/scripts/start-local.mjs`: starts the selected free backend route.
- `backend/scripts/seed.mjs`: resumable sandbox customer/account/history creation.
- `backend/scripts/fund-demo.mjs`: separate funded demo account creation based on
  the original seed journal; not a routine startup command.
- `firestore.rules`: users may access only their own budget document path.
- `docs/esp32.md`: device payload and endpoint contract.
- `docs/free-backend.md`: free backend operation.

## Fresh clone: choose a development mode

Node.js 22 is the backend target. Install from the committed lockfiles, from the
repository root:

```powershell
npm ci --prefix mobile
npm ci --prefix backend
```

There is no root package.json: run app commands in `mobile/`, backend commands
in `backend/`, or use `npm --prefix` as shown above.

### UI-only development

```powershell
cd mobile
npx expo start --go --tunnel --clear
```

Open the QR code in a compatible Expo Go on Android. The starter budget and local
purchase simulation work without configuring Nessie or Firebase. Cloud actions
require configuration. Each fresh installation starts with its own local demo
state; cloning Git does not copy the project owner’s phone data.

If dependencies changed, install them before restarting Expo. Follow
`mobile/AGENTS.md`, especially its SDK-specific documentation instructions.
Expo SDK 58 is declared in `mobile/package.json`; do not downgrade or change the
SDK merely to work around an unrelated connection problem.

### Live Nessie development

On a fresh clone, copy these templates once:

```powershell
Copy-Item mobile/.env.example mobile/.env
Copy-Item backend/.env.example backend/.env.hacktx26
Copy-Item backend/.env.local.example backend/.env.local
```

Get the shared Firebase public app configuration, Nessie customer ID, and the
chosen backend setup from the project owner through the team’s private channel.
If running your own backend, obtain an authorized Nessie key privately. Do not
paste secrets into agent chats, commits, screenshots, or mobile configuration.

- `mobile/.env`: Firebase public client values and the HTTPS backend URL.
- `backend/.env.hacktx26`: Firebase project ID, Nessie customer ID, and a
  comma-separated allowlist of Firebase tester UIDs.
- `backend/.env.local`: private `NESSIE_API_KEY` only.

Firebase project: `hacktx26`. Anonymous sign-in and Firestore are configured for
the current project. A separate Firebase project requires its own setup and rules.

Run `npm run start:local` from `backend/`. In another terminal, run:

```powershell
cloudflared tunnel --url http://127.0.0.1:8787
```

Put its HTTPS URL in `EXPO_PUBLIC_NESSIE_BACKEND_URL` in `mobile/.env`. Restart
Expo after changing environment values. The temporary tunnel URL usually changes
when the tunnel restarts. Expo’s development tunnel and Cloudflare’s backend
tunnel are separate processes with different jobs.

Start from **Settings** (bank card) or **Tools → Connections**, then create a
connection ID. The owner of the backend you are using must add that UID to its
`NESSIE_ALLOWED_UIDS` and restart that backend. Then load accounts and select
the desired sample account. Preserve other testers’ UIDs. Expo Go and an
installed APK may have different identities.

Teammates may use one shared running backend/tunnel instead of each hosting one.
That backend’s laptop and tunnel must stay running, and its allowlist must contain
each tester. An unconfigured backend URL falls back to Firebase callable Functions;
those Functions are not the currently deployed route, so set the URL for live use.

## Shared services and demo data

- Firebase remains on the **free Spark plan**. The current Nessie service is local;
  Secret Manager/Functions deployment requires a separate Blaze decision. Do not
  enable billing as a setup shortcut.
- The app is already linked to an EAS project in `mobile/app.json`. Coordinate
  access with the owner; do not run `eas init` or overwrite the project ID.
- Use the existing Nessie customer for the shared demo. The original seed creates
  a customer, checking account, three merchants, six deposits, 30 purchases, and
  two bills. A separate “Flow funded demo checking” account was also prepared;
  the original account is preserved.
- **Do not run seed or funding scripts just to launch a clone.** They write shared
  sandbox data. Their ignored local journals are required for safe resumption;
  a clone does not contain those journals. For a separate customer, coordinate a
  separate key/dataset/journal and update the backend configuration explicitly.
- Firebase/EAS project IDs and Firebase web config are public client identifiers;
  they do not grant collaborator permissions. Never share service-account keys,
  Nessie keys, signing credentials, or local seed journals in Git.

## Rules for money and data

All internal amounts are integer cents; Nessie dollars are normalized at the
backend boundary. Do not subtract imported history from the current bank balance
again or add historical deposits to it again.

Budget proposals reserve upcoming bills and savings once, then allocate the
remainder. Completed spending in a 90-day window informs category pacing. The
protected category and dining-reduction preference affect allocations. Users
explicitly approve proposals; imports do not silently replace approved budgets.
A new imported snapshot or elapsed payday makes checkout require plan review.
Goal changes currently need a separately reviewed proposal to affect allocations.

Missing bills are **unknown obligations**, not zero obligations. The current
Nessie bill reader has returned schema errors. The app labels that import as
incomplete and blocks plan approval until the user reviews and explicitly confirms
a complete manual bill list. Those manually entered bills are local planning data,
not bills written to Nessie.

## Known gaps and sensible next work

1. **Check on Android:** run the latest UI on a real device; verify keyboard,
   system back navigation, small screens, and the complete import/demo flow.
2. **Nessie transaction writes:** checkout currently updates local state only.
   Implement an authenticated backend purchase endpoint, explicit confirmation,
   account/merchant validation, duplicate-write protection and reconciliation
   before labeling checkout as a Nessie transaction. Test against the sandbox.
3. **ESP32 firmware:** implement the documented Wi-Fi endpoint and display. Sending
   Dining manually is implemented; automatic updates, preview synchronization,
   device-button confirmation and presence detection are not. Verify Android LAN
   HTTP restrictions on the actual build before promising hardware connectivity.
4. **Reliable demo hosting:** temporary Cloudflare URLs are fragile for an APK.
   A stable hosted backend or stable tunnel address is future work; coordinate
   hosting and cost choices. Building an APK does not host the backend.
5. **Planning polish:** resolve Nessie bills upstream where possible, review goal
  changes against approved plans, and verify transaction/income reconciliation
  once remote writes exist. Real geolocation is not implemented; locations are
  simulated selections. Purchase-alert and goal-reminder toggles are stored
  preferences only; they do not send notifications.
6. **Persistence polish:** add a deliberate cloud restore/sync flow if needed;
  current anonymous identities and manual Firestore snapshots are not account
  recovery. Handle conflict/reimport behavior explicitly. Device settings stay
  local with the budget.

Split work across files where possible: UI/navigation, Nessie/backend, ESP32
firmware, or Android verification are useful parallel team ownership areas.
Agree on payloads and state transitions before multiple agents change them.

## Validation and builds

From `mobile/`:

```powershell
npm test
npm run typecheck
npm run lint
npx expo export --platform android
```

From `backend/`:

```powershell
npm test
```

At handoff: 13 mobile tests and 8 backend tests passed; mobile lint/type checking
and Android export passed. Core preview flows checked: goal save, valid/invalid
in-place allocation save, purchase preview/confirmation, history, Settings
display name and hide-balances, and Tools navigation. Home category cards are
display-only; checkout is reached from Tools. ESP32 firmware and the redesigned
UI on physical Android remain unverified.

For an installed Android APK, follow README’s EAS preview instructions. Configure
all public client environment values in EAS; ignored local .env files are not a
team configuration mechanism. An installed APK embeds its backend URL and does
not pick up laptop .env changes; OTA updates are not configured.

The frontend-design skill used for the current UI lives outside this repo on the
project owner’s machine. Other agents must not assume it is installed. The design
direction above and the existing components are the shared reference.

## Prompt to give your coding agent

“Read AGENTS.md and PROJECT_CONTEXT.md, then README.md and the relevant directory
instructions. Explain the current flow briefly, inspect the code for my assigned
task, and implement it without changing shared sandbox data, enabling billing, or
exposing credentials. Preserve existing money and authentication safeguards. Run
the checks relevant to your changes and state what still needs device testing.”
