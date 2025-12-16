const mongoose = require("mongoose");

const ChatSchema = new mongoose.Schema({
  customer: { type: String, required: true },          // customer phone
  agent: { type: mongoose.Schema.Types.ObjectId, ref: "Agent" }, // agent reference

  sender: String,
  message: String,

  fileName: String,
  fileData: String,
  fileType: String,

  voiceNote: Boolean,
  audioData: String

}, { timestamps: true });  // automatically adds createdAt and updatedAt

module.exports = mongoose.model("Chat", ChatSchema);
