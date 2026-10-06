const userModel = require("../models/user.model");
const accountModel = require("../models/account.model");

/**
 * - Makes sure the system ("Treasury") user and its account exist
 * - Runs on every server start, but only creates what is missing - safe to re-run
 * - Money only enters the ledger through this user (POST /api/transactions/system/initial-funds),
 *   so no one has to flip the `system` flag by hand in MongoDB Atlas for a demo
 */
async function ensureSystemUser() {
  const email = process.env.SYSTEM_USER_EMAIL?.trim().toLowerCase();
  const password = process.env.SYSTEM_USER_PASSWORD;
  const name = process.env.SYSTEM_USER_NAME || "Ledger Treasury";

  if (!email || !password) {
    console.log("SYSTEM_USER_EMAIL / SYSTEM_USER_PASSWORD not set, skipping system user setup");
    return;
  }

  let user = await userModel.findOne({ email }).select("+system");
  if (!user) {
    user = await userModel.create({ email, name, password, system: true });
    console.log(`System user created: ${email}`);
  } else if (!user.system) {
    // Email was already registered as a normal user - promote it, keep its existing password
    user.system = true;
    await user.save();
    console.log(`Existing user promoted to system user: ${email}`);
  }

  // Funds are drawn from this account - it goes negative as money is issued,
  // which mirrors the total amount of money in the system
  const account = await accountModel.findOne({ user: user._id, status: "ACTIVE" });
  if (!account) {
    await accountModel.create({ user: user._id, systemUser: true });
    console.log("System account created");
  }
}

module.exports = {
  ensureSystemUser,
};
