const express = require("express");
const router = express.Router();

/* ============================
      SIMPLE ADMIN LOGIN
   - Uses env vars `ADMIN_USERNAME` / `ADMIN_PASSWORD`
   - Falls back to `admin` / `admin123` when not set
=============================== */
router.post("/login", (req, res) => {
  const { username, password } = req.body || {};

  const ADMIN_USER = process.env.ADMIN_USERNAME || "admin";
  const ADMIN_PASS = process.env.ADMIN_PASSWORD || "admin123";

  if (username === ADMIN_USER && password === ADMIN_PASS) {
    return res.send({ success: true, adminId: ADMIN_USER });
  }

  return res.status(401).send({ error: "Invalid credentials" });
});

module.exports = router;
