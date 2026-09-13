/**
 * Video Capture Processor (1 Frame Per Second)
 * Captures video frames from camera stream and encodes to JPEG base64 strings
 */

export class VideoProcessor {
  private mediaStream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private canvasElement: HTMLCanvasElement | null = null;
  private timerId: number | null = null;
  private onFrameCallback: (base64Jpeg: string) => void;

  constructor(onFrame: (base64Jpeg: string) => void) {
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
      await this.videoElement.play();
    } else {
      this.videoElement = document.createElement('video');
      this.videoElement.srcObject = this.mediaStream;
      this.videoElement.muted = true;
      await this.videoElement.play();
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
    const ctx = this.canvasElement.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(this.videoElement, 0, 0, 640, 480);
    // Convert to JPEG base64 image (0.6 quality for lower latency/bandwidth)
    const dataUrl = this.canvasElement.toDataURL('image/jpeg', 0.6);
    const base64Data = dataUrl.split(',')[1];
    if (base64Data) {
      this.onFrameCallback(base64Data);
    }
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
