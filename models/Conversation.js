const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ConversationSchema = new Schema({
  customer_phone: {
    type: String,
    required: true,
    unique: true
  },

  assigned_agent: {
    type: Schema.Types.ObjectId,
    ref: "Agent",
    default: null
  },

  status: {
    type: String,
    enum: ['open', 'closed'],
    default: 'open'
  },

  unreadCount: {
    type: Number,
    default: 0
  },

  // Optional: Track who has unread messages (e.g., 'agent' or 'customer')
  unreadFor: {
    type: String,
    enum: ['agent', 'customer', null],
    default: null
  },

  created_at: {
    type: Date,
    default: Date.now
  },

  updated_at: {
    type: Date,
    default: Date.now
  }
});

/* FIXED — REMOVE next(), Mongoose 7+ */
ConversationSchema.pre("save", function () {
  this.updated_at = Date.now();
});

module.exports = mongoose.model('Conversation', ConversationSchema);
