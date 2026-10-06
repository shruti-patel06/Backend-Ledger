const transactionModel = require("../models/transaction.model");
const ledgerModel = require("../models/ledger.model");
const accountModel = require("../models/account.model");
const emailService = require("../services/email.service");
const realtime = require("../services/realtime.service");
const mongoose = require("mongoose");

// Thrown inside a MongoDB transaction to abort it and send this status + message to the client
function transferError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

/**
 * - Create a new transaction
 * THE 10-STEP TRANSFER FLOW:
 * 1. Validate request
 * 2. Validate idempotency key
 * 3. Check account status
 * 4. Start MongoDB transaction (retried automatically on a write conflict)
 * 5. Lock the sender account
 * 6. Derive sender balance from ledger - inside the transaction, after the lock
 * 7. Create transaction (PENDING)
 * 8. Create DEBIT and CREDIT ledger entries
 * 9. Mark transaction COMPLETED and commit
 * 10. Send email notification
 */

async function createTransaction(req, res) {
  try {
    // 1.Validate request
    const { fromAccount, toAccount, amount, idempotencyKey } = req.body;
    if (!fromAccount || !toAccount || !amount || !idempotencyKey) {
      return res.status(400).json({
        message: "fromAccount, toAccount, amount and idempotencyKey are required",
      });
    }
    // A string like "100" would slip through the balance comparison by coercion
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        message: "amount must be a number greater than zero",
      });
    }


    // If the accounts exist - fromAccount must belong to the logged in user
    const fromUserAccount = await accountModel.findOne({
      _id: fromAccount,
      user: req.user._id,
    });

    // Recipient's name is only needed for the live-update event sent after the transfer
    const toUserAccount = await accountModel.findOne({
      _id: toAccount,
    }).populate("user", "name");
    if (!fromUserAccount || !toUserAccount) {
      return res.status(400).json({
        message: "Invalid fromAccount or toAccount",
      });
    }

    // 2.Validate Idempotency Key - Avoids multiple transactions to occur when it is in pending state.
    const isTransactionAlreadyExists = await transactionModel.findOne({
      idempotencyKey: idempotencyKey,
    });
    // Agar transaction complete hogayi aur req dusri baar aayi hai toh ye message snd karo
    if (isTransactionAlreadyExists) {
      // Key belongs to someone else's transfer - don't leak its details
      if (!isTransactionAlreadyExists.fromAccount.equals(fromUserAccount._id)) {
        return res.status(409).json({
          message: "idempotencyKey has already been used for a different transaction",
        });
      }
      if (isTransactionAlreadyExists.status === "COMPLETED") {
        return res.status(200).json({
          message: "Transaction is already processed",
          transaction: isTransactionAlreadyExists,
        });
      }
      if (isTransactionAlreadyExists.status === "PENDING") {
        return res.status(200).json({
          message: "Transaction is still processing",
        });
      }
      if (isTransactionAlreadyExists.status === "FAILED") {
        return res.status(500).json({
          message: "Transaction failed. Please Retry",
        });
      }
      if (isTransactionAlreadyExists.status === "REVERSED") {
        return res.status(500).json({
          message: "Transaction was Reversed. Please Retry",
        });
      }
    }

    //3.Check Account status-whether accounts are not closed or frozen
    if (
      fromUserAccount.status !== "ACTIVE" ||
      toUserAccount.status !== "ACTIVE"
    ) {
      return res.status(400).json({
        message: "Both From and To account must be ACTIVE to process Transaction",
      });
    }

    let transaction;
    const session = await mongoose.startSession();

    try {
      //4. Start the MongoDB transaction
      // Agar iske baad agar kuch bhi karte ho toh - ya toh sab kuch complete hoga ya kuch bhi complete nahi hoga.
      // withTransaction re-runs this whole callback if MongoDB reports a write conflict
      // (another transfer from the same account got there first) and commits at the end
      await session.withTransaction(async () => {

        //5. Lock the sender account - see lockVersion in account.model.
        // Also re-checks ACTIVE in case the account was frozen after step 3
        const lockedFromAccount = await accountModel.findOneAndUpdate(
          { _id: fromUserAccount._id, status: "ACTIVE" },
          { $inc: { lockVersion: 1 } },
          { session },
        );
        if (!lockedFromAccount) {
          throw transferError(400, "Both From and To account must be ACTIVE to process Transaction");
        }

        //6. Derive sender balance from ledger - read after the lock, so no other transfer
        // from this account can commit between this check and our DEBIT
        const balance = await lockedFromAccount.getBalance(session); // -->method in account.models
        if (balance < amount) {
          throw transferError(
            400,
            `Insufficient balance. Current balance is ${balance}. Requested amount is ${amount}`,
          );
        }

        //7. Create a Transaction (PENDING)
        transaction = (await transactionModel.create([
          {
            fromAccount,
            toAccount,
            amount,
            idempotencyKey,
            status: "PENDING",
          }],
          { session }))[0];

        //8. Create DEBIT and CREDIT ledger entries

        await ledgerModel.create([
          {
            account: fromAccount,
            amount: amount,
            transaction: transaction._id,
            type: "DEBIT",
          }],
          { session });

        await ledgerModel.create([
          {
            account: toAccount,
            amount: amount,
            transaction: transaction._id,
            type: "CREDIT",
          }],{ session });

        //9. Mark transaction COMPLETED - withTransaction commits once this callback returns

        transaction.status = "COMPLETED";
        await transaction.save({ session });
      });
    }
    catch(error){
      // withTransaction has already aborted, rolling back everything including the
      // PENDING transaction document, so nothing was persisted and no funds moved
      if (error.status) {
        return res.status(error.status).json({
          message: error.message,
        });
      }

      // A concurrent request with the same idempotencyKey won the race to insert
      if (error.code === 11000) {
        return res.status(409).json({
          message: "A transaction with this idempotencyKey is already being processed",
        });
      }
      if (error.name === "ValidationError") {
        return res.status(400).json({
          message: "Transaction failed validation, no funds were moved",
          errors: Object.values(error.errors).map((e) => e.message),
        });
      }
      console.error("Error in createTransaction:", error);
      return res.status(500).json({
        message: "Transaction failed, no funds were moved. Please retry",
      })
    }
    finally{
      session.endSession();
    }

    // Committed - tell both sides so their pages update without a refresh
    realtime.publishTransfer(
      transaction,
      { userId: req.user._id, accountId: fromUserAccount._id, name: req.user.name },
      { userId: toUserAccount.user?._id, accountId: toUserAccount._id, name: toUserAccount.user?.name },
    );

    res.status(201).json({
      message: "Transaction completed successfully",
      transaction: transaction,
    })

    //10.send email notification - after response to reduce user waiting time
    await emailService.sendTransactionEmail(
      req.user.email,
      req.user.name,
      amount,
      toUserAccount._id,
    );

  } catch (error) {
    console.error("Error in createTransaction:", error);
    if (res.headersSent) {
      return;
    }
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
}


