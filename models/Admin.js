const mongoose = require("mongoose");

const adminSchema = new mongoose.Schema({
  username: String,
  password: String,
  name: String
});

module.exports = mongoose.model("Admin", adminSchema);
