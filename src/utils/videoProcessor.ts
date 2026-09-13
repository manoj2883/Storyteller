/**
 * Video Capture Processor (1 Frame Per Second)
 * Captures video frames from camera stream and encodes to JPEG base64 strings
 */

export class VideoProcessor {
  private mediaStream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private canvasElement: HTMLCanvasElement | null = null;
  private timerId: number | null = null;
  private onFrameCallback: (base64Jpeg: string, byteLength: number) => void;

  constructor(onFrame: (base64Jpeg: string, byteLength: number) => void) {
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
      await this.videoElement.play().catch(() => {});
    } else {
      this.videoElement = document.createElement('video');
      this.videoElement.srcObject = this.mediaStream;
      this.videoElement.muted = true;
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

    // Ensure video metadata has loaded and current frame is rendered (readyState >= 2)
    if (this.videoElement.readyState < 2) {
      console.warn('[VideoProcessor] Video element not ready yet (readyState < 2). Skipping frame.');
      return;
    }

    const ctx = this.canvasElement.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(this.videoElement, 0, 0, 640, 480);
    // Encode canvas to JPEG image base64 string
    const dataUrl = this.canvasElement.toDataURL('image/jpeg', 0.6);
    const base64Data = dataUrl.split(',')[1];
    
    if (base64Data) {
      const byteLength = base64Data.length;
      if (byteLength < 1500) {
        console.warn(`[VideoProcessor] Warning: Captured frame is unusually small (${byteLength} bytes). Canvas may be blank.`);
      } else {
        console.log(`[VideoProcessor] Captured 1 FPS JPEG frame (${byteLength} bytes).`);
      }
      this.onFrameCallback(base64Data, byteLength);
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
