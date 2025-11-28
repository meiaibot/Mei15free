//MEIChat1.js:
const fs = require("fs");
const path = require("path");

function formatTimestamp(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}${String(d.getSeconds()).padStart(2, "0")}`;
}

function loadPersona(longFile, shortFile, bossFile) {
    if (![longFile, shortFile, bossFile].every(f => fs.existsSync(f))) {
        return null;
    }
    return {
        MEIPersonaLong: fs.readFileSync(longFile, "utf-8"),
        MEIPersonaShort: fs.readFileSync(shortFile, "utf-8"),
        MEIPersonaBoss: fs.readFileSync(bossFile, "utf-8")
    };
}

function clearSessionAndCache() {
    const sessionPath = path.join(__dirname, '..', 'userdata', '.wwebjs_auth');
    const cachePath = path.join(__dirname, '.wwebjs_cache');

    if (fs.existsSync(sessionPath)) fs.rmSync(sessionPath, { recursive: true, force: true });
    if (fs.existsSync(cachePath)) fs.rmSync(cachePath, { recursive: true, force: true });
    return true;
}

function wasBossNotified(phone, file, expiryMs) {
    if (!fs.existsSync(file)) return false;
    try {
        const data = JSON.parse(fs.readFileSync(file, "utf-8"));
        const last = data.users?.[phone]?.lastNotifiedEpoch || 0;
        return Date.now() - last < Number(expiryMs);
    } catch {
        return false;
    }
}

function updateNotificationTimestamp(phone, name, file) {
    const now = Date.now();
    let data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf-8")) : { users: {} };
    data.users[phone] = {
        whatsappName: name,
        phone,
        lastNotifiedEpoch: now,
        lastNotifiedDateTime: formatTimestamp(now)
    };
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    return true;
}

function logChat(phone, name, msg, reply, dir) {
    const file = path.join(dir, `${phone}.json`);
    const tmpFile = file + ".tmp";

    let history = [];
    if (fs.existsSync(file)) {
        try {
            history = JSON.parse(fs.readFileSync(file, "utf-8"));
        } catch {}
    }

    history.push({
        datetime: new Date().toISOString(),
        user_phone: phone,
        user_name: name,
        user_message: msg,
        mei_response: reply
    });

    fs.mkdirSync(path.dirname(tmpFile), { recursive: true });
    fs.writeFileSync(tmpFile, JSON.stringify(history, null, 2));
    fs.renameSync(tmpFile, file);

    return true;
}

function getLastChatHistory(phone, lines, dir) {
    const file = path.join(dir, `${phone}.json`);
    if (!fs.existsSync(file)) return "";
    const history = JSON.parse(fs.readFileSync(file, "utf-8"));
    return history.slice(-Number(lines))
                  .map(e => `${e.user_name}: ${e.user_message}\nYou: ${e.mei_response}`)
                  .join("\n");
}

function countWordsAndTokens(input) {
    const words = input.trim().split(/\s+/).filter(Boolean).length;
    const tokens = (input.match(/\b\w+\b|[^\s\w]/g) || []).length;
    return { words, tokens };
}

function getCurrentDateTime(locale = "en-US", tz = "UTC") {
    const now = new Date().toLocaleString(locale, { timeZone: tz });
    const d = new Date(now);
    const hr = d.getHours();
    const ampm = hr >= 12 ? "PM" : "AM";
    const h12 = hr % 12 || 12;
    return `${d.getDate()} ${d.toLocaleString(locale, { month: "short" })} ${d.getFullYear()}, ${h12}.${String(d.getMinutes()).padStart(2, '0')}${ampm}`;
}

module.exports = {
    formatTimestamp,
    loadPersona,
    clearSessionAndCache,
    wasBossNotified,
    updateNotificationTimestamp,
    logChat,
    getLastChatHistory,
    countWordsAndTokens,
    getCurrentDateTime
};