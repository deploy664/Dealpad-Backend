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

    // WhatsApp message id (ANTI DUPLICATE)
    whatsapp_msg_id: {
      type: String,
      index: true,
      unique: true,
      sparse: true
    },

    sender: {
      type: String,
      enum: ["customer", "agent"],
      required: true
    },

    /* =====================
       TEXT
    ===================== */
    message: {
      type: String,
      default: null
    },

    /* =====================
       MEDIA
    ===================== */
    mediaType: {
      type: String,
      enum: ["image", "audio", "document"],
      default: null
    },

    mediaUrl: {
      type: String, // /uploads/file.ogg OR cloud URL
      default: null
    },

    mimeType: {
      type: String,
      default: null
    },

    fileName: {
      type: String,
      default: null
    },

    /* =====================
       META
    ===================== */
    createdAt: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    minimize: true,
    strict: true
  }
);

module.exports = mongoose.model("Message", MessageSchema);
