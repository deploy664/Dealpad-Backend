const express = require("express");
const router = express.Router();
const Conversation = require("../models/Conversation");

module.exports = io => {

  router.get("/all-chats", async (req, res) => {
    const chats = await Conversation.find()
      .sort({ updatedAt: -1 });

    res.json(chats);
  });

  // 🔥 SEND TO ADMIN SOCKET
  router.get("/emit-all-chats", async (req, res) => {
    const chats = await Conversation.find();
    io.to("admins").emit("admin_all_chats", chats);
    res.send("sent");
  });

  return router;
};
