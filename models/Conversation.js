const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const ConversationSchema = new Schema(
  {
    customer_phone: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    assigned_agent: {
      type: Schema.Types.ObjectId,
      ref: "Agent",
      default: null
    },

    status: {
      type: String,
      enum: ["open", "closed"],
      default: "open"
    }
  },
  { timestamps: true } // ✅ createdAt & updatedAt
);

module.exports = mongoose.model("Conversation", ConversationSchema);
