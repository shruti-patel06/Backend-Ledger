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
 * GET /api/transactions/
 * -Transaction history of the logged in user (cursor paginated)
 */
transactionRoutes.get("/",authMiddleware.authMiddleware,transactionController.getTransactionHistory);

/**
 * GET /api/transactions/summary
 * -Sent/received totals per month
 */
transactionRoutes.get("/summary",authMiddleware.authMiddleware,transactionController.getTransactionSummary);

/**
 *  -POST /api/transactions/system/initial-funds
 *  -create Initial Funds from system user
 */
transactionRoutes.post("/system/initial-funds",authMiddleware.authSystemUserMiddleware,transactionController.createFundsTransaction)


module.exports = transactionRoutes;