const express = require("express");
const router = express.Router();
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const Agent = require("../models/Agent");

/* VERIFY WEBHOOK */
router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const challenge = req.query["hub.challenge"];
  const token = req.query["hub.verify_token"];

  if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  res.sendStatus(403);
});

/* POST WEBHOOK - RECEIVE WHATSAPP MESSAGE */
router.post("/", async (req, res) => {
  try {
    const body = req.body;

    const msg =
      body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!msg) return res.sendStatus(200);

    const from = msg.from; // customer number
    const msgType = msg.type;

    console.log("🔥 Incoming WhatsApp Type:", msgType);

    /* ========== GET OR CREATE CONVERSATION ========== */
    let convo = await Conversation.findOne({ customer_phone: from });

    if (!convo) {
      const onlineAgents = await Agent.find({ online: true });

      let assignedAgent = null;

      if (onlineAgents.length > 0) {
        assignedAgent = onlineAgents[0]._id;
      } else {
        const allAgents = await Agent.find({});
        if (allAgents.length > 0) {
          assignedAgent = allAgents[0]._id;
        }
      }

      convo = await Conversation.create({
        customer_phone: from,
        assigned_agent: assignedAgent
      });
    }

    /* ========== PARSE MESSAGE CONTENT ========== */
    let content = {
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

    else if (msgType === "image") {
      content.fileData = msg.image.link;
      content.fileType = "image/jpeg";
      content.fileName = "image.jpg";
    }

    else if (msgType === "document") {
      content.fileData = msg.document.link;
      content.fileType = msg.document.mime_type;
      content.fileName = msg.document.filename;
    }

    else if (msgType === "audio") {
      content.voiceNote = true;
      content.audioData = msg.audio.link;
      content.fileType = "audio/ogg";
    }

    /* ========== SAVE MESSAGE ========= */
    await Message.create({
      conversation_id: convo._id,
      sender: "customer",
      ...content
    });

    /* ========== SEND TO ASSIGNED AGENT SOCKET ========== */
    const io = req.app.get("socketio");

    const agentIdStr = convo.assigned_agent?.toString();
    const agentSocket = global.agentSockets[agentIdStr];

    if (agentSocket) {
      io.to(agentSocket).emit("incoming_message", {
        ...content,
        from
      });
      console.log("📨 Sent to agent:", agentIdStr);
    } else {
      console.log("❌ No active socket for agent:", agentIdStr);
    }

    res.sendStatus(200);
  } catch (err) {
    console.log("❌ Webhook Error:", err);
    res.sendStatus(500);
  }
});

module.exports = router;
