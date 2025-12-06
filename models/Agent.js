const mongoose = require("mongoose");

const agentSchema = new mongoose.Schema({
    username: String,
    password: String,
    online: { type: Boolean, default: false }
});

module.exports = mongoose.model("Agent", agentSchema);
