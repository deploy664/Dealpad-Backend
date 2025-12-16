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
    const body = req.body;
    const msg = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg) return res.sendStatus(200);

    const from = msg.from;
    const msgType = msg.type;

    console.log("🔥 Incoming Type:", msgType);

    /* ===== ROUND ROBIN AGENT ASSIGN ===== */
    let convo = await Conversation.findOne({ customer_phone: from });

    if (!convo) {
      console.log("🆕 New customer:", from);

      const allAgents = await Agent.find({ online: true }).sort({ _id: 1 });
      let assigned = null;

      if (allAgents.length > 0) {
        let lastIndex = global.lastAssignedIndex || 0;
        assigned = allAgents[lastIndex % allAgents.length]._id;
        global.lastAssignedIndex = (lastIndex + 1) % allAgents.length;

        console.log("🎯 Assigned via round robin:", assigned);
      }

      convo = await Conversation.create({
        customer_phone: from,
        assigned_agent: assigned
      });

      let exists = await Customer.findOne({ number: from });
      if (!exists) {
        await Customer.create({
          number: from,
          assignedTo: assigned
        });
        console.log("📌 Customer saved:", from);
      }
    }

    /* ===== PARSE MESSAGE ===== */
    const content = {
      from,
      sender: "customer",
      message: null,
      fileData: null,
      fileName: null,
      fileType: null,
      voiceNote: false,
      audioData: null
    };

    if (msgType === "text") {
      content.message = msg.text.body;
    }

    if (msgType === "image") {
      const media = await downloadMedia(msg.image.id);
      content.fileData = media.base64;
      content.fileName = "image.jpg";
      content.fileType = media.mime;
    }

    if (msgType === "document") {
      const media = await downloadMedia(msg.document.id);
      content.fileData = media.base64;
      content.fileName = msg.document.filename;
      content.fileType = msg.document.mime_type;
    }

    if (msgType === "audio") {
      const media = await downloadMedia(msg.audio.id);
      content.voiceNote = true;
      content.audioData = media.base64;
      content.fileType = media.mime;
    }

    /* ===== SAVE MESSAGE ===== */
    await Message.create({
      conversation_id: convo._id,
      sender: "customer",
      ...content
    });

    /* ===== SOCKET TO AGENT ===== */
    const io = req.app.get("socketio");
    const agentId = convo.assigned_agent?.toString();
    const agentSocket = global.agentSockets?.[agentId];

    if (agentSocket) {
      io.to(agentSocket).emit("incoming_message", content);
      console.log("📨 Delivered to agent:", agentId);
    } else {
      console.log("⚠ Agent offline");
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Webhook Error:", err);
    res.sendStatus(500);
  }
});

/* =========================
   MEDIA DOWNLOAD
========================= */
async function downloadMedia(mediaId) {
  const token = process.env.WHATSAPP_TOKEN;

  const meta = await axios.get(
    `https://graph.facebook.com/v20.0/${mediaId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  const mediaUrl = meta.data.url;

  const file = await axios.get(mediaUrl, {
    responseType: "arraybuffer",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const mime = file.headers["content-type"];
  const base64 =
    "data:" + mime + ";base64," + Buffer.from(file.data).toString("base64");

  return { base64, mime };
}

module.exports = router;
