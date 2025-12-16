const express = require("express");
const Admin = require("../models/Admin");
const router = express.Router();

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const admin = await Admin.findOne({ username, password });
    if (!admin) {
      return res.status(401).json({ success: false });
    }

    res.json({
      success: true,
      adminId: admin._id
    });

  } catch (err) {
    res.status(500).json({ success: false });
  }
});

module.exports = router;
