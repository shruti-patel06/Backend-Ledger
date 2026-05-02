const accountModel = require("../models/account.model");

// Create an account using userId and send it in response
async function createAccountController(req, res) {
  const user = req.user;
  const account = await accountModel.create({
    user: user._id,
  });
  res.status(201).json({
    account,
  });
}

// Get all accounts of the logged in user
async function getUserAccountsController(req, res) {

  const user = req.user;

  const accounts = await accountModel.find({ user: user._id });

  res.status(200).json({
    accounts,
  });
}

// Get Balance of a particular Account
async function getAccountBalanceController(req,res){
  const { accountId }= req.params;
  //Jo user balance nikal ne ki koshish kar raha hai check karo ki kya vo usi user ka account hai
  const account = await accountModel.findOne({ //Dusre user ka Account nahi dekh sakte
    _id : accountId,
    user :req.user._id
  })

if(!account){
  return res.status(404).json({
    message:"Account not found"
  })
}

const balance = await account.getBalance();

res.status(200).json({
  accountId : account._id,
  balance : balance
})
}

module.exports = {
  createAccountController,
  getUserAccountsController,
  getAccountBalanceController
};
