/**
 * Browser Web Speech Recognition Manager
 * Captures user speech transcripts in real-time for client-side WPM & filler detection
 */

export class SpeechRecognitionManager {
  private recognition: any = null;
  private isListening: boolean = false;
  private onTranscriptCallback: (text: string, isFinal: boolean) => void;

  constructor(onTranscript: (text: string, isFinal: boolean) => void) {
    this.onTranscriptCallback = onTranscript;

    const SpeechRecognitionClass =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognitionClass) {
      this.recognition = new SpeechRecognitionClass();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';

      this.recognition.onresult = (event: any) => {
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            this.onTranscriptCallback(transcript.trim(), true);
          } else {
            interimTranscript += transcript;
          }
        }
        if (interimTranscript.trim()) {
          this.onTranscriptCallback(interimTranscript.trim(), false);
        }
      };

      this.recognition.onerror = (event: any) => {
        console.warn('Speech recognition event warning/error:', event.error);
      };

      this.recognition.onend = () => {
        // Auto restart if active
        if (this.isListening) {
          try {
            this.recognition.start();
          } catch (e) {
            // ignore restart collision
          }
        }
      };
    } else {
      console.warn('Web Speech API not supported in this browser. Falling back to backend transcripts.');
    }
  }

  public start(): void {
    if (this.recognition && !this.isListening) {
      this.isListening = true;
      try {
        this.recognition.start();
      } catch (e) {
        console.warn('Error starting speech recognition:', e);
      }
    }
  }

  public stop(): void {
    this.isListening = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {
        // ignore stop error
      }
    }
  }
}
