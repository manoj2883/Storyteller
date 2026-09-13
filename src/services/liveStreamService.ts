import { ConnectionStatus, SessionMode } from '../types';
import { AudioRecorder, PCM24Player } from '../utils/audioProcessor';
import { VideoProcessor } from '../utils/videoProcessor';

export interface LiveStreamCallbacks {
  onStatusChange: (status: ConnectionStatus, message?: string) => void;
  onTranscript: (speaker: 'user' | 'coach', text: string, isInterim?: boolean) => void;
  onChunkEvent: (chunkIndex: number, action: 'reconnecting' | 'connected') => void;
  onLog: (logText: string) => void;
}

export class LiveStreamService {
  private ws: WebSocket | null = null;
  private audioRecorder: AudioRecorder | null = null;
  private pcm24Player: PCM24Player | null = null;
  private videoProcessor: VideoProcessor | null = null;
  private callbacks: LiveStreamCallbacks;

  private mode: SessionMode = 'rehearsal';
  private sessionStartTime: number = 0;
  private sessionDurationInterval: number | null = null;
  private chunkCheckInterval: number | null = null;

  private activeChunkIndex: number = 1;
  private isConnected: boolean = false;
  private transcriptHistory: { speaker: 'user' | 'coach'; text: string }[] = [];

  constructor(callbacks: LiveStreamCallbacks) {
    this.callbacks = callbacks;
  }

  public async startSession(mode: SessionMode, videoElement?: HTMLVideoElement): Promise<void> {
    this.mode = mode;
    this.callbacks.onStatusChange('connecting', 'Fetching ephemeral session token...');
    this.callbacks.onLog('[Client] Minting ephemeral token from server /api/token...');

    try {
      // 1. Fetch ephemeral token from Node backend server
      const tokenRes = await fetch('/api/token', { method: 'POST' });
      if (!tokenRes.ok) {
        const errorJson = await tokenRes.json().catch(() => ({}));
        throw new Error(errorJson.error || `Server returned status ${tokenRes.status}`);
      }
      const { token } = await tokenRes.json();
      this.callbacks.onLog(`[Client] Ephemeral token acquired: ${token.substring(0, 18)}...`);

      // 2. Initialize PCM24 Audio Player
      this.pcm24Player = new PCM24Player();

      // 3. Open WebSocket to backend proxy
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = window.location.host;
      const wsUrl = `${wsProtocol}//${wsHost}/ws/live?token=${token}&mode=${mode}`;

      this.callbacks.onLog(`[Client] Opening WebSocket to ${wsUrl}`);
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = async () => {
        this.callbacks.onLog('[Client] WebSocket connection established with proxy backend.');
        this.isConnected = true;
        this.sessionStartTime = Date.now();
        this.callbacks.onStatusChange('connected', 'Live session active');

        // Start media hardware streams
        await this.startMediaCapture(videoElement);

        // Start session duration and auto-chunking monitor (every 9 minutes = 540s)
        this.startSessionTimer();
      };

      this.ws.onmessage = (event) => {
        this.handleServerMessage(event.data);
      };

      this.ws.onerror = (err) => {
        console.error('WebSocket Error:', err);
        this.callbacks.onLog(`[Client Error] WebSocket error occurred.`);
        this.callbacks.onStatusChange('error', 'Connection error');
      };

      this.ws.onclose = (event) => {
        this.callbacks.onLog(`[Client] WebSocket closed (Code ${event.code})`);
        this.isConnected = false;
        this.callbacks.onStatusChange('disconnected', 'Session ended');
      };

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.callbacks.onLog(`[Client Error] Failed to start session: ${errorMessage}`);
      this.callbacks.onStatusChange('error', errorMessage);
    }
  }

