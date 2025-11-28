//Mei15free.js

// I have changed the BOT phone and BOSS phone for now, make sure to change it back laterxx
//Have also added the gemini apiKey if andrew does not want then will remove
// RAG is currently Off

//DO NOT Change anything in these lines below

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'userdata', '.env'), override: true, silent: true });

const fs = require('fs');
const readline = require('readline');

// MEIPause1.js and MEIChat1.js functions used directly
const Pause = require("./MEIPause1.js");
const Chat = require("./MEIChat1.js");

const { AIQuery } = require("./MEIAIQuery1.js");
const { isBossMode } = require('./MEIBoss2.js');
const { handleIncomingMedia, handleReplyForPendingMedia, cleanupExpiredMedia } = require('./MEIMedia1.js');
const { summarizeImage, detectMediaType, detectMediaTypeForAi } = require('./MEIImage1.js');
const { getEmbedding, getTopChunks } = require('./MEIRAGTools3.js');
const { handleInitiateCommand } = require("./MEIInitiate3.js");

const { Client, LocalAuth} = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const qrcodeImage = require('qrcode');
const axios = require('axios');
const MEIVersion = path.basename(__filename).replace(/\.[^/.]+$/, "");

// Use env override in Docker: -e WA_DATA_DIR=/data/whatsapp
const WA_DATA_DIR = process.env.WA_DATA_DIR || path.resolve(__dirname, '../userdata/whatsapp');
fs.mkdirSync(WA_DATA_DIR, { recursive: true });
const QR_DIR = process.env.QR_DIR || path.resolve(__dirname, '../userdata/qr');
const QR_FILE = path.join(QR_DIR, 'qr.png');

//reset all to nothing first
let chosenEngine = "";
let chosenAPI = "";
let chosenURL = "";
let chosenModel = "";

let MEIPersonaLong = "";
let MEIPersonaShort = "";

let historyContext = "";
let imageSummary = "";
let imagePrompt = "";
let media = null;
let mediaType = "";
let mediaTypeAI = "";
let RAGprompt = "";

