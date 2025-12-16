const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const MessageSchema = new Schema(
  {
    conversation_id: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true
    },

    sender: {
      type: String,
      enum: ["customer", "agent"],
      required: true
    },

    // 📝 TEXT
    message: {
      type: String
    },

    // 📎 MEDIA (NO BASE64)
    mediaId: {
      type: String
    },

    mediaType: {
      type: String,
      enum: ["image", "audio", "document"]
    },

    mimeType: {
      type: String
    },

    fileName: {
      type: String
    },

    createdAt: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    minimize: true // 🔥 null fields save hi nahi hongi
  }
);

module.exports = mongoose.model("Message", MessageSchema);
