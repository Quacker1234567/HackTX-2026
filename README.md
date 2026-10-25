# Flow: run on your phone

This guide covers **Expo Go for development** and an **installed Android preview
build**. Firebase stays on the free Spark plan. Nessie requests currently run on
your laptop through Cloudflare.

**Teammates and coding agents:** start with [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)
for architecture, current capabilities, limitations, and a fresh-clone setup.

## What needs to stay running?

| What you are doing | Backend terminal | Cloudflare terminal | Expo terminal |
| --- | --- | --- | --- |
| Expo Go with live Nessie imports | Keep running | Keep running | Keep running |
| Installed Android app with live Nessie imports | Keep running | Keep running | Not needed |
| Installed Android app using saved local demo data | Not needed | Not needed | Not needed |

**An installed app packages the phone UI, not the laptop backend.** Building an
APK does not move the backend to a server. Live Nessie access still requires your
laptop, backend, Cloudflare tunnel, and internet connection. Saved local data can
be viewed without them. Firebase Authentication and Firestore are hosted by Google;
you do not run a separate Firebase terminal.

The two tunnels have different jobs: Cloudflare reaches the Nessie backend;
Expo's `--tunnel` reaches the development app. Neither starts the other.

## One-time prerequisites

- Node.js 22 LTS or newer.
- Expo Go on Android with SDK 58 support. If the installed Expo Go version does
  not support SDK 58, use the installed preview build below.
- Firebase web app configuration for project `hacktx26`, with Anonymous sign-in
  enabled and Firestore created.
- Your existing Nessie sample customer, accounts, and merchants. Do not reseed
  them every time you start the app.
- Cloudflare's tunnel tool. If not installed, run from any folder:

```powershell
winget install --id Cloudflare.cloudflared --exact
```

Open a fresh terminal after installation. From the repository root, install the
project dependencies once, or again after pulling dependency changes:

```powershell
npm install --prefix backend
npm install --prefix mobile
```

Keep these local configuration files:

Create them from the committed templates, from the repository root:

```powershell
Copy-Item backend/.env.local.example backend/.env.local
Copy-Item backend/.env.example backend/.env.hacktx26
Copy-Item mobile/.env.example mobile/.env
```

Only copy templates on a fresh clone; preserve existing configured files.

| File | Contents |
| --- | --- |
| `backend/.env.local` | `NESSIE_API_KEY` (private; backend only) |
| `backend/.env.hacktx26` | `NESSIE_CUSTOMER_ID` and `NESSIE_ALLOWED_UIDS` |
| `mobile/.env` | Firebase public configuration and the current backend tunnel URL |

The mobile configuration uses these names:

```dotenv
EXPO_PUBLIC_FIREBASE_API_KEY=your_firebase_web_api_key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain
EXPO_PUBLIC_FIREBASE_PROJECT_ID=hacktx26
EXPO_PUBLIC_FIREBASE_APP_ID=your_firebase_web_app_id
EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION=us-central1
EXPO_PUBLIC_NESSIE_BACKEND_URL=https://your-current-tunnel.trycloudflare.com
```

Keep your actual configured values. The Nessie key must never appear in a mobile
variable or an APK. Local .env files are ignored by Git.

## Start the banking connection (both run modes)

### Terminal 1: backend

```powershell
cd backend
npm run start:local
```

Wait for `Flow backend ready at http://127.0.0.1:8787`. Leave this terminal open.

### Terminal 2: Cloudflare

Open another terminal, from any folder:

```powershell
cloudflared tunnel --url http://127.0.0.1:8787
```

Leave it open. Copy the printed `https://...trycloudflare.com` address into
`mobile/.env` as `EXPO_PUBLIC_NESSIE_BACKEND_URL`.

**A new Cloudflare process normally gives you a new URL.** When that happens:

- Expo Go: update `mobile/.env`, then restart Expo and scan the new QR code.
- Installed APK: update the URL in the EAS preview environment and build/install
  a new APK. Editing a local .env file does not change an already-installed app.

Keep the same Cloudflare process running while building, installing, and using
an APK that contains its URL. These temporary URLs are best suited to development
and a supervised demo.

## Option A: run with Expo Go

After starting the backend and Cloudflare above, open a third terminal:

```powershell
cd mobile
npx expo start --go --tunnel --clear
```

Scan the QR code in Expo Go. Keep all three terminals running. App-code changes
normally appear through Fast Refresh; environment changes require restarting Expo.

Android's system navigation buttons/gesture strip are configured to hide while
Flow is open and appear temporarily with a swipe from the bottom edge. The app's
Home/Goal/Budget/Settings/Tools tabs remain visible. After installing dependency
changes, restart Expo and reopen the app. Native appearance configuration
requires a new APK for an installed build; verify the behavior on your Android
device.

The main tabs are **Home**, **Goal**, **Budget**, **Settings**, and **Tools**.

- **Home** shows remaining category balances and a saving-goal summary. Category
  cards are display-only and do not open checkout. Bank connection is no longer
  on Home.