//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
function parseDotenv(content) {
    const result = {};
    content.split('\n').forEach(line => {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
            const key = match[1];
            let value = match[2] || '';
            value = value.replace(/^['"]|['"]$/g, '');
            result[key] = value;
        }
    });
    return result;
}

//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
async function reloadEnv(client) {
    try {
        const envText = fs.readFileSync(path.join(__dirname, '..','userdata/.env'), 'utf-8');
        const parsed = parseDotenv(envText);

        // Update each value to global
        global.BOT_NAME = parsed.BOT_NAME || "Mei";
        global.PERSON = parsed.PERSON || "Person";
        global.JOB = parsed.JOB || "Sales";
        global.SERIAL_ID = parsed.SERIAL_ID;

        global.GROUP_NAMES = (parsed.GROUP_NAMES || "")
            .split(",")
            .map(name => name.trim().toLowerCase());
        global.PERSONA_RELOAD_SECS = parseFloat(parsed.PERSONA_RELOAD_SECS || "10");
        global.RAG = parsed.RAG || "Off";
        global.VECTOR_DB_PATH = parsed.VECTOR_DB_PATH;

        // Timing
        global.HISTORY_SHORT = parseInt(parsed.HISTORY_SHORT || "5");
        global.HISTORY_LONG = parseInt(parsed.HISTORY_LONG || "25");
        global.LOCAL_FORMAT = parsed.localFormat || "en-US";
        global.TIME_ZONE = parsed.TimeZone || "Asia/Kuala_Lumpur";

        global.BOT_PHONE = parsed.BOT_PHONE;
        const rawBossPhone = parsed.BOSS_PHONE?.trim();

        // API Keys
        global.deepseekApi = parsed.deepseekApi;
        global.openaiApi = parsed.openaiApi;
        global.geminiApi = parsed.geminiApi;

        global.autoClearCache = parsed.AUTO_CLEAR_CACHE || "N";
        global.autoEngineChoice = parsed.AUTO_ENGINE_CHOICE || "2";

        // Delays
        global.RESPONSE_DELAY_MIN_SEC = parseInt(parsed.RESPONSE_DELAY_MIN_SEC) || 2;
        global.RESPONSE_DELAY_MAX_SEC = parseInt(parsed.RESPONSE_DELAY_MAX_SEC) || 3;
        global.TYPING_DURATION_MIN_SEC = parseInt(parsed.TYPING_DURATION_MIN_SEC) || 2;
        global.TYPING_DURATION_MAX_SEC = parseInt(parsed.TYPING_DURATION_MAX_SEC) || 3;
        global.BOSS_NOTIFICATION_EXPIRY = parseInt(parsed.BOSS_NOTIFICATION_EXPIRY) || 60;
        global.MEDIA_EXPIRY_MINUTES = parseInt(parsed.MEDIA_EXPIRY_MINUTES) || 2;
        global.ENV_RELOAD_SECS = parseInt(parsed.ENV_RELOAD_SECS) || 5;

        global.PERSONA_FILE_LONG = path.join(__dirname, '..', 'userdata/persona/meipersona-long.txt'); 
        global.PERSONA_FILE_SHORT = path.join(__dirname, '..', 'userdata/persona/meipersona-short.txt'); 
        global.PERSONA_FILE_BOSS = path.join(__dirname, '..', 'userdata/persona/meipersona-boss.txt');

        global.SALES_NOTIFICATION_FILE = path.join(__dirname, '..', 'userdata/json/notifyboss-sales.json');
        global.ABUSE_NOTIFICATION_FILE = path.join(__dirname, '..', 'userdata/json/notifyboss-abuse.json');
        global.PAUSED_FILE = path.join(__dirname, '..', 'userdata/json/pausedUsers.json');
        global.CHAT_HISTORY_DIR = path.join(__dirname, '..', 'userdata/chathistory'); 

        // Resolve BOSS_PHONE to include Whatsapp ID
        if (rawBossPhone && client?.getNumberId) {
            try {
                const wid = await client.getNumberId(rawBossPhone);
                if (wid && wid._serialized) {
                    global.BOSS_PHONE = wid._serialized;
                    console.log('[Env Reloaded] BOSS_PHONE resolved:', global.BOSS_PHONE);
                } else {
                    console.warn('[Env Reloaded] Failed to resolve WhatsApp ID for Boss.');
                    global.BOSS_PHONE = rawBossPhone + "@c.us";
                }
            } catch (err) {
                console.error('[Env Reloaded] Error resolving BOSS_PHONE:', err.message);
                global.BOSS_PHONE = rawBossPhone + "@c.us";
            }
        } else {
            global.BOSS_PHONE = rawBossPhone + "@c.us";
        }

    } catch (err) {
        console.error('Failed to reload .env manually:', err.message);
    }
}
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

// Load .env and global vars immediately one time upon start-up
reloadEnv();  
// Reload .env every X seconds
setInterval(reloadEnv, global.ENV_RELOAD_SECS * 1000);

//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

// === Validate Bot Phone Numbers ===
function isValidPhoneNumber(num) {
    const cleaned = num.trim();
    return /^\d{10,15}$/.test(cleaned);
}

if (!isValidPhoneNumber(global.BOT_PHONE)) {
    console.error(`Invalid BOT_PHONE: "${global.BOT_PHONE}". Digits only, 10–15 characters.`);
    process.exit(1);
}

let expiryBossReport = global.BOSS_NOTIFICATION_EXPIRY * 60 * 1000;

// === AI CREDENTIALS ===
const deepseekURL = "https://api.deepseek.com/chat/completions";
const deepseekModel = "deepseek-chat";

const openaiURL = "https://api.openai.com/v1/chat/completions";
const openaiModel = "gpt-4.1";

const geminiURL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const geminiModel = "gemini-2.0-flash";

//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
function loadPersona() {
    const persona = Chat.loadPersona(global.PERSONA_FILE_LONG, global.PERSONA_FILE_SHORT, global.PERSONA_FILE_BOSS);
    if (!persona) {
        console.error(`[${MEIVersion}] Failed loading persona files.`);
        return;
    }

    try {
        const replaceVars = (text) =>
            text.replace(/{{BOT_NAME}}/g, global.BOT_NAME || "Mei");

        MEIPersonaLong  = replaceVars(persona.MEIPersonaLong);
        MEIPersonaShort = replaceVars(persona.MEIPersonaShort);
    } catch (err) {
        console.error(`[${MEIVersion}] Failed parsing persona:`, err.message);
    }
}

loadPersona();

// Reload persona every X seconds
let lastReloadTime = 0;
function reloadIfNeeded() {
    const now = Date.now();
    const intervalMs = Math.max(1000, global.PERSONA_RELOAD_SECS * 1000);
    if (now - lastReloadTime > intervalMs) {
        loadPersona();
        lastReloadTime = now;
    }
}

//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// === JSON Files Setup ===
if (!fs.existsSync(global.CHAT_HISTORY_DIR)) fs.mkdirSync(global.CHAT_HISTORY_DIR);
if (!fs.existsSync(path.dirname(global.SALES_NOTIFICATION_FILE))) fs.mkdirSync(path.dirname(global.SALES_NOTIFICATION_FILE), { recursive: true });
if (!fs.existsSync(path.dirname(global.ABUSE_NOTIFICATION_FILE))) fs.mkdirSync(path.dirname(global.ABUSE_NOTIFICATION_FILE), { recursive: true });
if (!fs.existsSync(path.dirname(global.PAUSED_FILE))) fs.mkdirSync(path.dirname(global.PAUSED_FILE), { recursive: true });

const defaultData = { paused: [], global: false };
if (!fs.existsSync(global.PAUSED_FILE)) fs.writeFileSync(global.PAUSED_FILE, JSON.stringify(defaultData, null, 2));
if (!fs.existsSync(global.SALES_NOTIFICATION_FILE)) fs.writeFileSync(global.SALES_NOTIFICATION_FILE, JSON.stringify({ users: {} }, null, 2));
if (!fs.existsSync(global.ABUSE_NOTIFICATION_FILE)) fs.writeFileSync(global.ABUSE_NOTIFICATION_FILE, JSON.stringify({ users: {} }, null, 2));

//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// === Establish NEW WhatsApp Client ===
const client = new Client({
  puppeteer: {
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  },
  authStrategy: new LocalAuth({
    clientId: 'MEI',
    dataPath: WA_DATA_DIR
  })
});

//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForUserInputOrDefault(defaultValue, timeoutMs) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

        let answered = false;

        rl.question('', (answer) => {
            if (!answered) {
                answered = true;
                rl.close();
                resolve(answer.trim() || defaultValue);
            }
        });

        setTimeout(() => {
            if (!answered) {
                answered = true;
                rl.close();
                console.log(`(Auto-selecting "${defaultValue}" after ${timeoutMs / 1000} secs)`);
                resolve(defaultValue);
            }
        }, timeoutMs);
    });
}

