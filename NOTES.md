# Known Limitations & Future Improvements

Prep notes for "what would you improve / do differently?" This project is
scoped as a learning/portfolio project, not a production system, so a few
things were fixed because they were outright bugs, and a longer list was
left out on purpose. Each item below is written as the answer to give if
it comes up in an interview.

## Fixed during review (bugs, not scope cuts)

These weren't "future improvements" — they were things that made the app
incorrect or inconsistent, so they got fixed rather than left as talking
points:

- **Broken authorization on transfers**: `createTransaction` read
  `fromAccount` straight from the request body without checking it belonged
  to the logged-in user, so any authenticated user could move funds out of
  any account they could name the ID of. Fixed by scoping the lookup to
  `{ _id: fromAccount, user: req.user._id }`, the same pattern already used
  by the balance endpoint.
- **A 15-second `setTimeout` inside the live DB transaction** in
  `createTransaction`, between writing the DEBIT and CREDIT ledger entries —
  leftover debug code that held transaction locks open on every transfer.
  Removed.
- **Logout returned HTTP 400 with a "logged out successfully" message** when
  no token was present. Status now matches the message (200).
- **No global error handler**, so a thrown/rejected error (e.g. a malformed
  `accountId` producing a Mongoose `CastError`) fell through to Express's
  default HTML error page instead of the JSON shape the rest of the API
  uses. Added a central error-handling middleware (plus a JSON 404
  fallback) in `app.js` that maps `ValidationError` / `CastError` / duplicate
  key errors to sensible status codes.
- **Auth cookie had no flags**: `res.cookie("token", token)` was readable by
  JS and not restricted to same-site/HTTPS. Added `httpOnly`, `sameSite:
  "strict"`, and `secure` (in production) via a shared `COOKIE_OPTIONS`.

## Left out on purpose

### Automated tests
No unit/integration tests; `npm test` is still the default placeholder.
**Answer:** I'd add Jest + Supertest against a `mongodb-memory-server`
instance, prioritized by risk: the transfer flow first (idempotency replay,
insufficient balance, frozen/closed accounts, the concurrency case below),
then auth, then account/balance endpoints.

### Balance race condition (TOCTOU)
`Account.getBalance()` is computed by aggregating the ledger *before* the
Mongo session/transaction starts, and nothing re-checks it atomically at
write time. Two concurrent transfers from the same account can each read
the same starting balance, both pass the sufficient-funds check, and both
succeed — overdrawing the account.
**Answer:** Balance is intentionally never cached, only derived from the
immutable ledger, which is correct for auditability (you can always
recompute and verify it from history). The gap is that the read and the
write aren't in the same atomic step. Production fixes, in order of how
I'd actually reach for them:
1. Serialize transfers per source account (e.g. an app-level lock keyed by
   account ID, or process them through a queue).
2. Maintain a cached `balance` field on the account, updated with an atomic
   `findOneAndUpdate` guarded by `balance: { $gte: amount }` in the same
   transaction as the ledger writes — the ledger stays the source of truth
   for audit/reconciliation, the cached field just makes the check atomic.

### Security hardening
No rate limiting on `/api/auth/login` (brute-force exposure), no `helmet`
(missing security headers), no CORS setup (fine with no browser frontend
yet), no CSRF token beyond the `sameSite=strict` cookie added above, and
logout revokes tokens via a DB blacklist rather than short-lived access +
refresh tokens.
**Answer:** `express-rate-limit` on the login route, `helmet()` globally,
`cors` configured with an explicit allowlist once a frontend exists, and a
move to short-lived (e.g. 15 min) access tokens with rotating refresh
tokens if session length becomes a concern.

### Input validation
Request bodies are checked with manual `if (!field)` guards instead of a
schema validator, there's no check that `fromAccount !== toAccount`, no
upper bound on transfer amount, and amounts are stored as floating-point
`Number` rather than integer minor units (paise), which is the classic
source of rounding drift in ledgers.
**Answer:** `zod` or `joi` schemas validated in middleware ahead of the
controller, returning structured 422s; migrate `amount` to integer paise
end-to-end (divide by 100 only at the presentation layer).

### Operational maturity
No CI, no Dockerfile/docker-compose for app+Mongo, no `.env.example` (a new
dev has to grep the source for the 6 required env vars), console.log/error
instead of structured logging, no health/readiness endpoint beyond `GET /`,
no metrics or tracing.
**Answer:** GitHub Actions running lint + tests on PR, a docker-compose for
local Mongo, `.env.example` committed, `pino`/`winston` for structured logs,
a `/healthz` endpoint for uptime checks.

### Feature completeness
- The `transaction` schema models `PENDING` / `FAILED` / `REVERSED` states,
  but the code only ever durably persists `COMPLETED` (a failed attempt
  rolls back the whole Mongo transaction, including the PENDING document
  itself) and there's no endpoint to reverse a completed transaction despite
  `REVERSED` existing in the enum.
  **Answer:** I'd add `POST /api/transactions/:id/reverse` that writes a new
  inverse DEBIT/CREDIT pair referencing the original transaction, rather
  than mutating the original — keeps the ledger append-only.
- `sendTransactionFailureEmail` is fully implemented in the email service
  but never called — a failed transfer currently notifies no one.
- `Account.systemUser` is defined on the schema but never set or queried
  anywhere; only `User.system` is actually checked by
  `authSystemUserMiddleware`. Dead field — would either wire it up (require
  the specific flagged account, not just any account owned by a
  system-flagged user) or remove it.
- No self-service way to create a system/admin user — the `system` flag has
  to be flipped by hand in MongoDB. Would add a one-time seed script.
- No password reset or email verification flow.
