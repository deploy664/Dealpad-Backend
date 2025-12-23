const express = require("express");
const router = express.Router();
const Agent = require("../models/Agent");
const Customer = require("../models/Customer");
const Conversation = require("../models/Conversation");

/* ============================
      LOGIN
=============================== */
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  const agent = await Agent.findOne({ username, password });
  if (!agent) return res.status(401).send({ error: "Invalid credentials" });

  agent.online = true;
  await agent.save();

  res.send({
    success: true,
    agentId: agent._id,
    username: agent.username,
  });
});

/* ============================
      LOGOUT
=============================== */
router.post("/logout", async (req, res) => {
  const { agentId } = req.body;

  await Agent.findByIdAndUpdate(agentId, { online: false });
  res.send({ success: true });
});

/* ============================================================
   SMART FUNCTION: GET NEXT AGENT IN ROUND-ROBIN
=============================================================== */
async function getNextAgent() {
  const onlineAgents = await Agent.find({ online: true }).sort({ _id: 1 });
  let agentPool = onlineAgents;

  // If no one is online → use all agents
  if (agentPool.length === 0) {
    agentPool = await Agent.find({}).sort({ _id: 1 });
  }

  if (agentPool.length === 0) return null;

  // Find last assigned customer
  const lastCustomer = await Customer.findOne({}).sort({ assignedAt: -1 });

  // If no assigned customers yet → return first agent
  if (!lastCustomer) return agentPool[0]._id;

  const lastAssignedAgentId = lastCustomer.assignedTo.toString();
  const index = agentPool.findIndex((a) => a._id.toString() === lastAssignedAgentId);

  // If not found (rare case)
  if (index === -1) return agentPool[0]._id;

  // ROUND ROBIN NEXT AGENT
  const nextIndex = (index + 1) % agentPool.length;
  return agentPool[nextIndex]._id;
}

/* ============================================================
   ASSIGN CUSTOMER (used by webhook)
=============================================================== */
router.post("/assign-customer", async (req, res) => {
  try {
    const { phone } = req.body;

    let customer = await Customer.findOne({ phone });

    if (!customer) {
      const assignedTo = await getNextAgent();

      customer = await Customer.create({
        phone,
        assignedTo,
        assignedAt: new Date(),
      });
    }

    res.send({ success: true, assignedTo: customer.assignedTo });
  } catch (err) {
    console.log("❌ assign-customer Error:", err);
    res.status(500).send({ error: "Server error" });
  }
});

/* ============================================================
   RETURN CUSTOMERS FOR LOGGED-IN AGENT
=============================================================== */
router.get("/customers", async (req, res) => {
  const { agentId } = req.query;
  if (!agentId) return res.status(400).send({ error: "agentId required" });

  const customers = await Customer.find({ assignedTo: agentId }).sort({ assignedAt: -1 });

  res.send(customers);
});

/* ============================================================
   GET UNREAD COUNTS FOR AGENT (new route)
=============================================================== */
router.get("/unread_counts", async (req, res) => {
  const { agentId } = req.query;
  if (!agentId) return res.status(400).send("Missing agentId");

  try {
    // Find all conversations assigned to this agent
    const convs = await Conversation.find({ assigned_agent: agentId });

    // Map results to desired output shape
    const counts = convs.map((c) => ({
      customer: c.customer_phone,
      unreadCount: c.unreadCount || 0,
    }));

    res.json(counts);
  } catch (err) {
    console.error("❌ unread_counts error:", err);
    res.status(500).send("Server error");
  }
});

module.exports = router;