//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
async function initializeBot() {
    console.log("Starting Mei AI Free Bot...");

    // === Handle Clear Cache Question ===
    console.log("Clear WhatsApp-Web Auth & Cache folder? (Y/N): ");
    let clearData = await waitForUserInputOrDefault(global.autoClearCache || "N", 2000);
    console.log(`Selected: ${clearData}`);

    if (clearData.toUpperCase() === 'Y') {
        Chat.clearSessionAndCache();
        console.log("Session and cache cleared successfully.");
    }

    // === Handle AI Engine Selection ===
    console.log("Choose AI engine: 1.DeepSeek  2.OpenAI  3.Gemini");
    let engineChoice = await waitForUserInputOrDefault(global.autoEngineChoice || "2", 2000);
    console.log(`Selected AI Engine: ${engineChoice}`);

    switch (engineChoice.trim()) {
        case "1":
            chosenEngine = "deepseek"; chosenAPI = global.deepseekApi; chosenURL = deepseekURL; chosenModel = deepseekModel;
            break;
        case "2":
            chosenEngine = "openai"; chosenAPI = global.openaiApi; chosenURL = openaiURL; chosenModel = openaiModel;
            break;
        case "3":
            chosenEngine = "gemini"; chosenAPI = global.geminiApi; chosenURL = geminiURL; chosenModel = geminiModel;
            break;    
        default:
            chosenEngine = "openai"; chosenAPI = global.openaiApi; chosenURL = openaiURL; chosenModel = openaiModel;
    }

    client.initialize();
}

