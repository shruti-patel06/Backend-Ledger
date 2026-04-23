const mongoose = require("mongoose");

const ledgerSchema = new mongoose.Schema({
    account:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"account",
        required:[true,"Ledger must be associated with an account"],
        index:true,
        immutable:true // Cannot change once it is registered
    },
    amount:{
        type:Number,
        required:[true,"Amount is required for creating a ledger entry"],
        immutable:true
    },
    transaction:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"transaction",
        required:[true,"Leedger must be associated with a transaction"],
        index:true,
        immutable:true
    },
    type:{
        type:String,
        enum:{
            values:["CREDIT","DEBIT"],
            message:"Type can either be CREDIT or DEBIT"
        },
        required:[true,"Ledger type is required"],
        immutable:true
    }
})
function preventLedgerModification(){ // no modification can be done
    throw new Error("Ledger Entries are immutable and canot be modified or deleted");
}
ledgerSchema.pre("findOneAndUpdate",preventLedgerModification);
ledgerSchema.pre("updateOne",preventLedgerModification);
ledgerSchema.pre("deleteOne",preventLedgerModification);
ledgerSchema.pre("remove",preventLedgerModification);
ledgerSchema.pre("deleteMany",preventLedgerModification);

const ledgerModel = mongoose.Model("ledger",ledgerSchema)

module.exports=ledgerModel;