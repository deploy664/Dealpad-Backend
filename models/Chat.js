const mongoose = require("mongoose");

const ChatSchema = new mongoose.Schema({
  number: String,
  sender: String,
  message: String,

  fileName: String,
  fileData: String,
  fileType: String,

  voiceNote: Boolean,
  audioData: String,

  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Chat", ChatSchema);