initializeBot();

//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// Whatsapp QR code and Ready events
client.on('qr', async (qr) => {
  console.log('Scan QR:');
  qrcode.generate(qr, { small: true });

  try {
    fs.mkdirSync(QR_DIR, { recursive: true });
    await qrcodeImage.toFile(QR_FILE, qr, { width: 300, margin: 2 });
    console.log('QR saved to:', QR_FILE);
  } catch (err) {
    console.error('Failed to save QR image:', err?.message || err);
    console.log('Showing ASCII QR instead:');
    qrcode.generate(qr, { small: true });
  }
});

//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
client.on('ready', async () => {
    console.log('Mei is online & ready!');
    
    const user = client.info?.me;
    if (user && user._serialized) {
        const match = user._serialized.match(/^(\d+)/);
        const aPhone = match ? match[1] : null;
        if (aPhone) {
            console.log('Mei AI Bot number is: ', aPhone);
        } else {
            console.error('Could not extract Mei phone number from:', user._serialized);
            process.exit(1);
        }
    } else {
        console.error('client.info.me is not available.');
        process.exit(1);
    }

    await reloadEnv(client);
    console.log("Boss phone's WhatsApp ID:", global.BOSS_PHONE);

    // Persona Reload Interval
    setInterval(() => {
        reloadIfNeeded();
    }, global.PERSONA_RELOAD_SECS * 2000);

    // Media cleanup every 5 minutes
    setInterval(() => {
        cleanupExpiredMedia();
    }, 5 * 60 * 1000);
});

client.on('disconnected', reason => console.log(`Disconnected: ${reason}`));

//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
async function getAIResponse(engine, persona, message, maxTokens, temperature) {
    switch (engine.toLowerCase()) {
        case "deepseek":
            return await callDeepSeek(persona, message, maxTokens, temperature);
        case "openai":
            return await callOpenAI(persona, message, maxTokens, temperature);
        case "gemini":
            return await callGemini(persona, message, maxTokens, temperature);
        default:
            return await callOpenAI(persona, message, maxTokens, temperature);
    }
}

// Continue Gemini Upgrade from here

//OpenAI's model
async function callOpenAI(persona, message, maxTokens, temperature) {
    try {
        const response = await axios.post(openaiURL, {
            model: openaiModel,
            messages: [{ role: "system", content: persona }, { role: "user", content: message }],
            temperature: temperature,
            max_tokens: maxTokens,
            top_p: 1,
            frequency_penalty: 0.0,
            presence_penalty: 0.0
        }, {
            headers: { "Authorization": `Bearer ${global.openaiApi}`, "Content-Type": "application/json" }
        });
        return response.data.choices[0].message.content;
  } catch (error) {
    console.error("OpenAI Error:", error?.response?.data || error.message);
        return "This is an automated reply. The user is not available now. o";
    }
}

//Deepseek's model
async function callDeepSeek(persona, message, maxTokens, temperature) {
    try {
        const response = await axios.post(deepseekURL, {
            model: deepseekModel,
            messages: [{ role: "system", content: persona }, { role: "user", content: message }],
            temperature: temperature,
            max_tokens: maxTokens,
            top_p: 1,
            frequency_penalty: 0.0,
            presence_penalty: 0.0
        }, {
            headers: { "Authorization": `Bearer ${global.deepseekApi}`, "Content-Type": "application/json" }
        });
        return response.data.choices[0].message.content;
  } catch (error) {
    console.error("DeepSeek Error:", error?.response?.data || error.message);
        return "This is an automated Whatsapp reply. The user is not available now. d";
    }
}


// //Gemini's model
// async function callGemini(persona, message, maxTokens, temperature) {
//     try {
//         const response = await axios.post(geminiURL, {
//             model: geminiModel,
//             messages: [{ role: "system", content: persona }, { role: "user", content: message }],
//             temperature: temperature,
//             max_tokens: maxTokens,
//             top_p: 1,
//             frequency_penalty: 0.0,
//             presence_penalty: 0.0
//         }, {
//             headers: { "Authorization": `Bearer ${global.geminiApi}`, "Content-Type": "application/json" }
//         });
//         return response.data.choices[0].message.content;
//   } catch (error) {
//     console.error("Gemini Error:", error?.response?.data || error.message);
//         return "This is an automated Whatsapp reply. The user is not available now. d";
//     }
// }

