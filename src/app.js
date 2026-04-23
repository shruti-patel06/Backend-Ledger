const express = require("express")
const cookieParser = require("cookie-parser")

//Creating express instance
const app = express();

//Middlewares
app.use(express.json());
app.use(cookieParser());

//Routes
const authRouter = require("./routes/auth.routes");
const accountRouter = require("./routes/account.routes")

//Use Routes
app.use("/api/auth",authRouter);
app.use("/api/accounts",accountRouter)
module.exports =app;