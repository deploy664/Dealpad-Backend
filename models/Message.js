const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const MessageSchema = new Schema({
  conversation_id: {
    type: Schema.Types.ObjectId,
    ref: "Conversation",
    required: true
  },

  sender: {
    type: String,
    enum: ["customer", "agent"],
    required: true
  },

  message: { type: String, default: null },

  fileData: { type: String, default: null },
  fileName: { type: String, default: null },
  fileType: { type: String, default: null },

  voiceNote: { type: Boolean, default: false },
  audioData: { type: String, default: null },

  created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Message", MessageSchema);  