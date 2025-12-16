const mongoose = require("mongoose");

const AdminSchema = new mongoose.Schema({
  username: String,
  password: String,
  name: String,
  role: { type: String, default: "admin" }
}, { timestamps: true });

module.exports = mongoose.model("Admin", AdminSchema);
