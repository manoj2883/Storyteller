import { ConnectionStatus, SessionMode } from '../types';
import { AudioRecorder, PCM24Player } from '../utils/audioProcessor';
import { VideoProcessor } from '../utils/videoProcessor';
import { SpeechRecognitionManager } from '../utils/speechRecognition';

export interface LiveStreamCallbacks {
  onStatusChange: (status: ConnectionStatus, message?: string) => void;
  onTranscript: (speaker: 'user' | 'coach', text: string, isInterim?: boolean) => void;
  onChunkEvent: (chunkIndex: number, action: 'reconnecting' | 'connected') => void;
  onFrameSnapshot?: (dataUrl: string) => void;
  onLog: (logText: string) => void;
}

export class LiveStreamService {
  private ws: WebSocket | null = null;
  private audioRecorder: AudioRecorder | null = null;
  private pcm24Player: PCM24Player | null = null;
  private videoProcessor: VideoProcessor | null = null;
  private speechManager: SpeechRecognitionManager | null = null;
  private callbacks: LiveStreamCallbacks;

  private mode: SessionMode = 'rehearsal';
  private sessionStartTime: number = 0;
  private chunkStartTime: number = 0;
  private chunkCheckInterval: number | null = null;
  private isUserClosed: boolean = false;

  private activeChunkIndex: number = 1;
  private transcriptHistory: { speaker: 'user' | 'coach'; text: string; timestampMs: number }[] = [];

  constructor(callbacks: LiveStreamCallbacks) {
    this.callbacks = callbacks;
  }

  public async startSession(mode: SessionMode, videoElement?: HTMLVideoElement): Promise<void> {
    this.mode = mode;
    this.isUserClosed = false;
    this.callbacks.onStatusChange('connecting', 'Acquiring session token...');
    this.callbacks.onLog('[Client] Requesting sessionToken from server /api/session-token...');

    // FIX 3: Start Audio & Video capture independently of socket so camera preview works immediately
    try {
      await this.startMediaCapture(videoElement);
      this.callbacks.onLog('[Client] Hardware media capture active (mic + camera).');
    } catch (mediaErr: any) {
      this.callbacks.onLog(`[Client Error] Media capture failed: ${mediaErr.message}`);
    }

    try {
      // FIX 7: Fetch sessionToken from backend
      const tokenRes = await fetch('/api/session-token', { method: 'POST' });
      if (!tokenRes.ok) {
        throw new Error(`Server token endpoint returned HTTP ${tokenRes.status}`);
      }
      const tokenData = await tokenRes.json();
      const sessionToken = tokenData.sessionToken || tokenData.token;

      if (!sessionToken) {
        throw new Error('Server response contained no sessionToken');
      }
      this.callbacks.onLog(`[Client] Acquired sessionToken: ${sessionToken.substring(0, 16)}...`);

      // Initialize speech recognition & audio player
      this.pcm24Player = new PCM24Player();

      // FIX 5: Only record finalized transcript segments to history
      this.speechManager = new SpeechRecognitionManager((text, isFinal) => {
        if (text) {
          if (isFinal) {
            this.sendUserTranscript(text);
          }
          this.callbacks.onTranscript('user', text, !isFinal);
        }
      });
      this.speechManager.start();

      // FIX 1: Connect to ws://localhost:3001/ws/live
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = window.location.host;
      const wsUrl = `${wsProtocol}//${wsHost}/ws/live?token=${sessionToken}&mode=${mode}`;

      this.callbacks.onLog(`[Client] Opening WebSocket to ${wsUrl}`);
      this.ws = new WebSocket(wsUrl);

      // FIX 2: Only report "connected" when onopen has fired!
      this.ws.onopen = () => {
        this.callbacks.onLog('[Client] WebSocket onopen fired. Session connected!');
        this.sessionStartTime = Date.now();
        this.chunkStartTime = Date.now();
        this.callbacks.onStatusChange('connected', 'Live session active');
        this.startSessionTimer();
      };

      this.ws.onmessage = (event) => {
        this.handleServerMessage(event.data);
      };

      // FIX 2: Handle onerror with real failed status and error text. Remove all "Local Mode" fallbacks.
      this.ws.onerror = (err: Event) => {
        console.error('[Client WSS Error]', err);
        this.callbacks.onLog('[Client Error] WebSocket error occurred.');
        this.callbacks.onStatusChange('failed', 'WebSocket Connection Failed');
      };

      // FIX 2: Handle onclose - set disconnected unless user-initiated
      this.ws.onclose = (event: CloseEvent) => {
        this.callbacks.onLog(`[Client] WebSocket onclose fired (Code ${event.code}: ${event.reason || 'Closed'})`);
        if (!this.isUserClosed) {
          this.callbacks.onStatusChange('failed', `Socket closed (${event.code}: ${event.reason || 'Connection lost'})`);
        } else {
          this.callbacks.onStatusChange('disconnected', 'Session ended');
        }
      };

    } catch (err: unknown) {
      // FIX 2: If session initialization fails, set status to failed. No fake connected or local fallback.
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.callbacks.onLog(`[Client Error] Session start failed: ${errorMessage}`);
      this.callbacks.onStatusChange('failed', errorMessage);
    }
  }

  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private mediaBlobUrl: string | null = null;

