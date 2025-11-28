// MEIInitiate3.js

const path = require("path");

// The helper functions used directly
const Chat = require("./MEIChat1.js");

const { AIQuery } = require("./MEIAIQuery1.js"); 

const HelperVersion = path.basename(__filename).replace(/\.[^/.]+$/, "");

// Chat History Directory
const CHAT_HISTORY_DIR = path.join(__dirname, '..', 'userdata', 'chathistory');

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function handleInitiateCommand(msg, client, chosenURL, chosenModel, chosenAPI, Persona, Temp, MaxToken) {
    const sender = msg.from;
    const body = msg.body?.trim() || "";

    console.log(`Message from ${sender}: ${body}`);

    if (!body.toLowerCase().startsWith("initiate") && !body.toLowerCase().startsWith("contact")) return;

    const match = body.match(/^\s*(Initiate|Contact)\s+((?:\+?\d{10,15}\s*){1,3})([\s\S]+)$/i);
    if (match) {
        const command = match[1];
        const numberBlock = match[2];
        const promptText = match[3].trim();

        const numberMatches = numberBlock.match(/\+?\d{10,15}/g);

        if (!numberMatches || numberMatches.length === 0) {
            try {
                await msg.reply("No valid numbers found. Format: Contact +60123456789 message");
            } catch (err) {
                console.error(`[${HelperVersion}] Failed to send msg:`, err.message);
            }
            return;
        }

        const aiPrompt = `
            Your Boss sent you this message with the following instructions:
            Boss' message: "${promptText}"
            Your Output (just the message body):
            `.trim();

        let finalMessage = "";

        try {
            finalMessage = await AIQuery(
                aiPrompt,
                chosenURL,
                chosenModel,
                chosenAPI,
                Persona,
                Temp,
                MaxToken
            );

            finalMessage = finalMessage.trim();
            if (!finalMessage || finalMessage.length < 3) {
                throw new Error("AIQuery returned an invalid or empty message.");
            }
            console.log(`Final message to send: ${finalMessage}`);
        } catch (aiErr) {
            console.error(`[${HelperVersion}] Error calling AIQuery:`, aiErr);
            try {       
                await msg.reply("Failed to generate message from AI. Please try again later.");
            } catch (err) {
                console.error(`[${HelperVersion}] Failed to send msg:`, err.message);
            }
            return;
        }

        const resultLines = [];
        for (const numRaw of numberMatches) {
            let cleaned = numRaw.trim().replace(/\D/g, '');
            if (cleaned.startsWith('0')) {
                cleaned = '6' + cleaned.slice(1);
            }
            if (!cleaned.startsWith('6')) {
                try {
                    await msg.reply(`❌ Invalid number: ${numRaw}. Must be with country code.`);
                } catch (err) {
                    console.error(`[${HelperVersion}] Failed to send invalid number reply:`, err.message);
                }
                continue;
            }
            const number = cleaned + "@c.us";

            try {
                await client.sendMessage(number, finalMessage);
                Chat.logChat(number, "User", "", finalMessage, CHAT_HISTORY_DIR);
                console.log(`Message sent to ${number}`);
                resultLines.push(`✅ ${numRaw}`);
            } catch (err) {
                console.error(`[${HelperVersion}] Error sending to ${number}:`, err.message);
                resultLines.push(`❌ ${numRaw}`);
            }
            await delay(1000);
        }

        const replyText =
            `📤 *Message Generated:*\n\`\`\`\n${finalMessage}\n\`\`\`\n\n` +
            `📬 *Delivery Status:*\n` +
            resultLines.join("\n");

        try {
            await msg.reply(replyText);
        } catch (err) {
            console.error(`[${HelperVersion}] Error sending confirmation to user:`, err.message);
        }

        return;
    }

    if (body.length > 0) {
        console.log(`Unrecognized message from ${sender}: ${body}`);
        try {
            await msg.reply(
                "Invalid command.\nUse: Contact +60123456789 [message]\nSupports up to 3 numbers."
            );
        } catch (err) {
            console.error(`[${HelperVersion}] Failed to reply invalid command message:`, err.message);
        }
    }
}

module.exports = {
    handleInitiateCommand
};