- **Goal** leads with the goal name and saved amount; you can edit name, target,
  and duration there.
- **Budget** edits each category limit in place.
- **Settings** is where you connect or open the imported Nessie account, set a
  display name, and toggle hide-balances, purchase alerts, and goal reminders.
  Hide balances covers Home, Goal, Budget, and the Settings bank amount.
  Alerts and reminders stay on this device; Flow does not send push
  notifications yet.
- **Tools** still holds Connections, Banking, purchase testing, and transaction
  history.

In Flow:

1. Open **Settings** and tap the bank card, or go to **Tools → Connections**.
2. On a new installation, tap **Create connection ID**. Add that ID to
   `NESSIE_ALLOWED_UIDS` in `backend/.env.hacktx26`, then restart only the backend
   terminal. Multiple tester IDs can be separated by commas.
3. Tap **Load Nessie accounts** and choose **Flow funded demo checking** for the
   funded sample. The original zero-balance demo account is also preserved.
4. Open **Tools → Banking** to inspect the imported data. Use **Tools → Test a
   purchase** to preview and confirm local spending; Home no longer opens that
   screen. **Tools → Transaction history** lists imported and local activity.

If a process is already running, reuse its terminal; do not start a second copy
on the same port. An EAS cloud build can run while you use Expo Go.

## Option B: build and install the Android app

This is an installable **preview APK**, which runs without Expo Go or an Expo
server. Live banking still uses Terminals 1 and 2 above.

### Configure the cloud build

From `mobile/`, sign into the existing linked Expo project:

```powershell
npx eas-cli@latest login --browser
```

Choose GitHub in the browser if that is how you created your Expo account. The
project is already linked and `mobile/eas.json` already has a preview profile;
do not initialize another EAS project.

In the Expo project's dashboard, open **Environment variables** and add all six
`EXPO_PUBLIC_...` values listed above to the **preview** environment. Use the same
Firebase configuration and the currently running Cloudflare URL. These are public
client settings; never upload the Nessie key as an app environment variable.
Ignored local .env files are not automatically available to the EAS cloud builder.

Ensure the existing `preview` profile in `mobile/eas.json` contains these fields,
while preserving the other profiles:

```json
"preview": {
  "distribution": "internal",
  "environment": "preview"
}
```

### Build and install

Run from `mobile/`:

```powershell
npx eas-cli@latest build --platform android --profile preview
```

Use the existing Android keystore if EAS finds one; allow it to generate one if
this is your first build. Wait for the build to finish, open its installation
link on your Android phone, and install the APK. Android may ask you to permit
installation from that browser.

Launch **Flow** directly from the phone. Do not scan an Expo QR code. You can
close the build terminal once EAS has finished; leave the backend and Cloudflare
running for Nessie access.

The APK has its own app storage and may create a different Firebase connection
ID from Expo Go. Add that new ID to `NESSIE_ALLOWED_UIDS` from **Settings** or
**Tools → Connections**, then restart the backend. Do not remove other testers'
IDs. Device settings (display name, hide balances, alert toggles) stay on that
installation and do not sync.

To include later app-code or environment changes, create and install another
preview build. Over-the-air updates are not configured. A build already in
progress uses its uploaded snapshot, not edits made afterward.

## Stop and restart

Press **Ctrl+C** in a terminal to stop its process. Stopping Cloudflare or the
backend stops live Nessie access in both run modes. Stopping Expo only stops the
Expo Go development session; it does not stop an installed preview APK.

To start a later session, repeat the common banking startup, update the tunnel
URL if changed, then choose Option A or Option B.

## Current demo limits

**New:** [Nessie transaction demo](docs/transaction-demo.md) explains
Tools → Test a purchase, confirmed sandbox writes, retries, and bank refresh.
Restart the backend to load this endpoint. Keep its ignored `.purchase-journal/`
directory across restarts; it also tracks purchases absent from the reported balance.

- Purchases and deposits import from Nessie. The current bill-read endpoint has
  a schema error. Banking offers an explicitly confirmed manual bill list and
  labels it accordingly; budget approval stays blocked until bills are reviewed.
- Checkout confirmation currently changes local demo state. It does not submit
  a new purchase to Nessie or process a real payment. Reach checkout from
  **Tools → Test a purchase**, not from Home category cards. Once a bank is
  imported and a merchant is chosen, checkout defaults to **Send to Nessie**
  and creates a verified sandbox transaction using whole-dollar amounts;
  switch to **Rehearsal only** to practice without writing anything. Review
  resulting reserves in **Tools → Banking**.
- Settings preferences persist only on this device. Hide balances replaces
  dollar amounts with dots; purchase alerts and goal reminders do not send
  notifications yet.
- ESP32 integration is a separate manual Wi-Fi adapter; see [its contract](docs/esp32.md).

For a demo with no laptop terminals, the backend needs a permanent hosted address.
That is a separate hosting change; installing an APK alone does not provide it.

References: [EAS environment variables](https://docs.expo.dev/eas/environment-variables/),
[Android internal distribution](https://docs.expo.dev/build/internal-distribution/),
[Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).