  private async startMediaCapture(videoElement?: HTMLVideoElement): Promise<void> {
    // 1. Microphone capture (16kHz PCM base64)
    this.audioRecorder = new AudioRecorder((base64Pcm) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const realtimeAudioInput = {
          realtimeInput: {
            mediaChunks: [
              {
                mimeType: 'audio/pcm;rate=16000',
                data: base64Pcm,
              },
            ],
          },
        };
        this.ws.send(JSON.stringify(realtimeAudioInput));
      }
    });
    await this.audioRecorder.start();
    this.callbacks.onLog('[Client] Microphone capture started (16kHz 16-bit PCM LE).');

    // 2. Camera capture (1 FPS JPEG base64)
    this.videoProcessor = new VideoProcessor((base64Jpeg) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const realtimeVideoInput = {
          realtimeInput: {
            mediaChunks: [
              {
                mimeType: 'image/jpeg',
                data: base64Jpeg,
              },
            ],
          },
        };
        this.ws.send(JSON.stringify(realtimeVideoInput));
      }
    });
    await this.videoProcessor.start(videoElement);
    this.callbacks.onLog('[Client] Camera capture started (1 FPS JPEG).');
  }

  private handleServerMessage(dataStr: string): void {
    try {
      const data = JSON.parse(dataStr);

      // Handle custom server control status
      if (data.type === 'status') {
        this.callbacks.onLog(`[Server Status] ${data.message}`);
        if (data.chunkIndex) {
          this.activeChunkIndex = data.chunkIndex;
          this.callbacks.onChunkEvent(data.chunkIndex, 'connected');
        }
        return;
      }

      if (data.type === 'chunk_reconnecting') {
        this.callbacks.onStatusChange('chunking', `Chunk #${data.chunkIndex} reconnecting...`);
        this.callbacks.onChunkEvent(data.chunkIndex, 'reconnecting');
        this.callbacks.onLog(`[Chunk Engine] Transparent session chunk #${data.chunkIndex} in progress...`);
        return;
      }

      // Handle Gemini Live API Bidi response
      if (data.serverContent) {
        const parts = data.serverContent.modelTurn?.parts || [];
        for (const part of parts) {
          // Play 24kHz audio output chunk
          if (part.inlineData && part.inlineData.mimeType.startsWith('audio/pcm')) {
            if (this.pcm24Player) {
              this.pcm24Player.playChunk(part.inlineData.data);
            }
          }
          // Record model turn text transcript
          if (part.text) {
            this.transcriptHistory.push({ speaker: 'coach', text: part.text });
            this.callbacks.onTranscript('coach', part.text, !data.serverContent.turnComplete);
          }
        }
      }
    } catch (e) {
      // Raw string audio or debug text
      this.callbacks.onLog(`[Raw Server Data] ${dataStr.substring(0, 100)}...`);
    }
  }

  /**
   * Manually or automatically trigger transparent session chunk reconnection
   */
  public triggerChunkReconnect(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.callbacks.onLog('[Chunk Engine] Manual session chunking trigger requested.');

    const recentTranscriptSummary = this.transcriptHistory
      .slice(-15)
      .map((t) => `${t.speaker}: ${t.text}`)
      .join('\n');

    this.ws.send(
      JSON.stringify({
        type: 'trigger_chunk_reconnect',
        context: recentTranscriptSummary || 'User is speaking, continuing session context.',
      })
    );
  }

  private startSessionTimer(): void {
    // Monitor session time for 9-minute auto chunking (540 seconds)
    this.chunkCheckInterval = window.setInterval(() => {
      const elapsedSec = Math.floor((Date.now() - this.sessionStartTime) / 1000);
      // Auto-trigger chunking at 9 min (540s) mark
      if (elapsedSec > 0 && elapsedSec % 540 === 0) {
        this.callbacks.onLog(`[Chunk Engine] 9-minute session threshold reached (${elapsedSec}s). Auto chunking...`);
        this.triggerChunkReconnect();
      }
    }, 5000);
  }

  public endSession(): void {
    if (this.chunkCheckInterval !== null) {
      clearInterval(this.chunkCheckInterval);
      this.chunkCheckInterval = null;
    }
    if (this.audioRecorder) {
      this.audioRecorder.stop();
      this.audioRecorder = null;
    }
    if (this.videoProcessor) {
      this.videoProcessor.stop();
      this.videoProcessor = null;
    }
    if (this.pcm24Player) {
      this.pcm24Player.stop();
      this.pcm24Player = null;
    }
    if (this.ws) {
      this.ws.close(1000, 'User ended session');
      this.ws = null;
    }
    this.callbacks.onLog('[Client] Session cleanly stopped.');
    this.callbacks.onStatusChange('disconnected', 'Session ended');
  }

  public sendUserTranscript(text: string): void {
    this.transcriptHistory.push({ speaker: 'user', text });
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'transcript_user_text',
          text,
        })
      );
    }
  }

  public getChunkIndex(): number {
    return this.activeChunkIndex;
  }
}
