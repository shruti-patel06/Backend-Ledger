const accountModel = require("../models/account.model");


// Create an account using userId and send it in response
async function createAccountController(req,res){
    const user = req.user;
    const account= await accountModel.create({
        user:user._id
    })
    res.status(201).json({
        account
    })
}
module.exports = {
    createAccountController
}