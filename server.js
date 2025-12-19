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

app.use(cors());
app.use(express.json({ limit: "30mb" }));

/* SOCKET.IO SETUP */
const io = new Server(server, {
  cors: { origin: "*" }
});
app.set("socketio", io);

/* SOCKET MAPS */
global.agentSockets = {};
global.adminSockets = {};

/* ======================================================
   🔌 SOCKET CONNECTION
====================================================== */
io.on("connection", socket => {
  console.log("🔌 Socket connected:", socket.id);

  /* ---------- REGISTER AGENT ---------- */
  socket.on("register_agent", agentId => {
    if (!agentId) return;
    global.agentSockets[agentId] = socket.id;
    console.log(`🟢 Agent registered: ${agentId}`);
  });

  /* ---------- REGISTER ADMIN ---------- */
  socket.on("admin_register", adminId => {
    if (!adminId) return;
    global.adminSockets[adminId] = socket.id;
    socket.join("admins");
    console.log(`🟣 Admin registered: ${adminId}`);
  });

  /* ---------- ADMIN: GET ALL CHATS ---------- */
  socket.on("admin_get_all_chats", async () => {
    try {
      const chats = await Conversation.find()
        .sort({ updatedAt: -1 })
        .populate("assigned_agent", "username")
        .lean();

      const mapped = chats.map(c => ({
        customer: c.customer_phone,
        agent: c.assigned_agent ? c.assigned_agent.username : null,
        raw: c
      }));

      socket.emit("admin_all_chats", mapped);
    } catch (err) {
      console.log("❌ admin_get_all_chats error:", err);
      socket.emit("admin_all_chats", []);
    }
  });

  /* ---------- LOAD CHAT HISTORY ---------- */
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

  /* ======================================================
     🟢 AGENT MESSAGE
  ====================================================== */
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

      // ✅ FIX: update conversation timestamp
      await Conversation.findByIdAndUpdate(convo._id, {
        updatedAt: new Date()
      });

    } catch (err) {
      console.log("❌ agent_message error:", err);
    }
  });

  /* ======================================================
     🟣 ADMIN MESSAGE
  ====================================================== */
    socket.on("admin_message", async (data) => {
      try {
        const {
          to,
          message,
          fileData,
          audioData,
          fileType,
          fileName,
          voiceNote
        } = data;

        if (!to) return;

        let convo = await Conversation.findOne({ customer_phone: to });
        if (!convo) return;

        await Message.create({
          conversation_id: convo._id,
          sender: "admin",
          message: message || "",
          fileName: fileName || null,
          fileData: fileData || null,
          fileType: fileType || null,
          voiceNote: !!voiceNote,
          audioData: audioData || null
        });

        // ✅ FIX: update conversation timestamp
        await Conversation.findByIdAndUpdate(convo._id, {
          updatedAt: new Date()
        });

        // Send to WhatsApp using the same logic as /send route
        const axios = require("axios");
        const { uploadMedia, convertWebmToOgg } = require("./routes/sendMessage");
        const url = `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_ID}/messages`;
        let payload = {
          messaging_product: "whatsapp",
          to
        };

        if (message && !fileData && !audioData) {
          payload.type = "text";
          payload.text = { body: message };
        }
        if (voiceNote && audioData) {
          let finalAudio = audioData;
          let finalType = fileType || "audio/ogg";
          if (fileType && fileType.includes("webm")) {
            finalAudio = await convertWebmToOgg(audioData);
            finalType = "audio/ogg";
          }
          const mediaId = await uploadMedia(finalAudio, finalType);
          payload.type = "audio";
          payload.audio = { id: mediaId };
        }
        if (fileData && !voiceNote) {
          const mediaId = await uploadMedia(
            fileData,
            fileType || "application/octet-stream"
          );
          if (fileType?.startsWith("image")) {
            payload.type = "image";
            payload.image = { id: mediaId, caption: message || "" };
          } else {
            payload.type = "document";
            payload.document = {
              id: mediaId,
              filename: fileName || "file"
            };
          }
        }
        await axios.post(url, payload, {
          headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
            "Content-Type": "application/json"
          }
        });

        // Notify assigned agent if online
        if (
          convo.assigned_agent &&
          global.agentSockets[convo.assigned_agent]
        ) {
          io.to(global.agentSockets[convo.assigned_agent]).emit(
            "incoming_message",
            {
              from: to,
              message,
              sender: "admin",
              fileData,
              audioData,
              fileType,
              fileName,
              voiceNote
            }
          );
        }

      } catch (err) {
        console.log("❌ admin_message error:", err);
      }
    });

  socket.on("disconnect", () => {
    for (let id in global.agentSockets) {
      if (global.agentSockets[id] === socket.id) {
        delete global.agentSockets[id];
      }
    }

    for (let id in global.adminSockets) {
      if (global.adminSockets[id] === socket.id) {
        delete global.adminSockets[id];
      }
    }

    console.log("🔴 Socket disconnected:", socket.id);
  });
});

/* ROUTES */
app.use("/webhook", require("./routes/webhook"));
app.use("/send", require("./routes/sendMessage"));
app.use("/agent", require("./routes/agentAuth"));
app.use("/admin", require("./routes/adminAuth"));
app.use("/admin/api", require("./routes/admin")(io));

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.log("❌ MongoDB Error:", err));

server.listen(3000, () => {
  console.log("🚀 Server running on port 3000");
});