async function createFundsTransaction(req, res) {
  
    
    const { toAccount, amount, idempotencyKey } = req.body;

    if (!toAccount || !amount || !idempotencyKey) {
      return res.status(400).json({
        message: "toAccount, amount, and idempotencyKey are required",
      });
    }
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        message: "amount must be a number greater than zero",
      });
    }

    // Funds come out of the system user's ACTIVE account (it is allowed to go negative -
    // this is where money enters the ledger)
    const fromUserAccount = await accountModel.findOne({
      user: req.user._id,
      status: "ACTIVE",
    });
    if (!fromUserAccount) {
      return res.status(400).json({
        message: "System User account not found",
      });
    }

    // Check for existing transaction with the same idempotencyKey
    const existingTransaction = await transactionModel.findOne({ idempotencyKey });
    if (existingTransaction) {
      if (!existingTransaction.fromAccount.equals(fromUserAccount._id)) {
        return res.status(409).json({
          message: "idempotencyKey has already been used for a different transaction",
        });
      }
      return res.status(200).json({
        message: "Transaction already processed",
        transaction: existingTransaction,
      });
    }

    const toUserAccount = await accountModel.findOne({
      _id: toAccount,
    }).populate("user", "name");
    if (!toUserAccount) {
      return res.status(400).json({
        message: "Invalid toAccount",
      });
    }
    if (toUserAccount.status !== "ACTIVE") {
      return res.status(400).json({
        message: "toAccount must be ACTIVE to receive funds",
      });
    }

    let transaction;
    const session = await mongoose.startSession();
    try {
      // Same pattern as createTransaction: retried on a write conflict, committed at the end
      await session.withTransaction(async () => {

        // The system account may go negative so there is no balance check, but it still
        // takes the lock so every transfer debiting an account is applied one at a time
        await accountModel.updateOne(
          { _id: fromUserAccount._id },
          { $inc: { lockVersion: 1 } },
          { session },
        );

        // Created on the client side so not using await here and not creating it directly on the database

        transaction = new transactionModel(
          {
            fromAccount: fromUserAccount._id,
            toAccount,
            amount,
            idempotencyKey,
            status: "PENDING",
          }
        );

        // When using session data will be in the array of objects format so use []
        await ledgerModel.create([
          {
            account: fromUserAccount._id,
            amount:amount,
            transaction: transaction._id,
            type: "DEBIT",
          }],
          { session }
        );
        await ledgerModel.create([
          {
            account: toAccount,
            amount: amount,
            transaction: transaction._id,
            type: "CREDIT",
          }],
          { session }
        );

        transaction.status = "COMPLETED";
        await transaction.save({ session });
      });

      realtime.publishTransfer(
        transaction,
        { userId: req.user._id, accountId: fromUserAccount._id, name: req.user.name },
        { userId: toUserAccount.user?._id, accountId: toUserAccount._id, name: toUserAccount.user?.name },
      );

      return res.status(201).json({
        message: "Initial funds transaction completed successfully",
        transaction: transaction,
      });
    }
    catch (error) {
      // withTransaction has already aborted - nothing was persisted
      if (error.code === 11000) {
        return res.status(409).json({
          message: "A transaction with this idempotencyKey is already being processed",
        });
      }
      console.error("Error in createFundsTransaction:", error);
      return res.status(500).json({
        message: "Transaction failed",
        error: error.message,
      });
    } finally {
      session.endSession();
    }
  }
  

