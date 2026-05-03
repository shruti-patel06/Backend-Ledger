const mongoose = require("mongoose");

const tokenBlacklistSchema = new mongoose.Schema({
        token:{
           type : String,
           required :[true,"Token is required to blacklist"],
           unique :[true,"Token is already blacklisted"]     
        },
        blacklistedAt:{
                type:Date,
                default:Date.now,
                immutable:true
        }
},{
        timestamps:true
})

//token automatically gets blacklisted after specified no. of days from the database
//Saves db storage
tokenBlacklistSchema.index({ 
        createdAt:1,
        expiresAfterSeconds : 60 * 60 * 24 *3 //3 days
})

const tokenBlacklistModel = mongoose.model("tokenBlackList", tokenBlacklistSchema);

module.exports = tokenBlacklistModel;