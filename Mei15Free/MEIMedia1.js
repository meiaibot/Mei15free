// MEIMedia1.js
const fs = require("fs");
const path = require("path");
const pendingMedia = {}; // { [userPhone]: { media, mediaType, timestamp, userName } }

const HelperVersion = path.basename(__filename).replace(/\.[^/.]+$/, "");
const Chat = require("./MEIChat1.js");

// Chat history directory path
const CHAT_HISTORY_DIR = path.join(__dirname, '..', 'userdata', 'chathistory');

async function getBossName(client) {
    try {
		return "Boss";
    } catch (err) {
        console.warn(`${HelperVersion}: unable to fetch Boss name:`, err.message);
        return "Boss";
    }
}

function prepareBossForwardMessage(userName, userPhone, chatHistoryShort, mediaType, userMessage = "") {
    return `📤 *Media Alert to Boss*\n\nPerson: *${userName}*\nPhone: *+${userPhone}*\nMedia Type: ${mediaType}\n\n` +
           `📄 *Recent Chat History:*\n${chatHistoryShort}\n\n` +
           (userMessage ? `*User Message with Media:*\n"${userMessage}"` : "*No message text included with media.*");
}

function getMediaType(mime) {
    if (mime.startsWith("image/")) return "Image";
    if (mime.startsWith("video/")) return "Video";
    if (mime.startsWith("audio/")) return "Audio";
    if (mime.includes("pdf")) return "PDF Document";
    if (mime.includes("word")) return "Word Document";
    if (mime.includes("excel")) return "Excel Spreadsheet";
    if (mime.includes("zip") || mime.includes("rar")) return "Compressed File";
    return "File";
}

async function handleIncomingMedia(msg, client, chatHistoryShort, userName) {
    const userPhone = msg.from;
    const media = await msg.downloadMedia();
    const bossName = await getBossName(client);

    if (!media) return false;

    const fileType = getMediaType(media.mimetype);
    const userMessage = msg.body?.trim();
    const hasText = !!userMessage;

    // New logic (since 1st May 2025): forward media with text or images
    if (hasText || fileType === "Image") {
        const forwardMsg = prepareBossForwardMessage(
            userName,
            userPhone.replace(/[@.a-zA-Z]+/g, ""),
            chatHistoryShort,
            fileType,
            userMessage || "(no caption)"
        );

        try {
            await client.sendMessage(global.BOSS_PHONE, forwardMsg);
            await client.sendMessage(global.BOSS_PHONE, media, {
                caption: `Forwarded ${fileType.toLowerCase()} from ${userName}`
            });
            await new Promise(resolve => setTimeout(resolve, 1200)); // prevent spamming

            console.log(`Forwarded ${fileType} from ${userName} to Boss.`);

            // Log both sender and Boss logs
            Chat.logChat(global.BOSS_PHONE, bossName, "", forwardMsg, CHAT_HISTORY_DIR);

        } catch (err) {
            console.warn(`Failed to forward media from ${userName}:`, err.message);
        }

        return true;
    }

    // No text: ask for context later
    pendingMedia[userPhone] = {
        media,
        mediaType: fileType,
        timestamp: Date.now(),
        userName
    };

    return true;
}

async function handleReplyForPendingMedia(msg, client, chatHistoryShort) {
    const userPhone = msg.from;
    const userMessage = msg.body?.trim();
    const bossName = await getBossName(client);

    if (!pendingMedia[userPhone]) return false;

    const { media, mediaType, timestamp, userName } = pendingMedia[userPhone];

    // Expiry check
    const age = (Date.now() - timestamp) / 1000 / 60;
    if (age > global.MEDIA_EXPIRY_MINUTES) {
        console.log(`Pending media for ${userPhone} expired (${Math.floor(age)} mins old). Skipping.`);
        delete pendingMedia[userPhone];

        try {
            await msg.reply(`Sorry, the file you sent me expired after ${global.MEDIA_EXPIRY_MINUTES} mins.\n
            Please resend it, so that I can forward it to my Boss.`);
        } catch (err) {
            console.warn(`Failed to send expiry notice to ${userPhone}:`, err.message);
        }

        return false;
    }

    const forwardMsg = prepareBossForwardMessage(
        userName,
        userPhone.replace(/[@.a-zA-Z]+/g, ""),
        chatHistoryShort,
        mediaType,
        userMessage
    );

    try {
        await client.sendMessage(global.BOSS_PHONE, forwardMsg);
        await client.sendMessage(global.BOSS_PHONE, media, { caption: `Forwarded ${mediaType.toLowerCase()} from ${userName}` });
        console.log(`Forwarded ${mediaType} with message from ${userName} to Boss.`);
    } catch (err) {
        console.warn(`Failed to forward media from ${userName} to Boss:`, err.message);
        return false;
    }

    Chat.logChat(global.BOSS_PHONE, bossName, "", forwardMsg, CHAT_HISTORY_DIR);

    console.log(`Forwarded cached ${mediaType} + reply from ${userName} to Boss.`);
    delete pendingMedia[userPhone];
    return true;
}

function cleanupExpiredMedia() {
    const now = Date.now();
    const cutoff = global.MEDIA_EXPIRY_MINUTES * 60 * 1000;
    for (const phone in pendingMedia) {
        if (now - pendingMedia[phone].timestamp > cutoff) {
            console.log(`Auto-cleaned expired media for ${phone}`);
            delete pendingMedia[phone];
        }
    }
}

module.exports = {
    handleIncomingMedia,
    handleReplyForPendingMedia,
    cleanupExpiredMedia
};
