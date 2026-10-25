# Flow backend

The selected hackathon setup is the free local service. Firebase Authentication
and Firestore use project `hacktx26`; Nessie calls run on a laptop through an
HTTPS Cloudflare tunnel. No Firebase Functions deployment is required.

Start with [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md) for architecture and a
fresh clone, then [README.md](../README.md) for Expo Go and Android build setup.
Copy `.env.local.example` to `.env.local` and `.env.example` to `.env.hacktx26`,
fill them privately, and run `npm run start:local` here.

`src/index.mjs` exposes `nessieAccounts` and `nessieSnapshot` callable handlers.
The local server verifies Firebase ID tokens and the tester UID allowlist. The
Nessie adapter enforces configured-customer account ownership, normalizes dollars
to cents, deduplicates history, and keeps credentials out of errors.

The owner has imported sandbox purchasing history through this local route.
Unavailable bill data is explicitly marked incomplete; see the context file for
manual review and planning limitations. Purchase confirmation is currently local
app simulation and does not write a new Nessie transaction.

The local server now also exposes `nessiePurchase`, with a durable disk journal,
verified receipts and balance reserves for sandbox purchases. This write endpoint
is not deployed to Firebase Functions. See [the demo guide](../docs/transaction-demo.md).

`seed.mjs` and `fund-demo.mjs` write shared sandbox data and use private local
journals. Do not run them as ordinary startup steps after cloning.

Run `npm test` here. Optional Firebase callable deployment remains in the source,
but requires separate paid-plan configuration; see the optional deployment section
in [nessie-setup.md](../docs/nessie-setup.md).
