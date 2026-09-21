# Deploying Backend Ledger

Two separate deployments on two different platforms: the Express API
(backend) on Render, and the static frontend (`client/`) on Vercel.

## 1. Push to GitHub

Push this branch (or merge it) so both platforms have something to import.

## 2. Deploy the backend on Render

1. On render.com: **New → Web Service**, connect this GitHub repo.
2. **Root Directory**: leave blank (repo root).
3. **Runtime**: Node.
4. **Build Command**: `npm install`
5. **Start Command**: `npm start` (runs `node server.js`, which now reads
   `process.env.PORT` — Render assigns this dynamically, so don't hardcode
   a port).
6. Add these environment variables (Environment tab):
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
7. **Instance Type**: Free is fine for a demo. Note: free instances spin
   down after a period of inactivity, so the first request after idle
   takes 30-60s to wake back up — not a bug, just the free tier.
8. Deploy. Note the resulting URL, e.g. `https://backend-ledger-api.onrender.com`.

No extra config file is needed for this — Render just runs `npm install`
then `npm start` against the repo as-is.

## 3. Point the frontend at the backend

Edit `client/js/config.js`:

```js
const API_BASE_URL = "https://backend-ledger-api.onrender.com"; // your backend URL from step 2
```

Commit and push this change.

## 4. Deploy the frontend on Vercel

1. On vercel.com: **Add New → Project**, import the same repo.
2. **Root Directory**: `client`.
3. **Framework Preset**: "Other" — static files, no build step.
4. Deploy. Note the resulting URL, e.g. `https://vault-ledger.vercel.app`.

## 5. (Optional) lock down CORS

Back in Render's environment variables for the backend, set `CLIENT_URL`
to the frontend's URL from step 4, and redeploy. This restricts the API to
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

- The free Render instance sleeping after inactivity means a demo link
  you haven't visited in a while will feel slow on the first load (that
  30-60s cold start) — worth a heads-up if you're sharing the link live,
  e.g. in an interview.
- The frontend has no build step on purpose — it's plain HTML/CSS/JS, so
  "deploying" it is just Vercel serving the static files as-is.
