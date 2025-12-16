// server.js (FINAL - PRODUCTION SAFE)

const express = require("express");
const app = express();
const cors = require("cors");
const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");
const mongoose = require("mongoose");

require("dotenv").config();

/* MODELS */
const Message = require("./models/Message");
const Conversation = require("./models/Conversation");
const Admin = require("./models/Admin");
const Agent = require("./models/Agent");
const Chat = require("./models/Chat");

app.use(cors());
app.use(express.json({ limit: "30mb" }));

/* SOCKET.IO SETUP */
const io = new Server(server, {
  cors: { origin: "*" }
});
app.set("socketio", io);

/* Agent sockets map */
global.agentSockets = {};

/* ======================================================
   🔌 SOCKET CONNECTION
====================================================== */
io.on("connection", socket => {
  console.log("🔌 Socket connected:", socket.id);

  /* ============================
     🟢 REGISTER AGENT
  ============================ */
  socket.on("register_agent", agentId => {
    if (!agentId) return;
    global.agentSockets[agentId] = socket.id;
    console.log(`🟢 Agent registered: ${agentId}`);
  });

  /* ============================
     👑 REGISTER ADMIN
  ============================ */
  socket.on("admin_register", async adminId => {
    try {
      if (!adminId) return;

      socket.join("admins");
      console.log("👑 Admin connected:", adminId);

      // Agents list
      const agents = await Agent.find({}, "_id name online");
      socket.emit("agents_cache", agents);

      // Agent stats
      const agentStats = await Promise.all(
        agents.map(async a => ({
          _id: a._id,
          name: a.name,
          online: a.online,
          activeChats: await Chat.countDocuments({ agent: a._id })
        }))
      );

      socket.emit("agents_status", agentStats);

      // Active chats
      const chats = await Chat.find({}, "customer agent updatedAt");
      socket.emit("active_chats", chats);

    } catch (e) {
      console.log("❌ admin_register error:", e);
    }
  });

  /* ============================
     🔁 TRANSFER CHAT
  ============================ */
  socket.on("transfer_chat", async ({ customer, agentId }) => {
    try {
      if (!customer || !agentId) return;

      await Chat.findOneAndUpdate(
        { customer },
        { agent: agentId, updatedAt: new Date() },
        { upsert: true }
      );

      const chats = await Chat.find({}, "customer agent updatedAt");
      io.to("admins").emit("active_chats", chats);

    } catch (e) {
      console.log("❌ transfer_chat error:", e);
    }
  });

  /* ============================
     📜 LOAD CHAT HISTORY
  ============================ */
  socket.on("load_messages", async customerNumber => {
    try {
      if (!customerNumber) return socket.emit("chat_history", []);
      const convo = await Conversation.findOne({ customer_phone: customerNumber });
      if (!convo) return socket.emit("chat_history", []);

      const messages = await Message.find({
        conversation_id: convo._id
      }).sort({ createdAt: 1 });

      socket.emit("chat_history", messages);
    } catch (err) {
      console.log("❌ load_messages error:", err);
      socket.emit("chat_history", []);
    }
  });

  /* ============================
     📨 AGENT MESSAGE (SAVE ONLY)
  ============================ */
  socket.on("agent_message", async data => {
    try {
      const {
        to,
        message,
        fileData,
        audioData,
        fileType,
        fileName,
        voiceNote,
        agentId
      } = data;

      if (!to) return;

      let convo = await Conversation.findOne({ customer_phone: to });
      if (!convo) {
        convo = await Conversation.create({
          customer_phone: to,
          assigned_agent: agentId || null
        });
      }

      await Message.create({
        conversation_id: convo._id,
        sender: "agent",
        message: message || "",
        fileName: fileName || null,
        fileData: fileData || null,
        fileType: fileType || null,
        voiceNote: !!voiceNote,
        audioData: audioData || null
      });

    } catch (err) {
      console.log("❌ agent_message error:", err);
    }
  });

  /* ============================
     🔴 DISCONNECT
  ============================ */
  socket.on("disconnect", () => {
    for (let id in global.agentSockets) {
      if (global.agentSockets[id] === socket.id) {
        delete global.agentSockets[id];
      }
    }
    socket.leave("admins");
    console.log("🔴 Socket disconnected:", socket.id);
  });
});

/* ROUTES */
app.use("/webhook", require("./routes/webhook"));
app.use("/send", require("./routes/sendMessage"));
app.use("/agent", require("./routes/agentAuth"));
app.use("/admin", require("./routes/adminAuth"));

/* ============================
   🛢️ MONGO CONNECT
============================ */
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.log("❌ MongoDB Error:", err));

/* ============================
   🚀 START SERVER
============================ */
server.listen(3000, () => {
  console.log("🚀 Server running on port 3000");
});
