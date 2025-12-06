const mongoose = require("mongoose");

const routingSchema = new mongoose.Schema({
  lastIndex: { type: Number, default: 0 }
});

module.exports = mongoose.model("Routing", routingSchema);
