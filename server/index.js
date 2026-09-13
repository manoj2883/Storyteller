import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import { TEARDOWN_PROMPT } from './prompts/teardown.js';

dotenv.config();

const PORT = process.env.PORT || 3001;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const validTokens = new Set();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

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

// Post-Session Teardown Endpoint - Fix Bug #3: Log requests, format timestamps, strip markdown fences
app.post('/api/teardown', async (req, res) => {
  console.log('[Server /api/teardown] Received teardown generation request.');

  if (!GEMINI_API_KEY) {
    console.error('[Server /api/teardown] GEMINI_API_KEY missing!');
    return res.status(500).json({ error: 'GEMINI_API_KEY missing on server' });
  }

  try {
    const { sessionId, durationSec, mode, transcript, metrics, flatStretches, stories } = req.body;
    console.log(`[Server /api/teardown] Processing session: ${sessionId}, Duration: ${durationSec}s, Turns: ${transcript?.length || 0}`);

    // Format transcript entries into clean timestamped lines [mm:ss] Speaker: "Text"
    const formattedTranscript = (transcript || []).map((t) => {
      const sec = t.timestampSec || 0;
      const m = Math.floor(sec / 60).toString().padStart(2, '0');
      const s = Math.floor(sec % 60).toString().padStart(2, '0');
      return `[${m}:${s}] ${t.speaker === 'user' ? 'Mano' : 'Coach'}: "${t.text}"`;
    }).join('\n');

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const promptContext = `
System Instruction:
${TEARDOWN_PROMPT}

Target Response JSON Schema (Return strict JSON matching this structure):
{
  "compositeScore": 75,
  "theOneThing": "The single highest leverage fix for next session...",
  "scores": {
    "storyStructure": { "score": 70, "evidenceQuote": "quote from transcript", "timestamp": "01:15", "explanation": "explanation" },
    "delivery": { "score": 80, "evidenceQuote": "quote from transcript", "timestamp": "02:30", "explanation": "explanation" },
    "registerPhrasing": { "score": 75, "evidenceQuote": "quote from transcript", "timestamp": "00:45", "explanation": "explanation" },
    "witLightness": { "score": 60, "evidenceQuote": "quote from transcript", "timestamp": "03:10", "explanation": "explanation" }
  },
  "structureTeardown": [
    { "storyName": "Main Story", "missingBeats": ["hook", "stakes"], "suggestedLandingLine": "compressed landing line", "analysis": "analysis" }
  ],
  "deliveryTeardown": {
    "fillerRatePerMin": 4.5,
    "last5AvgFillerRate": 3.0,
    "paceRunawayTimestamps": ["01:30"],
    "missedPauseTimestamps": ["02:15"]
  },
  "registerTeardown": [
    { "originalText": "imprecise phrase", "nativeAlternative1": "native option 1", "nativeAlternative2": "native option 2", "contextAndRegister": "register difference" }
  ],
  "lightnessTeardown": {
    "missingBeatTimestamps": ["02:00"],
    "suggestedBitLine": "reusable bit line"
  },
  "tomorrowDrill": "10-minute specific drill description"
}

SESSION INPUT DATA:
Mode: ${mode}
Duration: ${durationSec} seconds

Timestamped Transcript:
${formattedTranscript || '[00:00] Mano: "I started talking about our product launch."'}

Delivery Metrics: ${JSON.stringify(metrics || {})}
Flat-Stretch Drop-Off Windows: ${JSON.stringify(flatStretches || [])}
Relevant Story Bank Entries: ${JSON.stringify(stories || [])}
`;

    console.log('[Server /api/teardown] Calling Gemini 1.5 Pro text model...');
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-pro',
      contents: promptContext,
      config: {
        responseMimeType: 'application/json',
      },
    });

    let rawText = response.text || '{}';
    console.log('[Server /api/teardown] Received response text length:', rawText.length);

    // Fix Bug #3: Strip markdown code blocks before parsing JSON
    rawText = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

    const teardownData = JSON.parse(rawText);
    teardownData.id = 'td_' + Date.now();
    teardownData.sessionId = sessionId || 'sess_' + Date.now();
    teardownData.createdAt = new Date().toISOString();
    teardownData.mode = mode || 'rehearsal';
    teardownData.durationSec = durationSec || 0;

    console.log('[Server /api/teardown] Teardown JSON parsed successfully! Composite score:', teardownData.compositeScore);
    res.json(teardownData);
  } catch (err) {
    console.error('[Server /api/teardown Error]:', err.message);
    res.status(500).json({ error: 'Failed to generate teardown report: ' + err.message });
  }
});

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

      // Log video payload stats on server
      if (parsed.realtimeInput?.mediaChunks) {
        for (const chunk of parsed.realtimeInput.mediaChunks) {
          if (chunk.mimeType === 'image/jpeg') {
            console.log(`[Server WSS Proxy] Forwarding video frame (${chunk.data?.length || 0} base64 chars) to Gemini Live API`);
          }
        }
      }

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
