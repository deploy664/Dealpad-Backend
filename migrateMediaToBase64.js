// migrateMediaToBase64.js
// Run this script ONCE to convert all old WhatsApp media URLs in your Message collection to base64 strings.
// Usage: node migrateMediaToBase64.js

const mongoose = require('mongoose');
const axios = require('axios');

// Update this path if your Message model is elsewhere
const Message = require('./models/Message');

// TODO: Update with your actual MongoDB connection string
const MONGODB_URI = 'mongodb://localhost:27017/YOUR_DB_NAME';

async function urlToBase64(url, mimeType = 'application/octet-stream') {
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const base64 = Buffer.from(response.data, 'binary').toString('base64');
        return `data:${mimeType};base64,${base64}`;
    } catch (err) {
        console.error('Failed to fetch:', url);
        return null;
    }
}

async function migrate() {
    await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected to MongoDB');

    const messages = await Message.find({
        $or: [
            { fileData: { $regex: '^https?://' } },
            { audioData: { $regex: '^https?://' } }
        ]
    });

    console.log('Found', messages.length, 'messages to migrate');

    for (const msg of messages) {
        let updated = false;
        if (msg.fileData && msg.fileData.startsWith('http')) {
            const base64 = await urlToBase64(msg.fileData, msg.fileType || 'application/octet-stream');
            if (base64) {
                msg.fileData = base64;
                updated = true;
            }
        }
        if (msg.audioData && msg.audioData.startsWith('http')) {
            const base64 = await urlToBase64(msg.audioData, msg.fileType || 'audio/ogg');
            if (base64) {
                msg.audioData = base64;
                updated = true;
            }
        }
        if (updated) {
            await msg.save();
            console.log('Migrated message:', msg._id);
        }
    }

    console.log('Migration complete!');
    process.exit();
}

migrate();
