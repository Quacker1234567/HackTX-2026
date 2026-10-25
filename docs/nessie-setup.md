# Connect Nessie to Flow

**Chosen route: free local backend.** Follow [free-backend.md](free-backend.md)
after setting up the app, mock data, and tester UID below. Skip Secret Manager
and Functions deployment; those instructions are only for an optional future
Blaze deployment.

Firebase project: `hacktx26`. Expo/EAS and Firebase are separate projects; EAS
builds the app, Firebase hosts the backend. The integration code is implemented
but is not deployed or live-verified yet. No API key is in the app or repository.

## 1. Configure Firebase for the app

In Firebase Console for hacktx26, register a **web app** even for the Expo mobile
client (we use the cross-platform Firebase JS SDK). Copy its configuration into
`mobile/.env`, following `mobile/.env.example`. Enable **Anonymous** sign-in in
Authentication and create a Firestore database. Restart Expo after changing env
variables; standalone APKs need those variables configured in EAS and a new build.

Open Connections and tap **Create connection ID**. Keep the resulting Firebase UID
for the backend tester allowlist. This is a test-device identity, not a bank login.
Native auth persistence uses AsyncStorage; clearing app data creates a new UID.

## 2. Create mock Nessie data (or use an existing customer)

From the repository root:

```powershell
cd backend
npm install
Copy-Item .env.local.example .env.local
```

Open `backend/.env.local` in your editor and enter your Nessie key locally.
The file is ignored by Git. Do not put the key in mobile/.env, chat, or screenshots.
Run from backend/:

```powershell
npm run seed
```

This writes **mock data** to your Nessie sandbox: one customer, one checking
account, three Austin demo merchants, six payroll deposits, 30 purchases over ten
weeks, and two upcoming bills. The script prints the customer ID, never the key.
Existing data is not deleted. Its local `.seed-state.json` journal resumes completed
steps; keep it. An uncertain write stops the script so retrying cannot silently
duplicate a transaction. Inspect that write in Nessie before resolving the pending
step. Changing keys requires a separate seed journal/dataset.

Alternatively use an existing mock customer ID whose accounts contain history.

## 3. Configure the backend (deployment below is optional)

Copy `backend/.env.example` to `backend/.env.hacktx26`. Set:

```dotenv
NESSIE_CUSTOMER_ID=your_nessie_customer_id
NESSIE_ALLOWED_UIDS=your_firebase_connection_id
```

Add other testers' connection IDs separated by commas. These functions reject all
callers by default and allow only accounts belonging to the configured demo
customer. This integration is for a shared hackathon dataset, not production
bank-account linking.

**For the chosen free route, stop here and follow [free-backend.md](free-backend.md).**

The remaining Secret Manager and deployment commands are optional Blaze-only setup.
For that alternative, from the repository root, sign into Firebase and set the secret:

```powershell
npx firebase-tools@latest login
npx firebase-tools@latest functions:secrets:set NESSIE_API_KEY --project hacktx26
```

Enter the key only at the private terminal prompt. Firebase Functions deployment
requires the Blaze billing plan; do not switch plans or enable billing without
the project owner's agreement. Nothing in the setup script enables billing.

Deploy when the project is ready:

```powershell
npx firebase-tools@latest deploy --only functions:flow,firestore:rules --project hacktx26
```

The repo's firebase.json already selects backend/ as the function source and uses
Node.js 22. Region is us-central1. No Firebase init is needed to overwrite it.

## 4. Use it

Connections → Load Nessie accounts → select account → Banking. Review the
imported balance, categorized history, deposits, weekday spending, and bills.
Set the next payday and desired habits, review the proposed category allocations,
then explicitly approve a new cycle. Approval clears local demo purchases but
retains imported history. New imports do not silently edit approved allocations.

In Tools → Test a purchase, simulate a merchant location to preview its historical median spend.
Enter the actual amount and confirm. Checkout is currently **local simulation**:
it does not POST purchases back to Nessie or process payments. Refreshing bank
data marks an approved plan for review; it does not overwrite it.

## Calculation and API details

- Account balance is taken as the already-settled starting balance. Historical
  purchases are not subtracted again; historical deposits are not added again.
- Pending/recurring bills due before the selected payday are reserved once.
  Missing or overdue bill dates block approval until corrected.
- Goal reserve is the required daily saving pace times the days to payday, capped
  at the remaining goal. This reserves money; it does not transfer savings.
- Category pacing uses a 90-calendar-day window of completed purchases. Protected
  categories get their historical pace first, dining reduction applies if dining
  is not protected, other categories scale to fit, and surplus stays in Other.
- Nessie amounts are interpreted as dollars and converted to integer cents at
  the backend boundary. Verify the first seeded balance and $35 purchase against
  the dashboard before relying on this with a different sandbox deployment.
- Backend origin is `https://prod-api.nessieisreal.com`, authenticated with the
  documented `key` query parameter. URLs and upstream error bodies are never
  logged or returned because they might contain credentials.
- Current docs use `transaction_date`; the older official purchase SDK uses
  `purchase_date`. The reader accepts both. Account purchase-list/create routes
  are documented by the official SDK but missing from the current Swagger list;
  live verification with your key remains necessary. Required endpoint failures
  abort an import and retain prior local data. No fallback silently pretends the
  history is empty. Merchant failures are labeled and block plan approval.

Sources: [Nessie docs](https://prod.nessieisreal.com/docs),
[official purchase SDK](https://github.com/nessieisreal/nessie-javascript-sdk/blob/master/lib/purchase.js),
[Firebase callable functions](https://firebase.google.com/docs/functions/callable),
[Firebase secrets](https://firebase.google.com/docs/functions/config-env).

## Checks

Run `npm test` in backend/. In mobile/, run `npm test`, `npm run typecheck`,
`npm run lint`, and `npx expo export --platform android`.


