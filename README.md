# Vault Ledger

A money-transfer app where users hold accounts and send money to each other.

Instead of keeping a "balance" number that gets edited, it records every transfer as two entries in a history: money out of one account and money into another. An account's balance is always added up from that history, so it can't drift out of sync and every rupee can be traced. This is called a **double-entry ledger**, the same idea accountants use.

Built with an Express + MongoDB API and a plain HTML/CSS/JS frontend (no build step).

## Why it's built this way

- **Balances are derived, never stored.** `Account.getBalance()` sums the account's ledger entries. You can recompute any balance from history.
- **The ledger is append-only.** Entries are immutable. Update and delete are blocked at the model level, including `bulkWrite`.
- **Transfers are atomic.** The debit entry, credit entry and transaction record are written in one MongoDB transaction: all of them happen or none do.
- **Safe to retry.** Every transfer carries an `idempotencyKey`. Sending the same key twice never pays twice.
- **Parallel transfers can't overdraw an account.** See [Concurrency](#concurrency-and-the-race-demo).
- **Money enters the system in one place.** A system ("Treasury") user issues initial funds, and its account goes negative by exactly the amount issued, so it always mirrors the total money in the system.
- **Logout really logs out.** Tokens are JWTs backed by a blacklist, so a token is rejected after logout.

## Tech stack

Node.js, Express 5, MongoDB with Mongoose 9, JWT (`jsonwebtoken`), `bcryptjs`, `nodemailer` (Gmail OAuth2). Frontend: vanilla HTML, CSS and JavaScript.

## Project structure

```
server.js                  Entry point: loads env, connects to MongoDB, starts the server
src/
  app.js                   Express app, middleware, routes, error handler
  config/db.js             MongoDB connection
  models/                  user, account, ledger, transaction, token blacklist
  controllers/             auth, account, transaction logic
  routes/                  auth, account, transaction routes
  middlewares/             JWT auth + system-user check
  services/                email service, system (Treasury) user bootstrap
client/
  pages/                   login, register, dashboard, history, privacy
  js/ css/                 frontend code and styles
scripts/race-demo.js       Concurrency demo (see below)
```

## Getting started

### Prerequisites

- Node.js 20.19 or newer (required by Mongoose 9)
- A MongoDB **replica set**. MongoDB transactions don't work on a standalone local `mongod`. The easiest option is a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster.

### 1. Install

```bash
git clone https://github.com/shruti-patel06/Backend-Ledger.git
cd Backend-Ledger
npm install
```

### 2. Configure

Create a `.env` file in the project root:

```env
MONGO_URI=mongodb+srv://<user>:<password>@<cluster>/<database>
JWT_SECRET=<any long random string>

# Treasury user, created automatically on server start
SYSTEM_USER_EMAIL=treasury@example.com
SYSTEM_USER_PASSWORD=<at least 6 characters>
SYSTEM_USER_NAME=Ledger Treasury

# Optional: notification emails (Gmail OAuth2). The app works without these;
# it just logs an error instead of sending email.
EMAIL_USER=
CLIENT_ID=
CLIENT_SECRET=
REFRESH_TOKEN=

# Optional: restrict CORS to your deployed frontend. Unset = any origin allowed.
CLIENT_URL=
```

| Variable | Required | Purpose |
|---|---|---|
| `MONGO_URI` | Yes | MongoDB connection string (must be a replica set) |
| `JWT_SECRET` | Yes | Secret used to sign login tokens |
| `SYSTEM_USER_EMAIL`, `SYSTEM_USER_PASSWORD` | For the demo | Treasury login that can issue funds. Without them, nobody can put money into the system |
| `SYSTEM_USER_NAME` | No | Treasury display name (default `Ledger Treasury`) |
| `EMAIL_USER`, `CLIENT_ID`, `CLIENT_SECRET`, `REFRESH_TOKEN` | No | Gmail OAuth2 for notification emails |
| `CLIENT_URL` | No | Locks CORS to the frontend's URL |
| `PORT` | No | Server port (default `3000`) |

### 3. Run the backend

```bash
npm run dev      # with auto-restart (nodemon)
# or
npm start        # plain node
```

The API runs on `http://localhost:3000`. `GET /` returns a status message.

### 4. Run the frontend

The backend doesn't serve the frontend. Serve the `client/` folder with any static server:

```bash
npx serve client -l 5500
```

Then open **http://localhost:5500/pages/login.html**.

`client/js/config.js` picks the API automatically: on `localhost` or `file://` it uses `http://localhost:3000`. On any other host it uses the deployed backend URL set in that file.

## Try it: your first transfer

New accounts start at ₹0. Money only enters through the Treasury user.

1. Register **Alice** and **Bob** (use a normal window and an incognito window). On each dashboard click **+ New account**.
2. Copy each account's ID with **Copy ID**.
3. Log in as the **Treasury** user (the `SYSTEM_USER_EMAIL` and `SYSTEM_USER_PASSWORD` from your `.env`). Only Treasury sees the **Issue funds** card. Issue ₹1,000 to **Alice's account ID**.
   - Don't send it to Treasury's own account. That nets to zero.
4. Log in as Alice and send some money to Bob's account ID. Bob's balance updates.
5. Try sending more than Alice has. You get a "Not enough balance" error.
6. Open **History** for month-by-month sent/received totals. Click a row for details.
7. Back on Treasury's dashboard, its balance is negative by exactly the amount issued.

## Concurrency and the race demo

