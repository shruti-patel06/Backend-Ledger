const mongoose = require("mongoose");
const ledgerModel = require("./ledger.model")
const accountSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: [true, "Account must be associated with a user"],
      index: true, // for faster retrieval - DS - B+ trees used
    },
    status: {
      type: String,
      enum: {
        values: ["ACTIVE", "FROZEN", "CLOSED"],
        message: "Status can be either ACTIVE,FROZEN OR CLOSED",
      },
      default: "ACTIVE",
    },
    currency: {
      type: String,
      required: [true, "Currency is required for creating an account"],
      default: "INR",
    },
    systemUser: {
      type: Boolean,
      default: false,
      select: false,
    },
    // User Balance never stored in database but cache - use Ledger

    // Not money - a counter bumped inside every transfer that debits this account.
    // Two transfers from the same account both write this document, so MongoDB
    // aborts one with a write conflict and it retries after the other commits
    lockVersion: {
      type: Number,
      default: 0,
      select: false,
    },
  },
  {
    timestamps: true,
  },
);
accountSchema.index({ user: 1, status: 1 }); // compound index- can be found using  user and status

// Pass the session when calling inside a transaction so the balance is read from
// the transaction's snapshot, not from outside it
accountSchema.methods.getBalance = async function(session = null){
   const balanceData = await ledgerModel.aggregate([
      {$match:{account :this._id}},
      //grps debits and credits
      {
        $group:{
          _id : null,
          totalDebit:{
            $sum:{
              $cond:[
                
                  {$eq : ["$type","DEBIT"]},
                  "$amount",
                  0
              ]
            }
          },
          totalCredit:{
            $sum:{
              $cond:[
                
                  {$eq : ["$type","CREDIT"]},
                  "$amount",
                  0
              ]
            }
          },
        }
      },
      {
          $project: {
            _id :0,
            balance: {
              $subtract : ["$totalCredit","$totalDebit"]
            }
          }
      }
   ]).session(session)
   // if user creates this for the first time
   if(balanceData.length === 0){
    return 0 
   }
   // Agar kuch balance mila hai toh
   return balanceData[ 0 ].balance
}
const accountModel = mongoose.model("account", accountSchema);

module.exports = accountModel;
