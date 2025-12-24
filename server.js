// server.js (FINAL - ready to paste)
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
const Agent = require("./models/Agent");


app.use(cors());
app.use(express.json({ limit: "30mb" }));

/* SOCKET.IO SETUP */
const io = new Server(server, {
  cors: { origin: "*" }
});
app.set("socketio", io);

/* Agent Sockets map */
global.agentSockets = {};

/* ======================================================
   🔌 SOCKET CONNECTION
====================================================== */
io.on("connection", socket => {
  console.log("🔌 Socket connected:", socket.id);

  /* --- REGISTER AGENT --- */
socket.on("register_agent", async (agentId) => {
  try {
    if (!agentId) return;

    socket.agentId = agentId; // IMPORTANT

    global.agentSockets[agentId] = socket.id;

    await Agent.findByIdAndUpdate(agentId, {
      online: true,
      lastSeen: new Date()
    });

    console.log(`🟢 Agent ONLINE: ${agentId}`);
  } catch (err) {
    console.log("❌ register_agent error:", err);
  }
});


  /* --- LOAD CHAT HISTORY --- */
  socket.on("load_messages", async (customerNumber) => {
    try {
      if (!customerNumber) return socket.emit("chat_history", []);
      const convo = await Conversation.findOne({ customer_phone: customerNumber });
      if (!convo) return socket.emit("chat_history", []);
      const messages = await Message.find({ conversation_id: convo._id }).sort({ createdAt: 1 });
      socket.emit("chat_history", messages);
    } catch (err) {
      console.log("❌ load_messages error:", err);
      socket.emit("chat_history", []);
    }
  });

  /* ======================================================
     🟢 AGENT SEND MESSAGE → SAVE ONLY (NO BROADCAST)
     IMPORTANT: frontend is responsible for calling /send to actually send to WhatsApp.
     We DO NOT emit the agent's message back as an incoming_message to avoid duplicates.
  ====================================================== */
  socket.on("agent_message", async (data) => {
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

      /* Find or create conversation */
      let convo = await Conversation.findOne({ customer_phone: to });

      if (!convo) {
        convo = await Conversation.create({
          customer_phone: to,
          assigned_agent: agentId || null
        });
      }

      /* SAVE message in DB */
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

      /* NOTE: DO NOT emit incoming_message to this same agent socket.
         Frontend already shows local echo. Emitting caused duplicate UI entries.
         If you need server -> agent notifications in future, emit a separate event,
         not `incoming_message`. */

    } catch (err) {
      console.log("❌ agent_message error:", err);
    }
  });

  /* --- DISCONNECT --- */
  socket.on("disconnect", async () => {
  try {
    const agentId = socket.agentId;

    if (agentId) {
      delete global.agentSockets[agentId];

      await Agent.findByIdAndUpdate(agentId, {
        online: false,
        lastSeen: new Date()
      });

      console.log(`🔴 Agent OFFLINE: ${agentId}`);
    }

  } catch (err) {
    console.log("❌ disconnect error:", err);
  }
});
});

/* ROUTES */
app.use("/webhook", require("./routes/webhook"));     // handles incoming WA -> server
app.use("/send", require("./routes/sendMessage"));   // endpoint that sends to WhatsApp
app.use("/agent", require("./routes/agentAuth"));    // agent login / customers

/* ======================================================
   🛢️ MONGO CONNECT
====================================================== */
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.log("❌ MongoDB Error:", err));

/* ======================================================
   🚀 START SERVER
====================================================== */
server.listen(3000, () => {
  console.log("🚀 Server running on port 3000");
});
