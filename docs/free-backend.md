# Free local backend (chosen for this hackathon)

Keep hacktx26 on Spark. Do not run Firebase secret-manager or Functions deployment
commands: those require Blaze. Firebase Authentication and the existing Firestore
setup remain in use; the Nessie requests run on your laptop instead.

The backend verifies real Firebase ID tokens using Google's public certificates,
then applies the same configured tester UID allowlist and demo-customer ownership
checks as the Firebase functions. No service-account credential is required for
this verification. The Nessie key stays in backend/.env.local, ignored by Git.

## Start the local service

Keep backend/.env.hacktx26 with NESSIE_CUSTOMER_ID and NESSIE_ALLOWED_UIDS.
Keep backend/.env.local with NESSIE_API_KEY. From backend/:

```powershell
npm install
npm run start:local
```

It prints `Flow backend ready at http://127.0.0.1:8787`. Keep it running.

## Connect a phone through a free HTTPS tunnel

Install Cloudflare's official tunnel tool if needed:

```powershell
winget install --id Cloudflare.cloudflared --exact
```

Open a new terminal after installation. Run:

```powershell
cloudflared tunnel --url http://127.0.0.1:8787
```

No Cloudflare account or payment is needed for a Quick Tunnel. Copy the printed
HTTPS trycloudflare.com address. Add it to mobile/.env:

```dotenv
EXPO_PUBLIC_NESSIE_BACKEND_URL=https://your-generated-address.trycloudflare.com
```

The URL is public configuration, not a key. All banking routes require a verified
Firebase token and an allowed connection ID. Only /health is public and returns
no data. The service binds to localhost; the tunnel exposes that service only.

Restart Expo from mobile/ with `npx expo start --go --tunnel --clear`. Open
Connections → Load Nessie accounts → choose an account. Authentication/Firestore
still use real Firebase. The new backend URL replaces only the callable-functions
origin. This HTTPS backend tunnel is separate from Expo's development tunnel.

Keep all three terminals running: local backend, Cloudflare tunnel, Expo.
The tunnel URL changes after a restart: update mobile/.env and restart Expo.
A standalone APK needs this setting included in its build; an existing APK won't
pick up local .env edits. For development, use Expo Go. Your existing EAS build
can continue while these local processes run.

Nothing is deployed to Firebase Functions and no billing is enabled. This is a
development/demo setup: the backend stops when your laptop or tunnel stops.

Live sandbox check: seeded purchases and deposits are readable. The current
Nessie bill reader returns a validation error for missing `recurring_date` and
`upcoming_payment_date`; its update schema rejects upcoming_payment_date. Imports
show this as incomplete bill data and block budget approval until the user enters
and explicitly confirms the complete bill list in Banking. That local list is
labeled manually entered; it is not presented as live Nessie data. Re-importing
Nessie data requires reviewing the bill list again. The seeded account
also reports a zero balance; the app displays that actual value rather than
inventing funds. These sandbox-data issues need resolving before a funded
budget-plan demo, but do not require paid Firebase hosting.

References: [Firebase ID-token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens),
[Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

