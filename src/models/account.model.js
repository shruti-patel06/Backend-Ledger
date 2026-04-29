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
  },
  {
    timestamps: true,
  },
);
accountSchema.index({ user: 1, status: 1 }); // compound index- can be found using  user and status

accountSchema.methods.getBalance = async function(){
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
   ])
   // if user creates this for the first time
   if(balanceData.length === 0){
    return 0 
   }
   // Agar kuch balance mila hai toh
   return balanceData[ 0 ].balance
}
const accountModel = mongoose.model("account", accountSchema);

module.exports = accountModel;
