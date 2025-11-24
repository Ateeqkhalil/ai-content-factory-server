import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';
import fetch from 'node-fetch';

const app = express();

// Handle large payloads (like base64 images)
app.use(express.json({ limit: '50mb' }));
app.use(cors());

const GEMINI_API_KEY = process.env.API_KEY;
const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const APP_SECRET_KEY = process.env.APP_SECRET_KEY;

// --- Validation ---
if (!GEMINI_API_KEY) console.error("CRITICAL: API_KEY (Gemini) is missing.");
if (!APP_SECRET_KEY) console.error("CRITICAL: APP_SECRET_KEY is missing.");

// --- Middleware ---
const authenticateRequest = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization header missing.' });
    }
    const token = authHeader.split(' ')[1];
    if (token !== APP_SECRET_KEY) {
        return res.status(403).json({ error: 'Invalid authentication token.' });
    }
    next();
};

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// --- Gemini Endpoints ---
app.post('/api/gemini/:action', authenticateRequest, async (req, res) => {
    const { action } = req.params;
    const body = req.body;

    try {
        let result;
        switch (action) {
            case 'generateContent':
                // Handles Text, Audio, Tools
                result = await ai.models.generateContent(body.requestPayload);
                break;
            
            case 'generateImages':
                // Handles Imagen specific calls
                result = await ai.models.generateImages(body.requestPayload);
                break;

            case 'generateVideos':
                result = await ai.models.generateVideos(body.requestPayload);
                break;

            case 'getVideosOperation':
                result = await ai.operations.getVideosOperation(body.operation);
                break;

            case 'downloadVideo':
                // Securely download video using the server's API Key
                if (!body.downloadLink) return res.status(400).json({ error: 'Missing downloadLink' });
                
                // Append key to the download URL
                const videoUrl = `${body.downloadLink}&key=${GEMINI_API_KEY}`;
                const vidResponse = await fetch(videoUrl);
                if (!vidResponse.ok) throw new Error(`Failed to fetch video: ${vidResponse.status}`);
                
                const buffer = await vidResponse.buffer();
                result = { 
                    data: buffer.toString('base64'), 
                    mimeType: vidResponse.headers.get('content-type') || 'video/mp4' 
                };
                break;

            default:
                return res.status(400).json({ error: `Unknown action: ${action}` });
        }
        res.json(result);

    } catch (error) {
        console.error(`Gemini Error [${action}]:`, error);
        const msg = error.message || "Server error processing AI request.";
        res.status(500).json({ error: { message: msg } });
    }
});

// --- Shopify Endpoints ---
app.post('/api/shopify', authenticateRequest, async (req, res) => {
    const { query, variables } = req.body;
    
    if (!SHOPIFY_STORE_URL || !SHOPIFY_ACCESS_TOKEN) {
        return res.status(503).json({ error: 'Shopify is not configured on the server.' });
    }

    const url = `https://${SHOPIFY_STORE_URL}/admin/api/2024-04/graphql.json`;
    const fetchOpts = {
        method: 'POST',
        headers: {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
    };

    try {
        const shopifyRes = await fetch(url, fetchOpts);
        const data = await shopifyRes.json();
        
        if (!shopifyRes.ok) {
            return res.status(shopifyRes.status).json(data);
        }
        res.json(data);
    } catch (error) {
        console.error("Shopify Proxy Error:", error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Proxy server running on http://localhost:${PORT}`);
});