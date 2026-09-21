# Deploying Backend Ledger

Two separate deployments: the Express API (backend) and the static
frontend (`client/`). Both are deployed as separate Vercel projects
pointing at this one GitHub repo.

## 1. Push to GitHub

Push this branch (or merge it) so Vercel has something to import.

## 2. Deploy the backend

1. On vercel.com: **Add New → Project**, import this repo.
2. **Root Directory**: leave as the repo root (`.`).
3. **Framework Preset**: "Other" — no build step needed.
4. Add these environment variables (Project Settings → Environment Variables):
   - `MONGO_URI` — your MongoDB Atlas connection string
   - `JWT_SECRET` — any long random string
   - `EMAIL_USER`, `CLIENT_ID`, `CLIENT_SECRET`, `REFRESH_TOKEN` — Gmail
     OAuth2 creds for nodemailer. Optional: `sendEmail` catches its own
     errors, so a missing/invalid value logs an error and the app keeps
     working — registration and transfers still succeed, you just won't
     get notification emails.
   - `CLIENT_URL` — the frontend's URL. You won't have this yet on the
     first deploy; leave it unset for now (CORS falls back to allowing
     any origin) and add it in step 5.
5. Deploy. Note the resulting URL, e.g. `https://backend-ledger-api.vercel.app`.

This works because `api/index.js` exports the Express app, and it's a
valid Vercel serverless function since an Express app is just a
`(req, res) => {}` handler. `vercel.json` rewrites every incoming path to
that one function, so Express's own router (which already expects paths
like `/api/auth/login`) still does the real routing.

## 3. Point the frontend at the backend

Edit `client/js/config.js`:

```js
const API_BASE_URL = "https://backend-ledger-api.vercel.app"; // your backend URL from step 2
```

Commit and push this change.

## 4. Deploy the frontend

1. On vercel.com: **Add New → Project**, import the same repo again.
2. **Root Directory**: `client`.
3. **Framework Preset**: "Other" — static files, no build step.
4. Deploy. Note the resulting URL, e.g. `https://backend-ledger.vercel.app`.

## 5. (Optional) lock down CORS

Back in the backend project's environment variables, set `CLIENT_URL` to
the frontend's URL from step 4, and redeploy. This restricts the API to
requests from your frontend instead of any origin. Safe to skip for a demo.

## 6. Seed test funds

New accounts start at a balance of 0 — there's no self-service faucet, by
design (see `NOTES.md`). To test a transfer end to end:

1. Register **User A** and **User B** on the deployed frontend.
2. For each, click **+ New Account** once on their dashboard.
3. In MongoDB Atlas's UI (Browse Collections → `users`), open User A's
   document and add `"system": true` to it. Takes effect immediately —
   the JWT only carries the user ID, so no re-login is needed.
4. Log in as **User A**, use **Seed Initial Funds** to send funds to
   **User B**'s account ID (shown on User B's dashboard).
5. Log in as **User B**, use **Transfer Money** to send some of those
   funds to **User A**'s account ID.

## Notes

- `connectDB()` still calls `process.exit(1)` on a failed MongoDB
  connection. Inside a serverless function that just kills that one
  invocation rather than returning a clean error — harmless for a demo,
  but worth knowing if the API mysteriously 500s right after a bad
  `MONGO_URI`, instead of the "Error connecting to DB" you'd see locally.
- The frontend has no build step on purpose — it's plain HTML/CSS/JS, so
  "deploying" it is just Vercel serving the static files as-is.
