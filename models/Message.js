const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const MessageSchema = new Schema(
  {
    conversation_id: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true
    },

    sender: {
      type: String,
      enum: ["customer", "agent", "admin"],
      required: true
    },

    message: { type: String, default: null },

    fileData: { type: String, default: null },
    fileName: { type: String, default: null },
    fileType: { type: String, default: null },

    voiceNote: { type: Boolean, default: false },
    audioData: { type: String, default: null }
  },
  { timestamps: true } // ✅ creates createdAt & updatedAt
);

module.exports = mongoose.model("Message", MessageSchema);
