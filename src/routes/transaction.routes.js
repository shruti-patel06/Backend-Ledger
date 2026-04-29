const { Router } = require("express");
const authMiddleware = require("../middlewares/auth.middleware");
const transactionController = require("../controllers/transaction.controller")
const transactionRoutes = Router();

/**
 * POST /api/transactions/
 * -Create a new transaction
 */
transactionRoutes.post("/",authMiddleware.authMiddleware,transactionController.createTransaction);

/**
 *  -POST /api/transactions/system/initial-funds
 *  -create Initial Funds from system user
 */
transactionRoutes.post("/system/initial-funds",authMiddleware.authSystemUserMiddleware,transactionController.createFundsTransaction)


module.exports = transactionRoutes;