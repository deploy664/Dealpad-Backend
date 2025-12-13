const express = require("express");
const axios = require("axios");
const FormData = require("form-data");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const router = express.Router();

/* ==========================================
   FFMPEG: Convert WEBM → OGG (Opus) for WhatsApp
========================================== */
async function convertWebmToOgg(base64Data) {
  return new Promise((resolve, reject) => {
    try {
      const inputPath = path.join(__dirname, "voice_input.webm");
      const outputPath = path.join(__dirname, "voice_output.ogg");

      const b64 = base64Data.split(",")[1];
      fs.writeFileSync(inputPath, Buffer.from(b64, "base64"));

      const ffmpegPath = `"C:\\ProgramData\\chocolatey\\lib\\ffmpeg\\tools\\ffmpeg\\bin\\ffmpeg.exe"`;
      // ffmpeg command for WEBM to OGG (opus)
      const cmd = `${ffmpegPath} -y -i "${inputPath}" -c:a libopus -b:a 64k "${outputPath}"`;

      exec(cmd, (err) => {
        if (err) return reject(err);

        const oggBuffer = fs.readFileSync(outputPath);
        const finalBase64 = "data:audio/ogg;base64," + oggBuffer.toString("base64");

        fs.unlinkSync(inputPath);
        fs.unlinkSync(outputPath);

        resolve(finalBase64);
      });
    } catch (e) {
      reject(e);
    }
  });
}

/* ==========================================
         SEND MESSAGE TO WHATSAPP
========================================== */
router.post("/", async (req, res) => {
  try {
    let {
      to,
      message,
      fileData,
      audioData,
      fileType,
      fileName,
      voiceNote
    } = req.body;

    if (!to) return res.status(400).json({ error: "Missing recipient number" });

    const url = `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_ID}/messages`;

    let payload = {
      messaging_product: "whatsapp",
      to
    };

    /* ========== TEXT ONLY ========== */
    if (message && !fileData && !audioData) {
      payload.type = "text";
      payload.text = { body: message };
    }

    /* ========== WEBM → OGG Conversion ========== */
    if (
      voiceNote &&
      audioData &&
      fileType &&
      typeof fileType === "string" &&
      fileType.includes("webm")
    ) {
      console.log("🎵 Converting WEBM → OGG...");
      audioData = await convertWebmToOgg(audioData);
      fileType = "audio/ogg";
    }

    /* ========== MEDIA UPLOAD ========== */
    const mediaBase64 = fileData || audioData;

    if (mediaBase64) {
      const mediaId = await uploadMedia(
        mediaBase64,
        fileType || "application/octet-stream"
      );

      if (voiceNote) {
        payload.type = "audio";
        payload.audio = { id: mediaId };
      } else if (fileType && fileType.startsWith("image")) {
        payload.type = "image";
        payload.image = { id: mediaId, caption: message || "" };
      } else {
        payload.type = "document";
        payload.document = { id: mediaId, filename: fileName || "file" };
      }
    }

    console.log("📤 Sending to WhatsApp:", payload);

    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      }
    });

    console.log("✅ WhatsApp API Success:", response.data);
    res.json({ success: true, data: response.data });

  } catch (err) {
    console.error("❌ WhatsApp SEND ERROR:", err.response?.data || err);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

/* ==========================================
       UPLOAD MEDIA → GET media_id
========================================== */
async function uploadMedia(base64, mimeType) {
  const [, b64] = base64.split(",");
  const buffer = Buffer.from(b64, "base64");

  const form = new FormData();
  form.append("file", buffer, {
    filename: "media",
    contentType: mimeType
  });
  form.append("messaging_product", "whatsapp");

  const url = `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_ID}/media`;

  const upload = await axios.post(url, form, {
    headers: {
      ...form.getHeaders(),
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`
    }
  });

  console.log("📸 Media uploaded:", upload.data);
  return upload.data.id;
}

module.exports = router;
