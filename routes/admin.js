const express = require("express");
const router = express.Router();
const Conversation = require("../models/Conversation");

module.exports = io => {

  router.get("/all-chats", async (req, res) => {
    const chats = await Conversation.find()
      .sort({ updatedAt: -1 })
      .populate("assigned_agent", "username")
      .lean();

    // normalize shape for frontend
    const mapped = chats.map(c => ({
      customer: c.customer_phone,
      agent: c.assigned_agent ? c.assigned_agent.username : null,
      raw: c
    }));

    res.json(mapped);
  });

  // 🔥 SEND TO ADMIN SOCKET
  router.get("/emit-all-chats", async (req, res) => {
    const chats = await Conversation.find()
      .populate("assigned_agent", "username")
      .lean();

    const mapped = chats.map(c => ({
      customer: c.customer_phone,
      agent: c.assigned_agent ? c.assigned_agent.username : null,
      raw: c
    }));

    io.to("admins").emit("admin_all_chats", mapped);
    res.send("sent");
  });

  return router;
};
