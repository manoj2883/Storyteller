/**
 * Video Capture Processor (1 Frame Per Second)
 * Captures video frames from camera stream, encodes to JPEG base64, and provides frame preview
 */

export class VideoProcessor {
  private mediaStream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private canvasElement: HTMLCanvasElement | null = null;
  private timerId: number | null = null;
  private lastFrameDataUrl: string = '';
  private onFrameCallback: (base64Jpeg: string, byteLength: number, dataUrl: string) => void;

  constructor(onFrame: (base64Jpeg: string, byteLength: number, dataUrl: string) => void) {
    this.onFrameCallback = onFrame;
  }

  public async start(videoPreviewElement?: HTMLVideoElement): Promise<MediaStream> {
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 15 },
      },
    });

    if (videoPreviewElement) {
      this.videoElement = videoPreviewElement;
      this.videoElement.srcObject = this.mediaStream;
      this.videoElement.muted = true;
      this.videoElement.playsInline = true;
      this.videoElement.autoplay = true;
      await this.videoElement.play().catch(() => {});
    } else {
      this.videoElement = document.createElement('video');
      this.videoElement.srcObject = this.mediaStream;
      this.videoElement.muted = true;
      this.videoElement.playsInline = true;
      this.videoElement.autoplay = true;
      await this.videoElement.play().catch(() => {});
    }

    this.canvasElement = document.createElement('canvas');
    this.canvasElement.width = 640;
    this.canvasElement.height = 480;

    // Capture 1 frame per second (1000 ms)
    this.timerId = window.setInterval(() => {
      this.captureFrame();
    }, 1000);

    return this.mediaStream;
  }

  private captureFrame(): void {
    if (!this.videoElement || !this.canvasElement) return;

    if (this.videoElement.readyState < 2) {
      return;
    }

    const ctx = this.canvasElement.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(this.videoElement, 0, 0, 640, 480);
    const dataUrl = this.canvasElement.toDataURL('image/jpeg', 0.6);
    this.lastFrameDataUrl = dataUrl;
    const base64Data = dataUrl.split(',')[1];
    
    if (base64Data) {
      const byteLength = base64Data.length;
      this.onFrameCallback(base64Data, byteLength, dataUrl);
    }
  }

  public getLastFrameDataUrl(): string {
    return this.lastFrameDataUrl;
  }

  public stop(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
  }
}
