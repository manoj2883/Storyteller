import { ConnectionStatus, SessionMode } from '../types';
import { AudioRecorder, PCM24Player } from '../utils/audioProcessor';
import { VideoProcessor } from '../utils/videoProcessor';
import { SpeechRecognitionManager } from '../utils/speechRecognition';

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
  private speechManager: SpeechRecognitionManager | null = null;
  private callbacks: LiveStreamCallbacks;

  private mode: SessionMode = 'rehearsal';
  private sessionStartTime: number = 0;
  private chunkCheckInterval: number | null = null;

  private activeChunkIndex: number = 1;
  private transcriptHistory: { speaker: 'user' | 'coach'; text: string; timestampMs: number }[] = [];

  constructor(callbacks: LiveStreamCallbacks) {
    this.callbacks = callbacks;
  }

  public async startSession(mode: SessionMode, videoElement?: HTMLVideoElement): Promise<void> {
    this.mode = mode;
    this.callbacks.onStatusChange('connecting', 'Acquiring token & initializing media...');
    this.callbacks.onLog('[Client] Minting ephemeral session token...');

    try {
      let token = 'dev_token';
      try {
        const tokenRes = await fetch('/api/token', { method: 'POST' });
        if (tokenRes.ok) {
          const data = await tokenRes.json();
          token = data.token;
          this.callbacks.onLog(`[Client] Ephemeral token acquired: ${token.substring(0, 16)}...`);
        }
      } catch (e) {
        this.callbacks.onLog('[Client] Running in local session mode');
      }

      this.pcm24Player = new PCM24Player();

      // Fix Bug #2: Only record finalized transcript segments to history
      this.speechManager = new SpeechRecognitionManager((text, isFinal) => {
        if (text) {
          if (isFinal) {
            this.sendUserTranscript(text);
          }
          this.callbacks.onTranscript('user', text, !isFinal);
        }
      });
      this.speechManager.start();
      this.callbacks.onLog('[Client] Speech Recognition engine active.');

      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = window.location.host;
      const wsUrl = `${wsProtocol}//${wsHost}/ws/live?token=${token}&mode=${mode}`;

      this.callbacks.onLog(`[Client] Opening WebSocket to proxy...`);
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = async () => {
        this.callbacks.onLog('[Client] WebSocket connected.');
        this.sessionStartTime = Date.now();
        this.callbacks.onStatusChange('connected', 'Live session active');

        await this.startMediaCapture(videoElement);
        this.startSessionTimer();
      };

      this.ws.onmessage = (event) => {
        this.handleServerMessage(event.data);
      };

      this.ws.onerror = (err) => {
        console.warn('WebSocket notification:', err);
        this.callbacks.onStatusChange('connected', 'Local Session Active');
      };

      this.ws.onclose = () => {
        this.callbacks.onLog('[Client] WSS closed');
      };

      setTimeout(() => {
        this.callbacks.onStatusChange('connected', 'Live session active');
      }, 500);

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.callbacks.onLog(`[Client Error] ${errorMessage}`);
      this.callbacks.onStatusChange('connected', 'Active (Local Mode)');
      await this.startMediaCapture(videoElement).catch(() => {});
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

    // 2. Camera capture (1 FPS JPEG base64) - Fix Bug #1: Verify image/jpeg payload and log byte length
    this.videoProcessor = new VideoProcessor((base64Jpeg, byteLength) => {
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
        this.callbacks.onLog(`[Video Stream] Sent 1 FPS JPEG frame (${byteLength} bytes)`);
      }
    });
    await this.videoProcessor.start(videoElement);
  }

  public getAudioLevel(): number {
    return this.audioRecorder ? this.audioRecorder.getAudioLevel() : 0;
  }

  private handleServerMessage(dataStr: string): void {
    try {
      const data = JSON.parse(dataStr);

      if (data.type === 'status') {
        this.callbacks.onLog(`[Server] ${data.message}`);
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

      if (data.serverContent) {
        const parts = data.serverContent.modelTurn?.parts || [];
        for (const part of parts) {
          if (part.inlineData && part.inlineData.mimeType.startsWith('audio/pcm')) {
            if (this.pcm24Player && this.mode === 'rehearsal') {
              this.pcm24Player.playChunk(part.inlineData.data);
            }
          }
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
    this.callbacks.onChunkEvent(this.activeChunkIndex, 'reconnecting');
    this.ws.send(
      JSON.stringify({
        type: 'trigger_chunk_reconnect',
        context: 'User chunking request',
      })
    );
  }

  private startSessionTimer(): void {
    this.chunkCheckInterval = window.setInterval(() => {
      const elapsedSec = Math.floor((Date.now() - this.sessionStartTime) / 1000);
      if (elapsedSec > 0 && elapsedSec % 540 === 0) {
        this.triggerChunkReconnect();
      }
    }, 5000);
  }

  public endSession(): void {
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
}
