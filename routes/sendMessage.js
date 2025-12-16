const express = require("express");
const axios = require("axios");
const FormData = require("form-data");
const { spawn } = require("child_process");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

require("dotenv").config();
const router = express.Router();

const api = axios.create({ timeout: 8000 });

let runningJobs = 0;
const MAX_JOBS = 2;

async function runJob(fn) {
  while (runningJobs >= MAX_JOBS) {
    await new Promise(r => setTimeout(r, 50));
  }
  runningJobs++;
  try {
    await fn();
  } finally {
    runningJobs--;
  }
}

/* ======================
   WEBM → OGG (VOICE SAFE)
====================== */
async function convertWebmToOgg(base64Data) {
  const id = crypto.randomBytes(8).toString("hex");
  const input = `/tmp/voice_${id}.webm`;
  const output = `/tmp/voice_${id}.ogg`;

  await fs.writeFile(input, Buffer.from(base64Data.split(",")[1], "base64"));

  await new Promise((res, rej) => {
    const ffmpeg = spawn("ffmpeg", [
      "-y",
      "-i", input,
      "-ac", "1",
      "-ar", "16000",
      "-c:a", "libopus",
      output
    ]);
    ffmpeg.on("close", c => (c === 0 ? res() : rej()));
  });

  const ogg = await fs.readFile(output);
  await fs.unlink(input).catch(() => {});
  await fs.unlink(output).catch(() => {});

  return {
    base64: "data:audio/ogg;base64," + ogg.toString("base64"),
    mime: "audio/ogg"
  };
}

/* ======================
   UPLOAD MEDIA
====================== */
async function uploadMedia(base64, mimeType) {
  const buffer = Buffer.from(base64.split(",")[1], "base64");
  const ext = mimeType.split("/")[1] || "bin";

  const form = new FormData();
  form.append("file", buffer, {
    filename: `media.${ext}`,
    contentType: mimeType
  });
  form.append("messaging_product", "whatsapp");

  const url = `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_ID}/media`;

  const res = await api.post(url, form, {
    headers: {
      ...form.getHeaders(),
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`
    }
  });

  return res.data.id;
}

/* ======================
   SEND MESSAGE
====================== */
router.post("/", async (req, res) => {
  try {
    const {
      to,
      message,
      fileData,
      audioData,
      fileType,
      fileName,
      voiceNote
    } = req.body;

    if (!to) return res.status(400).json({ error: "Missing recipient" });

    res.json({ success: true });

    setImmediate(() => {
      runJob(async () => {
        const url = `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_ID}/messages`;

        let payload = {
          messaging_product: "whatsapp",
          to
        };

        /* TEXT */
        if (message && !fileData && !audioData) {
          payload.type = "text";
          payload.text = { body: message };
        }

        /* VOICE NOTE */
        if (voiceNote && audioData) {
          let audio = audioData;
          let mime = fileType || "audio/ogg";

          if (fileType?.includes("webm")) {
            const conv = await convertWebmToOgg(audioData);
            audio = conv.base64;
            mime = conv.mime;
          }

          const mediaId = await uploadMedia(audio, mime);
          payload.type = "audio";
          payload.audio = { id: mediaId, voice: true };
        }

        /* IMAGE / DOCUMENT */
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

        await api.post(url, payload, {
          headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
            "Content-Type": "application/json"
          }
        });

        console.log("✅ WhatsApp sent:", to);
      });
    });
  } catch (err) {
    console.error("❌ Send route error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

module.exports = router;