// Gemini's Model
// Gemini's model
async function callGemini(persona, message, maxTokens, temperature) {
    try {
        const response = await axios.post(geminiURL, {
            model: geminiModel,
            messages: [
                { role: "system", content: persona },
                { role: "user", content: message }
            ],
            temperature: temperature,
            max_tokens: maxTokens,
            top_p: 1,
            // frequency_penalty: 0.0,
            // presence_penalty: 0.0
        }, {
            headers: {
                "Authorization": `Bearer ${global.geminiApi}`,
                "Content-Type": "application/json"
            }
        });
        return response.data.choices?.[0]?.message?.content || "";
    } catch (error) {
        console.error("Gemini Error:", error?.response?.data || error.message);
        return "This is an automated Whatsapp reply. The user is not available now. g";
    }
}


//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
async function genRAGprompt(userMessage, senderName, MEIPersonaShort, chosenURL, chosenModel, chosenAPI) {
    if (global.RAG !== "On") return "";

    const systemPersona = `You are a message classifer for an AI Retrieval-Augmented Generation system.
    You help classify messages given to you and you reply strictly either RAG or CASUAL.
    Always reply using only 1 word and NEVER explain your reply.`;

    const ragClassifierPrompt = `You are an AI chatbot with this role: ${MEIPersonaShort}.
    You must now determine if the message below is:
    1. CASUAL, if the chat topic is casual and NOT related to your role, your company's info, product or services.
    2. RAG, if the chat topic is related to your role, your Company's info, team-mates, product or services.
    You must now Reply strictly as: RAG or CASUAL only. This is the message: "${userMessage}"`;

    const ragDecisionRaw = await AIQuery(
        ragClassifierPrompt,
        chosenURL,
        chosenModel,
        chosenAPI,
        systemPersona,
        0.2,
        10
    );
    
    const ragDecision = ragDecisionRaw.trim().toUpperCase();
    if (ragDecision !== "RAG") return "";

    const queryVec = await getEmbedding(userMessage);
    const chunks = getTopChunks(queryVec, 3);
    const context = chunks.map((c, i) => `(${i + 1}) ${c.title ? `[${c.title}] ` : ''}${c.text}`).join('\n\n');

    if (!chunks || chunks.length === 0) {
        console.warn(`genRAGprompt: No relevant RAG chunks found for: "${userMessage}"`);
        return "";
    } else {
        return `\nBased on the chat by ${senderName}, this info is found in your official Retrieval-Augmented Generation system which you must ` +
        `incorporate in your reply:\n${context}\n`;
    }
}

//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
// Simulate "Seen" status
async function simulateSeen(msg) {
    const chat = await msg.getChat();
    await chat.sendSeen();
    console.log(`${MEIVersion} marked the chat as SEEN for ${msg.from}`);
}

//Function on delay in responding and typing
async function simulateDelays(msg) {
    const chat = await msg.getChat();

    const responseDelayMs = Math.floor(
        Math.random() * (global.RESPONSE_DELAY_MAX_SEC - global.RESPONSE_DELAY_MIN_SEC) * 1000
    ) + (global.RESPONSE_DELAY_MIN_SEC * 1000);

    const typingDurationMs = Math.floor(
        Math.random() * (global.TYPING_DURATION_MAX_SEC - global.TYPING_DURATION_MIN_SEC) * 1000
    ) + (global.TYPING_DURATION_MIN_SEC * 1000);

    console.log(`${MEIVersion} delaying response by ${(responseDelayMs / 1000).toFixed(2)} seconds...`);
    await new Promise(resolve => setTimeout(resolve, responseDelayMs));

    console.log(`${MEIVersion} is typing. Delay by ${(typingDurationMs / 1000).toFixed(2)} seconds...`);
    await chat.sendStateTyping();
    await new Promise(resolve => setTimeout(resolve, typingDurationMs));
}

