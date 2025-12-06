const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema({
    number: String,
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "Agent", default: null }
});

module.exports = mongoose.model("Customer", customerSchema);
