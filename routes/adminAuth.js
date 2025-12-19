const express = require("express");
const router = express.Router();
const Admin = require("../models/Admin");

/* ============================
      ADMIN LOGIN (DB-backed)
   - Checks `admins` collection for username/password
   - Returns `adminId` as the admin's username
=============================== */
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).send({ error: "username and password required" });

    const admin = await Admin.findOne({ username, password });
    if (!admin) return res.status(401).send({ error: "Invalid credentials" });

    return res.send({ success: true, adminId: admin.username, name: admin.name || null });
  } catch (err) {
    console.log("❌ adminAuth error:", err);
    return res.status(500).send({ error: "Server error" });
  }
});

module.exports = router;
