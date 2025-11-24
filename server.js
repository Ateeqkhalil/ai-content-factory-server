
import express from 'express';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Logging Middleware
app.use((req, res, next) => {
    console.log(`[${req.method}] ${req.originalUrl}`);
    next();
});

// Initialize GoogleGenAI
// Ensure API_KEY is set in your Railway environment variables
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Auth Middleware
const AUTH_TOKEN = "GOCSPY-7nUWQgR-Ch37NoWDH-K1lw8VmeC9d-Y";
app.use((req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader) {
        const token = authHeader.split(' ')[1];
        if (token !== AUTH_TOKEN) {
            console.warn(`[Auth] Invalid token attempt: ${token}`);
            // Uncomment to enforce strict auth
            // return res.status(403).json({ error: 'Forbidden: Invalid Token' });
        }
    }
    next();
});

// --- Gemini Endpoints ---
// Supports both CamelCase (Client) and KebabCase (Legacy/Default Proxy) to prevent "Unknown Action" errors.

// Generate Content
app.post(['/api/gemini/generateContent', '/api/gemini/generate-content'], async (req, res) => {
    try {
        const body = req.body.requestPayload || req.body;
        const { model, contents, config } = body;
        
        console.log(`[GenerateContent] Model: ${model}`);
        
        const response = await ai.models.generateContent({ model, contents, config });
        
        // Log if text is missing (possible safety block)
        if (!response.text) {
             console.warn("[GenerateContent] Response missing text. Candidates:", JSON.stringify(response.candidates));
        }

        res.json({
            text: response.text,
            candidates: response.candidates,
            groundingMetadata: response.candidates?.[0]?.groundingMetadata,
            promptFeedback: response.promptFeedback
        });
    } catch (error) {
        console.error("Gemini Content Error:", error);
        res.status(500).json({ error: error.message || String(error) });
    }
});

// Generate Images
app.post(['/api/gemini/generateImages', '/api/gemini/generate-images'], async (req, res) => {
    try {
        const body = req.body.requestPayload || req.body;
        const { model, prompt, config } = body;
        
        console.log(`[GenerateImages] Model: ${model}`);

        const response = await ai.models.generateImages({ model, prompt, config });
        res.json({ generatedImages: response.generatedImages });
    } catch (error) {
        console.error("Gemini Image Error:", error);
        res.status(500).json({ error: error.message || String(error) });
    }
});

// Generate Videos
app.post(['/api/gemini/generateVideos', '/api/gemini/generate-videos'], async (req, res) => {
    try {
        const body = req.body.requestPayload || req.body;
        const { model, prompt, config } = body;
        
        console.log(`[GenerateVideos] Model: ${model}`);

        const response = await ai.models.generateVideos({ model, prompt, config });
        res.json(response);
    } catch (error) {
        console.error("Gemini Video Error:", error);
        res.status(500).json({ error: error.message || String(error) });
    }
});

// Poll Video Operation
app.post(['/api/gemini/getVideosOperation', '/api/gemini/get-videos-operation'], async (req, res) => {
    try {
        const body = req.body.requestPayload || req.body;
        const { operation } = body;
        
        const response = await ai.operations.getVideosOperation({ operation });
        res.json(response);
    } catch (error) {
        console.error("Gemini Polling Error:", error);
        res.status(500).json({ error: error.message || String(error) });
    }
});

// Download Video Proxy
app.get(['/api/gemini/downloadVideo', '/api/gemini/download-video'], async (req, res) => {
    const { uri } = req.query;
    if (!uri) return res.status(400).send('Missing URI');
    
    try {
        const videoRes = await fetch(`${uri}&key=${process.env.API_KEY}`);
        if (!videoRes.ok) throw new Error(`Failed to fetch video: ${videoRes.statusText}`);
        
        const contentType = videoRes.headers.get('content-type') || 'video/mp4';
        res.setHeader('Content-Type', contentType);
        
        const buffer = await videoRes.arrayBuffer();
        res.send(Buffer.from(buffer));
    } catch (error) {
        console.error("Video Download Error:", error);
        res.status(500).send(error.message || String(error));
    }
});

// --- Shopify Endpoint ---

app.post('/api/shopify/graphql', async (req, res) => {
    const { domain, query, variables, token } = req.body;
    const accessToken = token || process.env.SHOPIFY_ACCESS_TOKEN;
    
    if (!accessToken) {
        return res.status(401).json({ error: 'Missing Shopify Access Token' });
    }

    try {
        console.log(`[Shopify] Querying ${domain}`);
        const endpoint = `https://${domain}/admin/api/2024-04/graphql.json`;
        const shopifyRes = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': accessToken
            },
            body: JSON.stringify({ query, variables })
        });
        
        const data = await shopifyRes.json();
        res.status(shopifyRes.status).json(data);
    } catch (error) {
        console.error("Shopify Proxy Error:", error);
        res.status(500).json({ error: error.message || String(error) });
    }
});

// Root check
app.get('/', (req, res) => {
    res.send('AI Content Factory Server is Running');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Proxy server running on port ${PORT}`);
});
