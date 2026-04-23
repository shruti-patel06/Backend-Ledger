const mongoose = require("mongoose");
const transactionSchema = new mongoose.Schema({
    fromAccount:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"account",
        required:[true,"Transaction must be associated with a from account"],
        index:true
    },
    toAccount:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"account",
        required:[true,"Transaction must be associated to a account"],
        index:true
    },
    status:{
        type:String,
        enum:{
            values:["PENDING","COMPLETED","FAILED","REVERSED"],
            message:"Status can be either PENDIND, COMPLETED, FAILED OR REVERSED",
        },
    default:"PENDING"
    },
    amount:{
        type:Number,
        required:[true,"Amount is required for creating a transaction"],
        min:[0,"Transaction cannot be negative"]
    },
    idempotencyKey:{ // Generated on client side & unique 
        type:String,
        required:[true,"Idempotency is required for creating a transaction"],
        index:true,
        unique:true
    }
},{
    timestamps:true
}) 
const transactionModel = mongoose.Model("transaction",transactionSchema)

module.exports = transactionModel