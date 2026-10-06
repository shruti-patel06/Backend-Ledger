/**
 * Race demo - can parallel transfers overdraw an account?
 *
 * Funds one account, then fires many transfers from it at the same moment and
 * reports how many went through and the final balance.
 *
 * Runs the real app in-process against the MONGO_URI cluster from .env, but in
 * a separate throwaway database that is wiped before and after the run - the
 * app's own data is never read or written. No real emails are sent.
 *
 *   npm run race-demo                  20 transfers of ₹100 from ₹1,000
 *   npm run race-demo -- 50 100        50 transfers of ₹100 from ₹1,000
 */
require("dotenv").config({ quiet: true });
const path = require("path");
const mongoose = require("mongoose");

const DEMO_DB_NAME = "vault_ledger_race_demo";
const STARTING_BALANCE = 1000;
const TRANSFERS = parseInt(process.argv[2], 10) || 20;
const AMOUNT = Number(process.argv[3]) || 100;

// Replace the email service before the app loads it - no SMTP connection, no emails sent
const emailServicePath = require.resolve(path.join(__dirname, "../src/services/email.service"));
const noop = async () => {};
require.cache[emailServicePath] = {
  id: emailServicePath,
  filename: emailServicePath,
  loaded: true,
  exports: {
    sendRegistrationEmail: noop,
    sendTransactionEmail: noop,
    sendTransactionFailureEmail: noop,
  },
};

process.env.JWT_SECRET = "race-demo-secret";
process.env.SYSTEM_USER_EMAIL = "treasury@race.demo";
process.env.SYSTEM_USER_PASSWORD = "treasury-pass";

const app = require("../src/app");
const { ensureSystemUser } = require("../src/services/systemUser.service");

// Drops every collection in the demo database (dropDatabase needs a role Atlas users often lack)
async function wipeDemoDatabase() {
  const collections = await mongoose.connection.db.listCollections().toArray();
  await Promise.all(collections.map((c) => mongoose.connection.db.dropCollection(c.name)));
}

async function main() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not set - the demo needs a replica set (e.g. Atlas) for transactions");
  }
  console.log(`Connecting to throwaway database "${DEMO_DB_NAME}"...`);
  await mongoose.connect(process.env.MONGO_URI, { dbName: DEMO_DB_NAME });
  await wipeDemoDatabase();
  // Create collections + indexes up front so the first transfers don't race to create them
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).init()));
  await ensureSystemUser();

  const server = app.listen(0);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function api(method, url, token, body) {
    const res = await fetch(baseUrl + url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: body && JSON.stringify(body),
    });
    return { status: res.status, data: await res.json() };
  }

  try {
    // Alice sends, Bob receives
    const alice = await api("POST", "/api/auth/register", null, {
      name: "Alice", email: "alice@race.demo", password: "alice-pass",
    });
    const bob = await api("POST", "/api/auth/register", null, {
      name: "Bob", email: "bob@race.demo", password: "bob-pass",
    });
    const aliceAccount = (await api("POST", "/api/accounts", alice.data.token)).data.account._id;
    const bobAccount = (await api("POST", "/api/accounts", bob.data.token)).data.account._id;

    const treasury = await api("POST", "/api/auth/login", null, {
      email: process.env.SYSTEM_USER_EMAIL, password: process.env.SYSTEM_USER_PASSWORD,
    });
    await api("POST", "/api/transactions/system/initial-funds", treasury.data.token, {
      toAccount: aliceAccount, amount: STARTING_BALANCE, idempotencyKey: "race-demo-funding",
    });

    const maxAllowed = Math.floor(STARTING_BALANCE / AMOUNT);
    console.log(
      `\nAlice has ₹${STARTING_BALANCE}. Firing ${TRANSFERS} transfers of ₹${AMOUNT} to Bob at the same moment...`,
    );
    console.log(`At most ${maxAllowed} can succeed without overdrawing.\n`);

    const started = Date.now();
    const results = await Promise.all(
      Array.from({ length: TRANSFERS }, (_, i) =>
        api("POST", "/api/transactions", alice.data.token, {
          fromAccount: aliceAccount, toAccount: bobAccount, amount: AMOUNT, idempotencyKey: `race-${i}`,
        }),
      ),
    );
    const elapsed = Date.now() - started;

    const succeeded = results.filter((r) => r.status === 201).length;
    const rejected = results.filter((r) => r.status === 400).length;
    const other = results.length - succeeded - rejected;
    const aliceBalance = (await api("GET", `/api/accounts/balance/${aliceAccount}`, alice.data.token)).data.balance;
    const bobBalance = (await api("GET", `/api/accounts/balance/${bobAccount}`, bob.data.token)).data.balance;

    console.log(`Succeeded:              ${succeeded}`);
    console.log(`Rejected (no balance):  ${rejected}`);
    if (other) {
      console.log(`Other errors:           ${other}`);
      const statuses = [...new Set(results.filter((r) => ![201, 400].includes(r.status)).map((r) => r.status))];
      console.log(`  statuses: ${statuses.join(", ")}`);
    }
    console.log(`Alice's final balance:  ₹${aliceBalance}`);
    console.log(`Bob's final balance:    ₹${bobBalance}`);
    console.log(`Time:                   ${elapsed} ms\n`);

    if (aliceBalance < 0) {
      console.log(`RESULT: OVERDRAWN - ${succeeded - maxAllowed} transfers went through that shouldn't have.`);
      process.exitCode = 1;
    } else if (succeeded === maxAllowed && aliceBalance + bobBalance === STARTING_BALANCE) {
      console.log("RESULT: SAFE - exactly the affordable transfers went through, no money created or lost.");
    } else {
      console.log("RESULT: UNEXPECTED - check the numbers above.");
      process.exitCode = 1;
    }
  } finally {
    server.close();
    await wipeDemoDatabase();
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
