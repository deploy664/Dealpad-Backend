require("dotenv").config();

const express = require("express");
const axios = require("axios");
const FormData = require("form-data");
const { exec } = require("child_process");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const Conversation = require("../models/Conversation"); // Import Conversation model

const router = express.Router();

/* ======================================================
   🎵 BACKGROUND: WEBM → OGG (NON-BLOCKING)
====================================================== */
async function convertWebmToOgg(base64Data) {
  const id = crypto.randomBytes(8).toString("hex");
  const inputPath = path.join("/tmp", `voice_${id}.webm`);
  const outputPath = path.join("/tmp", `voice_${id}.ogg`);

  const b64 = base64Data.split(",")[1];
  await fs.writeFile(inputPath, Buffer.from(b64, "base64"));

  await new Promise((resolve, reject) => {
    exec(
      `ffmpeg -loglevel error -y -i "${inputPath}" -ac 1 -ar 48000 -c:a libopus -b:a 48k "${outputPath}"`,
      err => (err ? reject(err) : resolve())
    );
  });

  const oggBuffer = await fs.readFile(outputPath);
  await fs.unlink(inputPath).catch(() => {});
  await fs.unlink(outputPath).catch(() => {});

  return "data:audio/ogg;base64," + oggBuffer.toString("base64");
}

/* ======================================================
   📸 UPLOAD MEDIA → GET media_id
====================================================== */
async function uploadMedia(base64, mimeType) {
  const [, b64] = base64.split(",");
  const buffer = Buffer.from(b64, "base64");

  const form = new FormData();
  form.append("file", buffer, { filename: "media", contentType: mimeType });
  form.append("messaging_product", "whatsapp");

  const url = `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_ID}/media`;

  const res = await axios.post(url, form, {
    headers: {
      ...form.getHeaders(),
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`
    }
  });

  return res.data.id;
}

/* ======================================================
   🚀 SEND MESSAGE (WITH UNREAD UPDATE)
====================================================== */
router.post("/", async (req, res) => {
  try {
    const {
      to,
      message,
      fileData,
      audioData,
      fileType,
      fileName,
      voiceNote,
      senderType // "agent" or "customer" - frontend se zaroor bhejna
    } = req.body;

    if (!to) return res.status(400).json({ error: "Missing recipient" });

    // Instant response
    res.json({ success: true });

    // Background async process
    setImmediate(async () => {
      try {
        // 1. Update unread count in Conversation
        let conversation = await Conversation.findOne({ customer_phone: to });

        if (!conversation) {
          conversation = new Conversation({ customer_phone: to });
        }

        if (senderType === "customer") {
          conversation.unreadCount = (conversation.unreadCount || 0) + 1;
          conversation.unreadFor = "agent";
        } else if (senderType === "agent") {
          conversation.unreadCount = 0;
          conversation.unreadFor = null;
        }

        await conversation.save();

        // 2. Prepare WhatsApp payload
        const url = `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_ID}/messages`;

        let payload = {
          messaging_product: "whatsapp",
          to
        };

        if (message && !fileData && !audioData) {
          payload.type = "text";
          payload.text = { body: message };
        }

        if (voiceNote && audioData) {
          let finalAudio = audioData;
          let finalType = fileType || "audio/ogg";

          if (fileType && fileType.includes("webm")) {
            finalAudio = await convertWebmToOgg(audioData);
            finalType = "audio/ogg";
          }

          const mediaId = await uploadMedia(finalAudio, finalType);
          payload.type = "audio";
          payload.audio = { id: mediaId };
        }

        if (fileData && !voiceNote) {
          const mediaId = await uploadMedia(
            fileData,
            fileType || "application/octet-stream"
          );

          if (fileType?.startsWith("image")) {
            payload.type = "image";
            payload.image = { id: mediaId, caption: message || "" };
          } else {
            payload.type = "document";
            payload.document = {
              id: mediaId,
              filename: fileName || "file"
            };
          }
        }

        await axios.post(url, payload, {
          headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
            "Content-Type": "application/json"
          }
        });

        console.log("✅ WhatsApp sent:", to);
      } catch (e) {
        console.error("❌ Background send error:", e.response?.data || e.message);
      }
    });
  } catch (err) {
    console.error("❌ Send route error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

module.exports = router;