  private async startMediaCapture(videoElement?: HTMLVideoElement): Promise<void> {
    // 1. Microphone capture (16kHz PCM base64)
    this.audioRecorder = new AudioRecorder((base64Pcm) => {
      // FIX 3: Gate sending on ws.readyState === WebSocket.OPEN
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

    // 2. Camera capture (1 FPS JPEG base64)
    this.videoProcessor = new VideoProcessor((base64Jpeg, byteLength, dataUrl) => {
      if (this.callbacks.onFrameSnapshot) {
        this.callbacks.onFrameSnapshot(dataUrl);
      }
      // FIX 3: Gate sending on ws.readyState === WebSocket.OPEN
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

    // 3. MediaRecorder for local session replay
    try {
      if (videoElement && videoElement.srcObject) {
        const stream = videoElement.srcObject as MediaStream;
        if (typeof MediaRecorder !== 'undefined') {
          const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
            ? 'video/webm;codecs=vp9'
            : MediaRecorder.isTypeSupported('video/webm')
            ? 'video/webm'
            : 'video/mp4';

          this.recordedChunks = [];
          this.mediaRecorder = new MediaRecorder(stream, { mimeType });
          this.mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
              this.recordedChunks.push(e.data);
            }
          };
          this.mediaRecorder.start(1000);
        }
      }
    } catch (recErr) {
      console.warn('[LiveStreamService] MediaRecorder setup note:', recErr);
    }
  }

  public getAudioLevel(): number {
    return this.audioRecorder ? this.audioRecorder.getAudioLevel() : 0;
  }

  private handleServerMessage(dataStr: string): void {
    try {
      const data = JSON.parse(dataStr);

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
        return;
      }

      // Handle Live API response
      if (data.serverContent) {
        const parts = data.serverContent.modelTurn?.parts || [];
        for (const part of parts) {
          if (part.inlineData && part.inlineData.mimeType.startsWith('audio/pcm')) {
            if (this.pcm24Player && this.mode === 'rehearsal') {
              this.pcm24Player.playChunk(part.inlineData.data);
            }
          }
          // FIX 5: Record finalized model turn text
          if (part.text && this.mode === 'rehearsal') {
            this.transcriptHistory.push({ speaker: 'coach', text: part.text, timestampMs: Date.now() });
            this.callbacks.onTranscript('coach', part.text, !data.serverContent.turnComplete);
          }
        }
      }
    } catch (e) {
      // ignore
    }
  }

  public triggerChunkReconnect(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.activeChunkIndex++;
    this.chunkStartTime = Date.now();
    this.callbacks.onChunkEvent(this.activeChunkIndex, 'reconnecting');

    // FIX 10: Build summary from finalized transcript entries
    const transcriptSummary = this.transcriptHistory
      .slice(-15)
      .map((t) => `${t.speaker}: ${t.text}`)
      .join('\n');

    this.ws.send(
      JSON.stringify({
        type: 'trigger_chunk_reconnect',
        context: transcriptSummary || 'User continuing session...',
      })
    );
  }

  private startSessionTimer(): void {
    // FIX 10: Track chunk start timestamp instead of modulus on interval
    this.chunkCheckInterval = window.setInterval(() => {
      const chunkElapsedSec = Math.floor((Date.now() - this.chunkStartTime) / 1000);
      if (chunkElapsedSec >= 540) { // 9 minutes threshold out of 10 min cap
        this.callbacks.onLog(`[Chunking Engine] 9-minute threshold reached (${chunkElapsedSec}s). Triggering chunk reconnect...`);
        this.triggerChunkReconnect();
      }
    }, 5000);
  }

  public endSession(): string | null {
    this.isUserClosed = true;

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
        if (this.recordedChunks.length > 0) {
          const mimeType = this.mediaRecorder.mimeType || 'video/webm';
          const blob = new Blob(this.recordedChunks, { type: mimeType });
          this.mediaBlobUrl = URL.createObjectURL(blob);
        }
      } catch (err) {
        console.warn('MediaRecorder stop notice:', err);
      }
      this.mediaRecorder = null;
    }

    if (this.chunkCheckInterval !== null) {
      clearInterval(this.chunkCheckInterval);
      this.chunkCheckInterval = null;
    }
    if (this.speechManager) {
      this.speechManager.stop();
      this.speechManager = null;
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
    this.callbacks.onStatusChange('disconnected', 'Session ended');
    return this.mediaBlobUrl;
  }

  public sendUserTranscript(text: string): void {
    this.transcriptHistory.push({ speaker: 'user', text, timestampMs: Date.now() });
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
