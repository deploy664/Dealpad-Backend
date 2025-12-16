const express = require("express");
const axios = require("axios");
const FormData = require("form-data");
const { spawn } = require("child_process");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

require("dotenv").config();
const router = express.Router();

/* ======================================================
   ⚙️ AXIOS INSTANCE (TIMEOUT SAFE)
====================================================== */
const api = axios.create({
  timeout: 8000
});

/* ======================================================
   🧵 SIMPLE JOB QUEUE (CPU PROTECTION)
====================================================== */
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

/* ======================================================
   🎵 WEBM → OGG (LOW MEMORY, NON-BLOCKING)
====================================================== */
async function convertWebmToOgg(base64Data) {
  const id = crypto.randomBytes(8).toString("hex");
  const inputPath = path.join("/tmp", `voice_${id}.webm`);
  const outputPath = path.join("/tmp", `voice_${id}.ogg`);

  const b64 = base64Data.split(",")[1];
  await fs.writeFile(inputPath, Buffer.from(b64, "base64"));

  await new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-loglevel", "error",
      "-y",
      "-i", inputPath,
      "-ac", "1",
      "-ar", "48000",
      "-c:a", "libopus",
      "-b:a", "48k",
      outputPath
    ]);

    ffmpeg.on("close", code => {
      code === 0 ? resolve() : reject(new Error("FFmpeg failed"));
    });
  });

  const ogg = await fs.readFile(outputPath);
  await fs.unlink(inputPath).catch(() => {});
  await fs.unlink(outputPath).catch(() => {});

  return "data:audio/ogg;base64," + ogg.toString("base64");
}

/* ======================================================
   📤 UPLOAD MEDIA → WHATSAPP
====================================================== */
async function uploadMedia(base64, mimeType) {
  const [, b64] = base64.split(",");
  const buffer = Buffer.from(b64, "base64");

  const form = new FormData();
  form.append("file", buffer, { filename: "media", contentType: mimeType });
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

/* ======================================================
   🚀 SEND MESSAGE (ULTRA FAST)
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
      voiceNote
    } = req.body;

    if (!to) return res.status(400).json({ error: "Missing recipient" });

    // ⚡ INSTANT RESPONSE (UI NEVER BLOCKS)
    res.json({ success: true });

    // 🔄 BACKGROUND PROCESS
    setImmediate(() => {
      runJob(async () => {
        try {
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
            let finalAudio = audioData;
            let finalType = fileType || "audio/ogg";

            if (fileType?.includes("webm")) {
              finalAudio = await convertWebmToOgg(audioData);
              finalType = "audio/ogg";
            }

            const mediaId = await uploadMedia(finalAudio, finalType);
            payload.type = "audio";
            payload.audio = { id: mediaId };
          }

          /* IMAGE / DOCUMENT */
          if (fileData && !voiceNote) {
            const mediaId = await uploadMedia(
              fileData,
              fileType || "application/octet-stream"
            );

            if (fileType?.startsWith("image")) {
              payload.type = "image";
              payload.image = {
                id: mediaId,
                caption: message || ""
              };
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
        } catch (e) {
          console.error("❌ Background send error:", e.response?.data || e.message);
        }
      });
    });

  } catch (err) {
    console.error("❌ Send route error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

module.exports = router;
