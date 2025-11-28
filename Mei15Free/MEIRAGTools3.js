// MEIRAGTools3.js
const path = require('path');
const fs = require('fs');
const axios = require('axios');
let vectorDB = null;

const HelperVersion = path.basename(__filename).replace(/\.[^/.]+$/, "");

console.log(`RAG= ${process.env.RAG}`);

// === CONFIGURATION ===
const embedModel = 'text-embedding-3-small';
const openaiEmbedURL = 'https://api.openai.com/v1/embeddings';
const METADATA_PATH = process.env.VECTOR_DB_PATH;
if (!METADATA_PATH) {
    console.error(`${HelperVersion}: VECTOR_DB_PATH not set in .env`);
    process.exit(1);
}

// === Load the vector DB ONCE globally ===
function ensureVectorDBLoaded() {
    if (!vectorDB && process.env.RAG === "On") { 
        const fullPath = path.resolve(__dirname, '..', 'userdata', process.env.VECTOR_DB_PATH);
        
        if (!fs.existsSync(fullPath)) {
            console.warn(`${HelperVersion}: ${fullPath} not found. Skipping vector DB load.`);
            return;
        }

        try {
            const raw = fs.readFileSync(fullPath, 'utf8');
            vectorDB = JSON.parse(raw);

            if (!Array.isArray(vectorDB) || !Array.isArray(vectorDB[0]?.vector)) {
                console.warn(`${HelperVersion}: Invalid vector DB format.`);
                vectorDB = null;
            }
        } catch (err) {
            console.warn(`${HelperVersion}: Error reading vector DB: ${err.message}`);
            vectorDB = null;
        }
    }
}

// === Normalize embedding vector ===
function normalize(vec) {
    const norm = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
    return vec.map(v => v / norm);
}

// === Cosine similarity ===
function cosineSim(vecA, vecB) {
    let dot = 0;
    for (let i = 0; i < vecA.length; i++) dot += vecA[i] * vecB[i];
    return dot;
}

// === Generate normalized embedding for input text ===
async function getEmbedding(text) {
    try {
        const res = await axios.post(openaiEmbedURL, {
            model: embedModel,
            input: text
        }, {
            headers: {
                "Authorization": `Bearer ${process.env.openaiApi}`,
                "Content-Type": "application/json"
            }
        });

        const embedding = res.data.data[0]?.embedding;
        if (!embedding) throw new Error("No embedding returned");
        return normalize(embedding);

    } catch (error) {
        console.error(`${HelperVersion}: Embedding Error:`, error?.response?.data || error.message);
        return null;
    }
}

// === Retrieve top matching chunks from vector DB ===
function getTopChunks(queryVec, topK = 3) {
    ensureVectorDBLoaded(); // Lazy loading

    if (!Array.isArray(vectorDB)) {
        console.warn(`${HelperVersion}: vectorDB unavailable. Skipping.`);
        return [];
    }

    const results = vectorDB
        .map(entry => ({
            title: entry.title || "",
            text: entry.text,
            score: cosineSim(queryVec, normalize(entry.vector))
        }))
        .sort((a, b) => b.score - a.score);

    const best = results[0];
    const debugPreview = best.text.replace(/\s+/g, " ").slice(0, 80);
    console.log(`${HelperVersion}: Best match score: ${best.score.toFixed(4)}`);
    console.log(`${HelperVersion}: Preview: ${debugPreview}...`);

    if (best.score < 0.30) {
        console.warn(`${HelperVersion}: Score too low (${best.score.toFixed(4)}). Returning NO result.`);
        return [];
    }

    return results.slice(0, topK);
}

module.exports = {
    getEmbedding,
    getTopChunks
};
