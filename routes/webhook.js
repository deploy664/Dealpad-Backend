const express = require("express");
const router = express.Router();
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const Agent = require("../models/Agent");
const Customer = require("../models/Customer");

/* =========================
      VERIFY WEBHOOK
========================= */
router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

/* =========================
   HANDLE INCOMING MESSAGE
========================= */
router.post("/", async (req, res) => {
  try {
    const messages =
      req.body.entry?.[0]?.changes?.[0]?.value?.messages || [];

    if (!messages.length) return res.sendStatus(200);

    for (const msg of messages) {
      const from = msg.from;
      const type = msg.type;

      console.log("🔥 Incoming:", type);

      // 🔒 Prevent duplicate messages
      const already = await Message.findOne({ whatsapp_msg_id: msg.id });
      if (already) continue;

      /* =========================
         FIND / CREATE CONVO
      ========================= */
      let convo = await Conversation.findOne({ customer_phone: from });

      if (!convo) {
        const agents = await Agent.find({ online: true }).sort({ _id: 1 });
        let assigned = null;

        if (agents.length) {
          global.lastAssignedIndex = global.lastAssignedIndex || 0;
          assigned =
            agents[global.lastAssignedIndex % agents.length]._id;
          global.lastAssignedIndex++;
        }

        convo = await Conversation.create({
          customer_phone: from,
          assigned_agent: assigned
        });

        await Customer.updateOne(
          { number: from },
          { $setOnInsert: { number: from, assignedTo: assigned } },
          { upsert: true }
        );
      }

      /* =========================
         BUILD MESSAGE
      ========================= */
      const messageDoc = {
        whatsapp_msg_id: msg.id,
        conversation_id: convo._id,
        sender: "customer",
        message: null,
        mediaType: null,
        mediaUrl: null,
        mimeType: null,
        fileName: null
      };

      if (type === "text") {
        messageDoc.message = msg.text.body;
      }

      /* =========================
         MEDIA HANDLING
      ========================= */
      if (["image", "audio", "document"].includes(type)) {
        const mediaId = msg[type].id;
        const mimeType =
          msg[type].mime_type ||
          (type === "audio" ? "audio/ogg" : "image/jpeg");

        // 1️⃣ Get media URL
        const mediaMeta = await axios.get(
          `https://graph.facebook.com/v18.0/${mediaId}`,
          {
            headers: {
              Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`
            }
          }
        );

        // 2️⃣ Download media
        const mediaFile = await axios.get(mediaMeta.data.url, {
          headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`
          },
          responseType: "arraybuffer"
        });

        // 3️⃣ Save file
        const ext = mimeType.split("/")[1] || "bin";
        const fileName = `${Date.now()}-${mediaId}.${ext}`;
        const filePath = path.join(__dirname, "../uploads", fileName);

        fs.writeFileSync(filePath, mediaFile.data);

        messageDoc.mediaType = type;
        messageDoc.mimeType = mimeType;
        messageDoc.mediaUrl = `/uploads/${fileName}`;
        messageDoc.fileName = msg.document?.filename || fileName;
      }

      const savedMessage = await Message.create(messageDoc);

      /* =========================
         SOCKET → AGENT
      ========================= */
      const io = req.app.get("socketio");
      const agentId = convo.assigned_agent?.toString();
      const socketId = global.agentSockets?.[agentId];

      if (socketId) {
        io.to(socketId).emit("incoming_message", {
          _id: savedMessage._id,
          from,
          sender: "customer",
          message: savedMessage.message,
          mediaType: savedMessage.mediaType,
          mediaUrl: savedMessage.mediaUrl,
          mimeType: savedMessage.mimeType,
          createdAt: savedMessage.createdAt
        });
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Webhook error:", err);
    res.sendStatus(500);
  }
});

module.exports = router;
