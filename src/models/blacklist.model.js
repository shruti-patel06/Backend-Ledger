const mongoose = require("mongoose");

const tokenBlacklistSchema = new mongoose.Schema({
        token:{
           type : String,
           required :[true,"Token is required to blacklist"],
           unique :true
        },
        blacklistedAt:{
                type:Date,
                default:Date.now,
                immutable:true
        }
},{
        timestamps:true
})

//blacklisted token automatically gets deleted from the database after 3 days - saves db storage
//Matches the 3-day JWT lifetime, so by then the token has expired on its own anyway
tokenBlacklistSchema.index(
        { createdAt:1 },
        { expireAfterSeconds : 60 * 60 * 24 *3 } //3 days
)

const tokenBlacklistModel = mongoose.model("tokenBlackList", tokenBlacklistSchema);

module.exports = tokenBlacklistModel;