const transactionModel = require("../models/transaction.model");
const ledgerModel = require("../models/ledger.model");
const accountModel = require("../models/account.model");
const emailService = require("../services/email.service");
const mongoose = require("mongoose");

/**
 * - Create a new transaction
 * THE 10-STEP TRANSFER FLOW:
 * 1. Validate request
 * 2. Validate idempotency key
 * 3. Check account status
 * 4. Derive sender balance from ledger
 * 5. Create transaction (PENDING)
 * 6. Create DEBIT ledger entry
 * 7. Create CREDIT ledger entry
 * 8. Mark transaction COMPLETED
 * 9. Commit MongoDB session
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


    // If the accounts exist
    const fromUserAccount = await accountModel.findOne({
      _id: fromAccount,
    });

    const toUserAccount = await accountModel.findOne({
      _id: toAccount,
    });
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

    //4. Derive sender balance from ledger
    const balance = await fromUserAccount.getBalance(); // -->method in account.models
    if (balance < amount) {
      return res.status(400).json({
        message: `Insufficient balance. Current balance is ${balance}. Requested amount is ${amount}`,
      });
    }

    //5. Create a Transaction (PENDING)
    //creating a session

    let transaction;
    const session = await mongoose.startSession();

    try {

      
      session.startTransaction(); //Commits the currently active transaction in this session.
      // //Agar iske baad agar kuch bhi karte ho toh - ya toh sab kuch complete hoga ya kuch bhi complete nahi hoga

      const transaction = (await transactionModel.create([
        {
          fromAccount,
          toAccount,
          amount,
          idempotencyKey,
          status: "PENDING",
        }],
        { session }))[0];
      
      //6. Create DEBIT ledger entry

      const debitLedgerEntry = await ledgerModel.create([
        {
          account: fromAccount,
          amount: amount,
          transaction: transaction._id,
          type: "DEBIT",
        }],
        { session });


        await (()=>{
          return new Promise((resolve)=> setTimeout(resolve, 15 *1000));
        })()
      //7. Create CREDIT ledger entry

      const creditLedgerEntry = await ledgerModel.create(
        {
          account: toAccount,
          amount: amount,
          transaction: transaction._id,
          type: "CREDIT",
        },{ session });

        await transactionModel.findOneAndUpdate(
          { _id: transaction._id },
          { status:"COMPLETED "},
          { session }
        )

      //8. Mark transaction COMPLETED

      transaction.status = "COMPLETED";
      await transaction.save({ session });

      //9. Commit MongoDB session

      await session.commitTransaction();
      
    }
    catch(error){
      await res.session.abortTransaction();
      return res.status(400).json({
        message : "Transaction is Pending due to some issues, Please retry after sometime",
      })
    }
    finally{
      session.endSession();
    }

    //10.send email notification
    await emailService.sendTransactionEmail(
      req.user.email,
      req.user.name,
      amount,
      toAccount._id,
    );
    return res.status(201).json({
      message: "Transaction completed successfully",
      transaction: transaction,
    })

  } catch (error) {
    console.error("Error in createTransaction:", error);
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

    // Check for existing transaction with the same idempotencyKey
    const existingTransaction = await transactionModel.findOne({ idempotencyKey });
    if (existingTransaction) {
      return res.status(200).json({
        message: "Transaction already processed",
        transaction: existingTransaction,
      });
    }

    const toUserAccount = await accountModel.findOne({
      _id: toAccount,
    });
    if (!toUserAccount) {
      return res.status(400).json({
        message: "Invalid toAccount",
      });
    }

    const fromUserAccount = await accountModel.findOne({
      
      user: req.user._id,
    });
    if (!fromUserAccount) {
      return res.status(400).json({
        message: "System User account not found",
      });
    }

    const session = await mongoose.startSession();
    try {
      session.startTransaction();

      // Created on the client side so not using await here and not creating it directly on the database

      const transaction = new transactionModel(
        {
          fromAccount: fromUserAccount._id,
          toAccount,
          amount,
          idempotencyKey,
          status: "PENDING",
        }
      );

      // When using session data will be in the array of objects format so use []
      const debitLedgerEntry = await ledgerModel.create([
        {
          account: fromUserAccount._id,
          amount:amount,
          transaction: transaction._id,
          type: "DEBIT",
        }],
        { session }
      );
      const creditLedgerEntry = await ledgerModel.create([
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

      await session.commitTransaction();

      return res.status(201).json({
        message: "Initial funds transaction completed successfully",
        transaction: transaction,
      });
    } catch (error) {
      await session.abortTransaction();
      console.error("Error in createFundsTransaction:", error);
      return res.status(500).json({
        message: "Transaction failed",
        error: error.message,
      });
    } finally {
      session.endSession();
    }
  }
  

module.exports = {
  createTransaction,
  createFundsTransaction,
}