/**
 * - Resolve the logged in user's account ids, optionally narrowed to one account
 * - Returns null if accountId is given but doesn't belong to the user
 */
async function getMyAccountIds(req) {
  const filter = { user: req.user._id };
  if (req.query.accountId) {
    filter._id = req.query.accountId;
  }
  const accounts = await accountModel.find(filter).select("_id");
  if (req.query.accountId && accounts.length === 0) {
    return null;
  }
  return accounts.map((acc) => acc._id);
}

// Cursor = "<createdAt ISO>_<_id>" of the last item on the previous page.
// _id breaks ties between transactions created in the same millisecond.
function encodeCursor(transaction) {
  return `${transaction.createdAt.toISOString()}_${transaction._id}`;
}
function decodeCursor(cursor) {
  const [iso, id] = String(cursor).split("_");
  const createdAt = new Date(iso);
  if (isNaN(createdAt) || !mongoose.isValidObjectId(id)) {
    return null;
  }
  return { createdAt, _id: new mongoose.Types.ObjectId(id) };
}

/**
 * - Transaction history of the logged in user, newest first
 * - GET /api/transactions?limit=20&before=<cursor>&accountId=<id>
 * - Cursor pagination instead of skip/offset: stays fast and doesn't skip or
 *   repeat items when new transactions arrive between pages
 */
