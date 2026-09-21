const express = require("express")
const cookieParser = require("cookie-parser")
const cors = require("cors")

//Creating express instance
const app = express();

//Middlewares
// CLIENT_URL locks CORS to the deployed frontend; falls back to reflecting
// any origin (still no cookies/credentials involved, auth uses a bearer token)
app.use(cors({
  origin: process.env.CLIENT_URL || true,
}));
app.use(express.json());
app.use(cookieParser());

//Routes
const authRouter = require("./routes/auth.routes");
const accountRouter = require("./routes/account.routes");
const transactionRoutes = require("./routes/transaction.routes");

app.get("/",(req,res)=>{
        res.send(" Ledger Service is Up and running ");
})
//Use Routes
app.use("/api/auth",authRouter);
app.use("/api/accounts",accountRouter)
app.use("/api/transactions",transactionRoutes)

// No route matched above
app.use((req, res) => {
  res.status(404).json({
    message: "Route not found",
  });
});

// Central error handler - Express 5 forwards thrown/rejected errors from async
// route handlers here automatically, so every failure returns JSON instead of
// falling through to Express's default HTML error page
app.use((err, req, res, next) => {
  console.error(err);

  if (err.name === "ValidationError") {
    return res.status(400).json({
      message: "Validation failed",
      errors: Object.values(err.errors).map((e) => e.message),
    });
  }

  if (err.name === "CastError") {
    return res.status(400).json({
      message: `Invalid value for field: ${err.path}`,
    });
  }

  if (err.code === 11000) {
    return res.status(409).json({
      message: "Duplicate value violates a unique constraint",
    });
  }

  res.status(err.status || 500).json({
    message: err.message || "Internal server error",
  });
});

module.exports =app;