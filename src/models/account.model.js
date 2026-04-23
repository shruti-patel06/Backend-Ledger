const mongoose = require("mongoose");

const accountSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: [true, "Account must be associated with a user"],
      index: true, // for faster retrieval - DS - B+ trees used
    },
    status: {
      type: String,
      enum: {
        values: ["ACTIVE", "FROZEN", "CLOSED"],
        message: "Status can be either ACTIVE,FROZEN OR CLOSED",
      },
      default: "ACTIVE",
    },
    currency: {
      type: String,
      required: [true, "Currency is required for creating an account"],
      default: "INR",
    },
    // User Balance never stored in database but cache - use Ledger
  },
  {
    timestamps: true,
  },
);
accountSchema.index({ user: 1, status: 1 }); // compound index- can be found using  user and status
const accountModel = mongoose.model("account", accountSchema);

module.exports = accountModel;
