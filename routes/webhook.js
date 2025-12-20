const express = require("express");
const router = express.Router();

async function urlToBase64(url, mimeType = 'application/octet-stream') {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`
      }
    });
    const base64 = Buffer.from(response.data, 'binary').toString('base64');
    return `data:${mimeType};base64,${base64}`;
  } catch (err) {
    console.error('Failed to fetch media from WhatsApp:', url, err.response?.status, err.response?.data);
    return null;
  }
}

const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const Agent = require("../models/Agent");
const Customer = require("../models/Customer");

/* VERIFY WEBHOOK */
router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  res.sendStatus(403);
});

/* HANDLE INCOMING WHATSAPP MSG */
router.post("/", async (req, res) => {
  try {
    const body = req.body;
    const msg = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg) return res.sendStatus(200);

    const from = msg.from;
    const msgType = msg.type;

    let convo = await Conversation.findOne({ customer_phone: from });

    if (!convo) {
      const allAgents = await Agent.find({ online: true }).sort({ _id: 1 });
      let assigned = null;

      if (allAgents.length > 0) {
        let lastIndex = global.lastAssignedIndex || 0;
        assigned = allAgents[lastIndex % allAgents.length]._id;
        global.lastAssignedIndex = (lastIndex + 1) % allAgents.length;
      }

      convo = await Conversation.create({
        customer_phone: from,
        assigned_agent: assigned
      });

      const exists = await Customer.findOne({ number: from });
      if (!exists) {
        await Customer.create({
          number: from,
          assignedTo: assigned || null
        });
      }
    }

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
    } else if (msgType === "image" && msg.image?.url) {
      content.fileType = msg.image.mime_type || "image/jpeg";
      content.fileData = await urlToBase64(msg.image.url, content.fileType);
      content.fileName = msg.image.filename || "image.jpg";
    } else if (msgType === "audio" && msg.audio?.url) {
      content.voiceNote = true;
      content.fileType = msg.audio.mime_type || "audio/ogg";
      content.audioData = await urlToBase64(msg.audio.url, content.fileType);
    } else if (msgType === "document" && msg.document?.url) {
      content.fileType = msg.document.mime_type;
      content.fileData = await urlToBase64(msg.document.url, content.fileType);
      content.fileName = msg.document.filename;
    }

    await Message.create({
      conversation_id: convo._id,
      sender: "customer",
      ...content
    });

    // ✅ FIX
    await Conversation.findByIdAndUpdate(convo._id, {
      updatedAt: new Date()
    });

    const io = req.app.get("socketio");

    const agentId = convo.assigned_agent?.toString();
    const agentSocket = global.agentSockets[agentId];

    if (agentSocket) {
      io.to(agentSocket).emit("incoming_message", {
        ...content,
        from
      });
    }

    io.to("admins").emit("new_message", {
      customer: from,
      sender: "customer",
      message: content.message || "[media]",
      fileData: content.fileData || null,
      fileType: content.fileType || null,
      fileName: content.fileName || null,
      voiceNote: content.voiceNote || false,
      audioData: content.audioData || null,
      createdAt: new Date()
    });

    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Webhook Error:", err);
    res.sendStatus(500);
  }
});

module.exports = router;