//++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
//Whatsapp Chats Handling begins here
client.on('message', async (msg) => {
    const userPhone = msg.from;
    const cleanPhoneNo = userPhone.replace(/[@.a-zA-Z]+/g, "");
    const currentDateTime = Chat.getCurrentDateTime(global.LOCAL_FORMAT, global.TIME_ZONE);
    const userName = msg._data?.notifyName || "User";
    const userMessage = msg.body.trim() || "";
    let MEIReply = "";

    const isBoss = isBossMode(msg, global.BOSS_PHONE);

    // === Immediate PAUSE Checking (Global or Individual) ===
    if (!isBoss) {
        const isUserOrGlobalPaused = Pause.isUserPaused(global.PAUSED_FILE, cleanPhoneNo);
        if (isUserOrGlobalPaused) {
            Chat.logChat(userPhone, userName, userMessage, "[Pause feature activated]", global.CHAT_HISTORY_DIR);
            console.log(`${MEIVersion} ignoring message — Paused globally / individually for ${cleanPhoneNo}.`);
            return;
        }
    }

    // Handle Pause Commands from Boss' Number
    if (isBoss) {
        const bossCmd = userMessage.toLowerCase();
        const parts = userMessage.split(" ");

        if (bossCmd.startsWith("pause all")) {
            Pause.setGlobalPause(global.PAUSED_FILE, true);
            MEIReply = `${MEIVersion} Global pause activated.`;
            await msg.reply(MEIReply);
            Chat.logChat(userPhone, userName, userMessage, MEIReply, global.CHAT_HISTORY_DIR);
            return;
        }

        if (bossCmd.startsWith("unpause all")) {
            Pause.setGlobalPause(global.PAUSED_FILE, false);
            MEIReply = `${MEIVersion} Global pause lifted.`;
            await msg.reply(MEIReply);
            Chat.logChat(userPhone, userName, userMessage, MEIReply, global.CHAT_HISTORY_DIR);
            return;
        }

        if (parts.length === 2 && bossCmd.startsWith("pause ")) {
            const target = parts[1].replace(/[^0-9]/g, "");        
            Pause.pauseUser(global.PAUSED_FILE, target);        
            MEIReply = `${MEIVersion} Paused user: ${target}`;
            await msg.reply(MEIReply);
            Chat.logChat(userPhone, userName, userMessage, MEIReply, global.CHAT_HISTORY_DIR);
            return;
        }

        if (parts.length === 2 && bossCmd.startsWith("unpause ")) {
            const target = parts[1].replace(/[^0-9]/g, "");        
            Pause.unpauseUser(global.PAUSED_FILE, target);        
            MEIReply = `${MEIVersion} Unpaused user: ${target}`;
            await msg.reply(MEIReply);
            Chat.logChat(userPhone, userName, userMessage, MEIReply, global.CHAT_HISTORY_DIR);
            return;
        }
    }

    // Handle Initiate or Contact commands from Boss
    // Expects command from Boss as below:
    // Initiate +60123456789 +60123456780 Update on new pricing plans. (Contact can also be used instead of Initiate - Both need case sensitive)

    if (isBoss) {
        const bossCmd = userMessage.toLowerCase().trim();
        if (/^(initiate|contact)\s+/.test(bossCmd)) {
            await handleInitiateCommand(
                msg,
                client,
                chosenURL,
                chosenModel,
                chosenAPI,
                MEIPersonaShort,
                0.5,
                200
            );
            return;
        }
    }

    // IF CHAT COMES FROM WHATSAPP GROUPS (all handled below)
    //++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
    //++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
    const chat = await msg.getChat(); //does NOT return the message, but instead returns a Chat OBJECT, which we can use later on for a few things

    if (!chat.isGroup) { //is this a Group Chat??

    // **** MUSTANSIR, PLS EXIT HERE IF CHAT IS FROM GROUP

        // IF INDIVIDUAL MESSAGES
        // === BLOCK EMPTY MESSAGES ===
        if (!userMessage && !msg.hasMedia) {
            console.log(`Empty message received from ${userPhone}, ignoring.`);
            return;
        }

        // Get the Short & Long chat history
        let chatHistoryShort = String(Chat.getLastChatHistory(userPhone, global.HISTORY_SHORT, global.CHAT_HISTORY_DIR));
        let chatHistoryLong = String(Chat.getLastChatHistory(userPhone, global.HISTORY_LONG, global.CHAT_HISTORY_DIR));

        //MEDIA HANDLING STARTS HERE
        imageSummary = "";
        imagePrompt = "";
        media = null;
        mediaType = "";
        mediaTypeAI = "";

        if (msg.hasMedia) {
            try {
                media = await msg.downloadMedia();
                mediaType = detectMediaType(media?.mimetype || "");
                mediaTypeAI = detectMediaTypeForAi(media);

                console.log(`Media type detected for AI: ${mediaTypeAI}`);
                console.log(`Media type detected for Boss forwarding: ${mediaType}`);

                if (media?.data && mediaTypeAI === "image") {
                    imageSummary = await summarizeImage(media, userMessage, global.openaiApi, MEIPersonaShort);
                    if (imageSummary) {
                        imagePrompt = `This latest chat also has an image of this description: ${imageSummary}`;
                    }
                } else {
                    console.warn(`Skipping AI analysis on non-image media type: ${mediaTypeAI}`);
                }
            } catch (err) {
                console.warn("Failed to process image for summary:", err.message);
            }
        }

        // === Handle non-image media ===
        if (msg.hasMedia) {
            const handled = await handleIncomingMedia(msg, client, chatHistoryShort, userName);
            if (handled) {
                Chat.logChat(userPhone, userName, `[User sent a media file with this description: ${imageSummary}], along with this chat: "${msg.body.trim()}"`, "[Media forwarded to Boss]", global.CHAT_HISTORY_DIR);
            }

            const handledReply = await handleReplyForPendingMedia(msg, client, chatHistoryShort);
            if (handledReply) {
                Chat.logChat(userPhone, userName, `[User sent a media file with this description: ${imageSummary}] with no chat message.`, "[Forwarded + Media clarified]", global.CHAT_HISTORY_DIR);
            }
        }

        // FOR INDIVIDUAL TEXT ONLY CHATS
        if (global.RAG == "On") {
            RAGprompt = await genRAGprompt(userMessage, userName, MEIPersonaShort, chosenURL, chosenModel, chosenAPI);
        }

        const isFirstTime = !fs.existsSync(path.join(global.CHAT_HISTORY_DIR, `${userPhone}.json`));
        let prompt = "";

        if (isFirstTime) {
            prompt = `A new ${global.PERSON} has messaged YOU for the first time. The local date & time now is ${currentDateTime}. 
            Please greet this ${global.PERSON}, introduce yourself, and ask for this ${global.PERSON}'s name & MUST REPLY to this chat 
            below by the new ${global.PERSON}:\n\n${global.PERSON}: "${userMessage}". ${imagePrompt}.\n${RAGprompt}`;
        } else {
            prompt = `This is your most recent chat history with ${userName}:\n${chatHistoryLong}\n${userName}: ${userMessage}. ${imagePrompt}.\n${RAGprompt}\n
            The local date & time now is ${currentDateTime}.\nBased on the above chats, your given persona & your role in the company, 
            generate a reply, without any greeting (unless the ${global.PERSON} is greeting you), to the latest message from ${userName}. 
            Vary your replies if the topic has already been replied or answered.`;
        }

        console.log("Token check:", Chat.countWordsAndTokens(prompt));

        // Actually calling the functions to simulate seen, response & typing delays
        await simulateSeen(msg);
        await simulateDelays(msg);

        // AI's reply and output here:
        const reply = await getAIResponse(chosenEngine, MEIPersonaLong, prompt, 150, 0.5);
        try {
            await msg.reply(reply);
            console.log("Replied: ", reply);
            Chat.logChat(userPhone, userName, userMessage, reply, global.CHAT_HISTORY_DIR);
        } catch (err) {
            console.error(`[${MEIVersion}] Failed to reply to user ${userPhone}: ${err.message}`);
            Chat.logChat(userPhone, userName, userMessage, "[Reply failed]", global.CHAT_HISTORY_DIR);
        }

        // Check for Abuse & Misuse by Users
        historyContext = String(Chat.getLastChatHistory(userPhone, global.HISTORY_SHORT, global.CHAT_HISTORY_DIR));
        const lineCount = (historyContext.match(/\n/g) || []).length;
        console.log (`Number of lines of chats: ${lineCount}`);

        if (lineCount >= global.HISTORY_SHORT) {
            const abusePrompt = `Based on these OVERALL chats below:\n\n${historyContext}\n${userName}: ${userMessage}. ${imagePrompt}.\n\nDo YOU think ${userName} 
            is wasting your time and has no intention of enquiring or buying your company's products & services? Reply strictly with only one word: YES or NO. Do NOT explain.`;

            let aiDecision = await getAIResponse(chosenEngine, MEIPersonaShort, abusePrompt, 15, 0.4);
            console.log(`Is this person's chats IRRELEVANT & WASTING TIME ? =========================> ${aiDecision}`);

            let response = aiDecision.trim().toUpperCase();
            if (response.startsWith("YES")) {
                let cleanUserPhone = userPhone.replace(/[@.a-zA-Z]+/g, "");

                const wasNotified = Chat.wasBossNotified(cleanUserPhone, global.ABUSE_NOTIFICATION_FILE, expiryBossReport);

                if (wasNotified) {
                    console.log(`Reported to Boss of ${cleanUserPhone} Irrelevant Chats within the last X minutes. Skipping notification.`);
                } else {
                    let notificationMsg = `🔔 *IRRELEVANT CHATS ALERT!!!*\n\n${global.PERSON}: *${userName}*\n\nPhone: *+${cleanUserPhone}*\n\n*Conversation:*\n${historyContext}\n\nLast chat: ${userMessage}`;
                    console.log(`BOSS PHONE: ${global.BOSS_PHONE}`);
                    await client.sendMessage(global.BOSS_PHONE, notificationMsg);

                    Chat.updateNotificationTimestamp(cleanUserPhone, userName, global.ABUSE_NOTIFICATION_FILE);
                    console.log(`Reported to Boss of IRRELEVANT CHATS from ${cleanUserPhone}: ${notificationMsg}`);
                }

                Chat.logChat(userPhone, userName, userMessage, "Your conversations are out of topic.", global.CHAT_HISTORY_DIR);
                return;
            }
        } else {
            console.log(`Skipping abuse detection: Chat history too short (${lineCount} lines) for ${userPhone}`);
        }

        // Check for Potential Sales
        historyContext = Chat.getLastChatHistory(userPhone, global.HISTORY_SHORT, global.CHAT_HISTORY_DIR);
        const intentCheckPrompt = `Based on these OVERALL chats below:\n\n${historyContext}\n${userName}: ${userMessage}. ${imagePrompt}.\n\n
        Do YOU think this ${global.PERSON} has the potential in ${global.JOB} opportunity? Reply strictly with only one word: YES or NO. DO NOT explain.`;

        let intentDecision = await getAIResponse(chosenEngine, MEIPersonaShort, intentCheckPrompt, 15, 0.5);
        console.log(`AI DETECTION OF POSITIVE POTENTIAL =========================> ${intentDecision}`);

        let response = intentDecision.trim().toUpperCase();
        if (response.startsWith("YES")) {
            let cleanUserPhone = userPhone.replace(/[@.a-zA-Z]+/g, "");

            const wasNotified = Chat.wasBossNotified(cleanUserPhone, global.SALES_NOTIFICATION_FILE, expiryBossReport);

            if (wasNotified) {
                console.log(`Boss was notified of ${cleanUserPhone} within the last X minutes. Skipping notification.`);
            } else {
                let notificationMsg = `🔔 *Potential Notification!*\n\n${global.PERSON}: *${userName}*\n\nPhone: *+${cleanUserPhone}*\n\n*Conversation:*\n${historyContext}\n\nLast chat: ${userMessage}`;

                await client.sendMessage(global.BOSS_PHONE, notificationMsg);
                Chat.updateNotificationTimestamp(cleanUserPhone, userName, global.SALES_NOTIFICATION_FILE);
                console.log(`Notified Boss of potential from ${cleanUserPhone}: ${notificationMsg}`);
            }
        }


    }

    // IF CHAT COMES FROM WHATSAPP GROUPS (all handled above)
    
});