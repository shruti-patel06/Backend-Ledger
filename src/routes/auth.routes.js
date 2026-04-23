const express = require("express");
const authController = require("../controllers/auth.controller")
const router = express.Router();

/*POST /api/auth/register */
router.post("/register",authController.userRegisterController);
router.post("/login",authController.userLogincontroller);
module.exports = router