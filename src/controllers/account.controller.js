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
async function getUserAccountController(req, res) {
  const user = req.user;
  const accounts = await accountModel.find({ user: user._id });
  res.status(200).json({
    accounts,
  });
}

module.exports = {
  createAccountController,
  getUserAccountController,
};
