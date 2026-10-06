const mongoose = require("mongoose");
const transactionSchema = new mongoose.Schema(
  {
    fromAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "account",
      required: [true, "Transaction must be associated with a from account"],
      index: true,
    },
    toAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "account",
      required: [true, "Transaction must be associated to a account"],
      index: true,
    },
    status: {
      type: String,
      enum: {
        values: ["PENDING", "COMPLETED", "FAILED", "REVERSED"],
        message: "Status can be either PENDIND, COMPLETED, FAILED OR REVERSED",
      },
      default: "PENDING",
    },
    amount: {
      type: Number,
      required: [true, "Amount is required for creating a transaction"],
      min: [0, "Transaction cannot be negative"],
    },
    idempotencyKey: {
      // Generated on client side & unique
      type: String,
      required: [true, "Idempotency is required for creating a transaction"],
      index: true,
      unique: true,
    },
  },
  {
    timestamps: true,
  },
);
// History query: "transactions from OR to my accounts, newest first" - each side of the $or
// can then walk an index already in sorted order instead of sorting in memory
transactionSchema.index({ fromAccount: 1, createdAt: -1, _id: -1 });
transactionSchema.index({ toAccount: 1, createdAt: -1, _id: -1 });

const transactionModel = mongoose.model("transaction", transactionSchema);

module.exports = transactionModel;
