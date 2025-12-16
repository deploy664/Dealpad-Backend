const express = require("express");
const router = express.Router();
const axios = require("axios");

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
    const msg =
      req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!msg) return res.sendStatus(200);

    const from = msg.from;
    const type = msg.type;

    console.log("🔥 Incoming:", type);

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
        BUILD MESSAGE (NO BASE64)
    ========================= */
    const messageDoc = {
  conversation_id: convo._id,
  sender: "customer",
  message: null,
  mediaId: null,
  mediaType: null,
  mimeType: null,
  fileName: null
};


   if (type === "text") {
  messageDoc.message = msg.text.body;
}

if (type === "image") {
  messageDoc.mediaId = msg.image.id;
  messageDoc.mediaType = "image";
  messageDoc.mimeType = msg.image.mime_type || "image/jpeg";
}

if (type === "document") {
  messageDoc.mediaId = msg.document.id;
  messageDoc.mediaType = "document";
  messageDoc.mimeType = msg.document.mime_type;
  messageDoc.fileName = msg.document.filename;
}

if (type === "audio") {
  messageDoc.mediaId = msg.audio.id;
  messageDoc.mediaType = "audio";
  messageDoc.mimeType = msg.audio.mime_type || "audio/ogg";
}

    await Message.create(messageDoc);

    /* =========================
        SOCKET → AGENT
    ========================= */
    const io = req.app.get("socketio");
    const agentId = convo.assigned_agent?.toString();
    const socketId = global.agentSockets[agentId];

    if (socketId) {
      io.to(socketId).emit("incoming_message", {
        from,
        ...messageDoc
      });
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Webhook error:", err);
    res.sendStatus(500);
  }
});

module.exports = router;
