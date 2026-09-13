import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import { TEARDOWN_PROMPT } from '../src/prompts/teardown.js';

dotenv.config();

const PORT = process.env.PORT || 3001;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Store active ephemeral tokens
const validTokens = new Set();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Mint ephemeral token endpoint
app.post('/api/token', (req, res) => {
  const apiKeyPresent = Boolean(GEMINI_API_KEY && GEMINI_API_KEY.trim() !== '');
  if (!apiKeyPresent) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY is not configured on the server. Please set it in .env file.'
    });
  }

  const ephemeralToken = 'st_ephemeral_' + crypto.randomBytes(16).toString('hex');
  validTokens.add(ephemeralToken);

  setTimeout(() => {
    validTokens.delete(ephemeralToken);
  }, 3600 * 1000);

  res.json({
    token: ephemeralToken,
    expiresIn: 3600,
    serverTime: new Date().toISOString()
  });
});

// Post-Session Teardown Endpoint (Uses standard Gemini Pro tier text model)
app.post('/api/teardown', async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY missing on server' });
  }

  try {
    const { sessionId, durationSec, mode, transcript, metrics, flatStretches, stories } = req.body;

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const promptContext = `
System Instruction:
${TEARDOWN_PROMPT}

Target Response JSON Schema (Return strict JSON matching this structure):
{
  "compositeScore": number (0-100),
  "theOneThing": "string (one paragraph)",
  "scores": {
    "storyStructure": { "score": number, "evidenceQuote": "string", "timestamp": "mm:ss", "explanation": "string" },
    "delivery": { "score": number, "evidenceQuote": "string", "timestamp": "mm:ss", "explanation": "string" },
    "registerPhrasing": { "score": number, "evidenceQuote": "string", "timestamp": "mm:ss", "explanation": "string" },
    "witLightness": { "score": number, "evidenceQuote": "string", "timestamp": "mm:ss", "explanation": "string" }
  },
  "structureTeardown": [
    { "storyName": "string", "missingBeats": ["hook", "stakes"], "suggestedLandingLine": "string", "analysis": "string" }
  ],
  "deliveryTeardown": {
    "fillerRatePerMin": number,
    "last5AvgFillerRate": number,
    "paceRunawayTimestamps": ["mm:ss"],
    "missedPauseTimestamps": ["mm:ss"]
  },
  "registerTeardown": [
    { "originalText": "string", "nativeAlternative1": "string", "nativeAlternative2": "string", "contextAndRegister": "string" }
  ],
  "lightnessTeardown": {
    "missingBeatTimestamps": ["mm:ss"],
    "suggestedBitLine": "string"
  },
  "tomorrowDrill": "string (10-minute drill)"
}

SESSION INPUT DATA:
Mode: ${mode}
Duration: ${durationSec} seconds
Transcript: ${JSON.stringify(transcript)}
Metrics: ${JSON.stringify(metrics)}
Flat Stretch Windows: ${JSON.stringify(flatStretches)}
Story Bank Entries: ${JSON.stringify(stories || [])}
`;

    const response = await ai.models.generateContent({
      model: 'gemini-1.5-pro',
      contents: promptContext,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const teardownData = JSON.parse(response.text || '{}');
    teardownData.id = 'td_' + Date.now();
    teardownData.sessionId = sessionId;
    teardownData.createdAt = new Date().toISOString();
    teardownData.mode = mode;
    teardownData.durationSec = durationSec;

    res.json(teardownData);
  } catch (err) {
    console.error('Teardown generation error:', err);
    res.status(500).json({ error: 'Failed to generate teardown report: ' + err.message });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    hasApiKey: Boolean(GEMINI_API_KEY && GEMINI_API_KEY.trim() !== ''),
    timestamp: new Date().toISOString()
  });
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/live' });

wss.on('connection', (clientWs, req) => {
  const urlParams = new URLSearchParams(req.url.split('?')[1]);
  const token = urlParams.get('token');
  const mode = urlParams.get('mode') || 'rehearsal';

  if (token && !validTokens.has(token)) {
    clientWs.send(JSON.stringify({ type: 'error', message: 'Invalid or expired ephemeral token' }));
    clientWs.close(4001, 'Invalid token');
    return;
  }

  const apiKey = GEMINI_API_KEY;
  if (!apiKey) {
    clientWs.send(JSON.stringify({ type: 'error', message: 'GEMINI_API_KEY not configured on server' }));
    clientWs.close(4002, 'API key missing');
    return;
  }

  const geminiModel = 'models/gemini-2.0-flash-exp';
  const geminiWsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;

  let geminiWs = null;
  let chunkCount = 1;
  let contextHistory = [];

  function connectToGemini(carriedContext = '') {
    geminiWs = new WebSocket(geminiWsUrl);

    geminiWs.on('open', () => {
      let systemPromptText = mode === 'rehearsal' ?
        "You are running a rehearsal with Mano. Camera and mic are on. You may interrupt when he buries point, abstracts, or exceeds 180 WPM."
        : "You are Storyteller, live speech coach.";

      if (carriedContext) {
        systemPromptText += `\n\n[CARRIED-OVER SESSION CONTEXT]:\n${carriedContext}`;
      }

      const setupMessage = {
        setup: {
          model: geminiModel,
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: "Puck"
                }
              }
            }
          },
          systemInstruction: {
            parts: [{ text: systemPromptText }]
          }
        }
      };

      geminiWs.send(JSON.stringify(setupMessage));

      clientWs.send(JSON.stringify({
        type: 'status',
        state: 'connected',
        chunkIndex: chunkCount,
        message: `Connected to Gemini Live API`
      }));
    });

    geminiWs.on('message', (data) => {
      try {
        const responseString = data.toString();
        const jsonResponse = JSON.parse(responseString);

        if (jsonResponse.serverContent?.modelTurn?.parts) {
          for (const part of jsonResponse.serverContent.modelTurn.parts) {
            if (part.text) {
              contextHistory.push(`Coach: ${part.text}`);
            }
          }
        }

        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(responseString);
        }
      } catch (err) {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(data);
        }
      }
    });

    geminiWs.on('error', (err) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: 'error', message: `Gemini API Error: ${err.message}` }));
      }
    });

    geminiWs.on('close', (code, reason) => {
      console.log(`[WS Server] Gemini WSS closed (${code}: ${reason.toString()})`);
    });
  }

  connectToGemini();

  clientWs.on('message', (msg) => {
    try {
      const msgStr = msg.toString();
      const parsed = JSON.parse(msgStr);

      if (parsed.type === 'trigger_chunk_reconnect') {
        chunkCount++;
        const summaryContext = contextHistory.slice(-20).join('\n') || parsed.context || 'Continuing session...';
        if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
          geminiWs.close(1000, 'Chunking refresh');
        }
        clientWs.send(JSON.stringify({
          type: 'chunk_reconnecting',
          chunkIndex: chunkCount,
          message: `Initiating transparent session chunk #${chunkCount}...`
        }));
        connectToGemini(summaryContext);
        return;
      }

      if (parsed.type === 'transcript_user_text') {
        contextHistory.push(`Mano: ${parsed.text}`);
      }

      if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
        geminiWs.send(msgStr);
      }
    } catch (e) {
      if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
        geminiWs.send(msg);
      }
    }
  });

  clientWs.on('close', () => {
    if (geminiWs) {
      geminiWs.close(1000, 'Client disconnected');
    }
  });
});

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(` Storyteller Node Server running on http://localhost:${PORT}`);
  console.log(`====================================================`);
});
