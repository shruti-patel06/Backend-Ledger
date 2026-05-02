const express = require("express");
const authMiddleware = require("../middlewares/auth.middleware");
const accountController = require("../controllers/account.controller");

const router = express.Router();

/* -POST /api/accounts/
   -Create a new account
   -Protected Route
*/
router.post(
  "/",authMiddleware.authMiddleware,accountController.createAccountController,
);
/**
 *  -GET /api/accounts/
 *  - get all accounts of the logged in user
 *  - Protected Route
 */
router.get("/",authMiddleware.authMiddleware,accountController.getUserAccountsController)

/**
 * - GET /api/accounts/balanace/:accountId
 * -get all balance of the particular account Id
 */

router.get("/balance/:accountId",authMiddleware.authMiddleware,accountController.getAccountBalanceController)
module.exports = router;
