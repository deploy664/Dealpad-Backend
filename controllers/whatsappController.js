const axios = require("axios");
const Agent = require("../models/Agent");
const Routing = require("../models/Routing");  // <-- New model
const Message = require("../models/Message");

exports.sendMessage = async (req, res) => {
  const { to, message } = req.body;

  if (!to || !message) {
    return res.status(400).json({ error: "to & message required" });
  }

  try {

    /* =====================================================
       STEP 1: Get all agents
    ===================================================== */
    const onlineAgents = await Agent.find({ online: true }).sort({ _id: 1 });
    const offlineAgents = await Agent.find({ online: false }).sort({ _id: 1 });

    let pool = [];

    // Prefer ONLINE agents first
    if (onlineAgents.length > 0) {
      pool = onlineAgents;
    } else {
      pool = offlineAgents; // fallback if all offline
    }

    if (pool.length === 0) {
      return res.status(500).json({ error: "No agents found" });
    }

    /* =====================================================
       STEP 2: Get Round-Robin index
    ===================================================== */
    let routing = await Routing.findOne();
    if (!routing) routing = await Routing.create({ lastIndex: 0 });

    const index = routing.lastIndex % pool.length;
    const assignedAgent = pool[index];

    // Update next index
    routing.lastIndex = (routing.lastIndex + 1) % pool.length;
    await routing.save();

    /* =====================================================
       STEP 3: SAVE MESSAGE IN DB
    ===================================================== */
    await Message.create({
      agentId: assignedAgent._id,
      customerNumber: to,
      message,
      sender: "agent",
    });

    /* =====================================================
       STEP 4: Send message to WhatsApp API
    ===================================================== */
    const url = `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`;

    const result = await axios.post(
      url,
      {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: message }
      },
      {
        headers: {
          "Authorization": `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    /* =====================================================
       STEP 5: Respond back
    ===================================================== */
    return res.json({
      success: true,
      assignedTo: assignedAgent.username,   // <--- who handled it
      whatsappResponse: result.data
    });

  } catch (err) {
    console.log("Send Message Error:", err.response?.data || err);
    return res.status(500).json({
      error: "Failed to send message",
      details: err.response?.data
    });
  }
};
