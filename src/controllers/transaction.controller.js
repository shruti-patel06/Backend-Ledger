const transactionModel = require("../models/transaction.model");
const ledgerModel = require("../models/ledger.model");
const acconuntModel = require("../models/account.model");
const emailService = require("../services/email.service");
const mongoose = require("mongoose");
const accountModel = require("../models/account.model");

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


async function createTransaction(req,res){
    // 1.Validate request
    const { fromAccount,toAccount,amount,idempotencyKey } = req.body;
    if(!fromAccount || !toAccount || !amount || !idempotencyKey){
        return res.status(400).json({
            message:"FromAccount,toAccount,amount and idempotencyKey are required"
        })
    }
    // If the accounts exist 
    const fromUserAccount = await accountModel.findOne({
        _id:fromAccount,
    })

    const toUserAccount = await accountModel.findOne({
        _id:toAccount,
    })
    if(!fromUserAccount || !toUserAccount){
        return res.status(400).json({
            message:"Invalid fromAccount or toAccount"
        })
    }

    // 2.Validate Idempotency Key - Avoids multiple transactions to occur when it is in pending state.
    const isTransactionAlreayExists = await transactionModel.findOne({
        idempotencyKey:idempotencyKey
    })
    // Agar transaction complete hogayi aur req dusri baar aayi hai toh ye message snd karo
    if(isTransactionAlreayExists){
        if(isTransactionAlreayExists.status==="COMPLETED"){
           return res.status(200).json({
                message:"Transaction is already processed",
                transaction:isTransactionAlreayExists
            })
        }
        if(isTransactionAlreayExists.status==="PENDING"){
           return res.status(200).json({
                message:"Transaction is still processing"
            })
        }
        if(isTransactionAlreayExists.status==="FAILED"){
           return res.status(500).json({
                message:"Transaction failed.Please Retry"
            })
        }
        if(isTransactionAlreayExists.status==="REVERSED"){
           return res.status(500).json({
                message:"Transaction was Reversed.Please Retry"
            })
        }
    }

    //3.Check Account status-whether accounts are not closed or frozen
    if(fromUserAccount.status !== "ACTIVE" || toUserAccount.status!== "ACTIVE"){
        return res.status(400).json({
            message:"Both From and To account must be ACTIVE to process Transaction"
        })
    }

    //4. Derive sender balance from ledger
    const balance = await fromUserAccount.getBalance() // -->method in account.models
    if(balance < amount){
        return res.status(400).json({
            message:`Insufficient balance.Current balance is ${balance}. Requested amount is ${amount} `
        })
    }

    //5. Create a Transaction (PENDING)
    //creating a session 
    const session = await mongoose.startSession()
    session.startTransaction() //Commits the currently active transaction in this session.//Agar iske baad agar kuch bhi karte ho toh - ya toh sab kuch complete hoga ya kuch bhi complete nahi hoga

    const transaction = await transactionModel.create({
        fromAccount,
        toAccount,
        amount,
        idempotencyKey,
        status:"PENDING"
    },{ session })
    
    const debitLedgerEntry = await ledgerModel.create({
        account:fromAccount,
        amount:amount,
        transaction:transaction._id,
        type:"DEBIT",
    },{session})

    const creditLedgerEntry = await ledgerModel.create({
        account:fromAccount,
        amount:amount,
        transaction:transaction._id,
        type:"CREDIT",
    },{session})

    transaction.status ="COMPLETED"
    await transaction.save({ session })

    await session.commitTransaction()
    session.endSession()

    //10.send email notification
    await emailService.sendTransactionEmail(req.user.email,req.user.name,amount,toAccount._id)
    return res.status(201).json({
        message : "Transaction completed successfully",
        transaction:transaction
    })

}  

module.exports = {
    createTransaction
}
