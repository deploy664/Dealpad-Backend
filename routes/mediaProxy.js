const express = require("express");
const axios = require("axios");
const router = express.Router();

// GET /media-proxy?url=...
router.get("/", async (req, res) => {
  const url = req.query.url;
  if (!url || !url.startsWith("https://")) {
    return res.status(400).send("Invalid URL");
  }
  try {
    const response = await axios.get(url, {
      responseType: "stream",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`
      }
    });
    res.setHeader("Content-Type", response.headers["content-type"] || "application/octet-stream");
    response.data.pipe(res);
  } catch (err) {
    res.status(500).send("Failed to fetch media");
  }
});

module.exports = router;