async function getTransactionHistory(req, res) {
  const myIds = await getMyAccountIds(req);
  if (!myIds) {
    return res.status(404).json({ message: "Account not found" });
  }
  if (myIds.length === 0) {
    return res.status(200).json({ transactions: [], nextCursor: null });
  }

  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);

  const conditions = [
    { $or: [{ fromAccount: { $in: myIds } }, { toAccount: { $in: myIds } }] },
  ];
  if (req.query.before) {
    const cursor = decodeCursor(req.query.before);
    if (!cursor) {
      return res.status(400).json({ message: "Invalid cursor" });
    }
    conditions.push({
      $or: [
        { createdAt: { $lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, _id: { $lt: cursor._id } },
      ],
    });
  }

  // Fetch one extra to know whether another page exists
  const docs = await transactionModel
    .find({ $and: conditions })
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .populate([
      { path: "fromAccount", select: "user", populate: { path: "user", select: "name" } },
      { path: "toAccount", select: "user", populate: { path: "user", select: "name" } },
    ]);

  const hasMore = docs.length > limit;
  const page = hasMore ? docs.slice(0, limit) : docs;
  const isMine = (account) => !!account && myIds.some((id) => id.equals(account._id));

  const transactions = page.map((tx) => {
    const fromMine = isMine(tx.fromAccount);
    const toMine = isMine(tx.toAccount);
    // Direction is relative to the logged in user, not stored on the transaction
    const direction = fromMine && toMine ? "SELF" : fromMine ? "DEBIT" : "CREDIT";
    const mySide = direction === "CREDIT" ? tx.toAccount : tx.fromAccount;
    const otherSide = direction === "CREDIT" ? tx.fromAccount : tx.toAccount;
    return {
      _id: tx._id,
      amount: tx.amount,
      status: tx.status,
      createdAt: tx.createdAt,
      direction,
      account: mySide._id,
      counterparty: {
        accountId: otherSide?._id || null,
        name: otherSide?.user?.name || "Unknown user",
        // True when filtered to one account and the other side is another of the user's own accounts
        isOwnAccount: !!otherSide?.user?._id?.equals(req.user._id),
      },
    };
  });

  res.status(200).json({
    transactions,
    nextCursor: hasMore ? encodeCursor(page[page.length - 1]) : null,
  });
}

/**
 * - Money sent / received per month, for the history page's month headers
 * - GET /api/transactions/summary?tz=Asia/Kolkata&accountId=<id>
 * - Grouped in the client's timezone so a transfer at 1am IST on the 1st
 *   lands in the right month (UTC would put it in the previous one)
 */
async function getTransactionSummary(req, res) {
  const myIds = await getMyAccountIds(req);
  if (!myIds) {
    return res.status(404).json({ message: "Account not found" });
  }

  let timezone = "UTC";
  if (req.query.tz) {
    try {
      // Throws RangeError for anything that isn't a real IANA timezone
      new Intl.DateTimeFormat("en", { timeZone: req.query.tz });
      timezone = req.query.tz;
    } catch {
      return res.status(400).json({ message: "Invalid timezone" });
    }
  }

  const fromMine = { $in: ["$fromAccount", myIds] };
  const toMine = { $in: ["$toAccount", myIds] };

  const months = await transactionModel.aggregate([
    {
      $match: {
        status: "COMPLETED",
        $or: [{ fromAccount: { $in: myIds } }, { toAccount: { $in: myIds } }],
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m", date: "$createdAt", timezone } },
        // Transfers between the user's own accounts are neither sent nor received
        sent: { $sum: { $cond: [{ $and: [fromMine, { $not: [toMine] }] }, "$amount", 0] } },
        received: { $sum: { $cond: [{ $and: [toMine, { $not: [fromMine] }] }, "$amount", 0] } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: -1 } },
    { $project: { _id: 0, month: "$_id", sent: 1, received: 1, count: 1 } },
  ]);

  res.status(200).json({ months });
}

module.exports = {
  createTransaction,
  createFundsTransaction,
  getTransactionHistory,
  getTransactionSummary,
}