A common ledger bug: check the balance, then write the transfer. Two requests that arrive together can both pass the check, and both succeed. Here, the balance check used to run before the database transaction started, which allowed exactly that.

**How it's prevented.** Inside the database transaction, each transfer first updates a `lockVersion` counter on the sender's account, then reads the balance from the ledger, then writes. Two transfers from the same account both write that document, so MongoDB aborts one with a write conflict. The transaction is retried after the other commits, and the retry sees the new balance. No balance is stored: `lockVersion` is a counter, not money.

**Trade-off:** transfers from the *same* account run one at a time. Transfers between different accounts still run in parallel.

### Run it from the terminal

```bash
npm run race-demo            # 20 parallel transfers of ₹100 from an account holding ₹1,000
npm run race-demo -- 50 100  # 50 transfers of ₹100
```

The script runs the real app against a separate throwaway database (`vault_ledger_race_demo`) on the cluster in your `MONGO_URI`. It wipes that database before and after the run, so your app data isn't touched, and no emails are sent.

Output with the fix:

```
Succeeded:              10
Rejected (no balance):  10
Alice's final balance:  ₹0
Bob's final balance:    ₹1000
RESULT: SAFE - exactly the affordable transfers went through, no money created or lost.
```

Before the fix, the same run let 19 of 20 transfers through and left the account at -₹900.

### Run it from the browser

The Send form sends one request per click and checks your on-screen balance first, so it can't create a race. Instead:

1. Give Alice exactly ₹1,000 (see the steps above).
2. On Alice's dashboard, open DevTools (F12), go to the **Console**, and paste this with Bob's account ID:

```js
const fromAccount = document.getElementById("fromAccount").value;
const toAccount = "PASTE_BOBS_ACCOUNT_ID";

const results = await Promise.allSettled(
  Array.from({ length: 20 }, () =>
    apiRequest("/api/transactions", {
      method: "POST",
      body: { fromAccount, toAccount, amount: 100, idempotencyKey: crypto.randomUUID() },
    })
  )
);

console.log("Succeeded:", results.filter(r => r.status === "fulfilled").length);
console.log("Rejected:", results.filter(r => r.status === "rejected").length);
await refreshAll();
```

Expected: **10 succeed, 10 are rejected**, Alice ends at ₹0, Bob at ₹1,000, and History shows exactly 10 transfers. It takes several seconds because the transfers take turns.

## API reference

Authenticated routes take `Authorization: Bearer <token>` (the token is returned by register and login; an `httpOnly` cookie is also set).

### Auth

| Method | Route | Body | Notes |
|---|---|---|---|
| POST | `/api/auth/register` | `name`, `email`, `password` | Returns the user and a token |
| POST | `/api/auth/login` | `email`, `password` | Returns the user and a token |
| POST | `/api/auth/logout` | | Blacklists the token |

### Accounts

| Method | Route | Notes |
|---|---|---|
| POST | `/api/accounts` | Create an account for the logged-in user |
| GET | `/api/accounts` | List the user's accounts |
| GET | `/api/accounts/balance/:accountId` | Balance, calculated from the ledger. Own accounts only |

### Transactions

| Method | Route | Notes |
|---|---|---|
| POST | `/api/transactions` | Body: `fromAccount`, `toAccount`, `amount` (a positive number), `idempotencyKey`. `fromAccount` must belong to the caller |
| GET | `/api/transactions` | History, newest first. Query: `limit` (max 100), `before` (cursor), `accountId` |
| GET | `/api/transactions/summary` | Sent/received totals per month. Query: `tz` (IANA timezone), `accountId` |
| POST | `/api/transactions/system/initial-funds` | **Treasury only.** Body: `toAccount`, `amount`, `idempotencyKey` |

Errors are JSON: `{ "message": "..." }` with 400 (bad input, insufficient balance, inactive account), 401 (missing/invalid/revoked token), 403 (not the system user), 404, or 409 (idempotency conflict).

History uses cursor pagination, so pages stay fast and don't skip or repeat items when new transfers arrive.

## Deployment

The backend and frontend deploy separately:

- **Backend (Render):** build `npm install`, start `npm start`, and add the environment variables above. The server reads `PORT` from the environment. Allow Render's outbound IPs in MongoDB Atlas Network Access (Render has no fixed IP). The free tier sleeps when idle, so the first request after a pause can take 30 to 60 seconds.
- **Frontend (Vercel):** import the repo, set **Root Directory** to `client`, and use the "Other" preset (there is no build step). Set the deployed backend URL in `client/js/config.js`.
- Once the frontend is live, set `CLIENT_URL` on the backend to its URL to restrict CORS.
- Email may not work on free hosting tiers that block SMTP. Transfers still succeed; only the notification fails.

## Known limitations

- Amounts are stored as floating-point numbers. A production ledger would use integer minor units (paise).
- There are no automated tests yet. The race demo above is the executable check for the transfer logic.
- No rate limiting on login and no `helmet` security headers.
- Transaction statuses `FAILED` and `REVERSED` exist in the schema, but nothing produces them yet: there's no reversal endpoint.
- Each transfer sums the sender's whole ledger to get the balance. That's fine at this scale; a cached balance with an atomic guard is the next step for large volumes.
- No password reset or email verification.

## Roadmap ideas

- Tamper-evident ledger (each entry hashes the previous one, plus a verify endpoint)
- Reversals and refunds as new opposite ledger entries
- Real-time balance updates (server-sent events)
- Pay by handle or QR code instead of pasting account IDs
- Multi-currency accounts with an exchange account
