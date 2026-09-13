/**
 * Browser Web Speech Recognition Manager
 * Captures user speech transcripts in real-time, emitting finalized segments with timestamps
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
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const result = event.results[i];
          const transcriptText = result[0].transcript.trim();

          if (result.isFinal) {
            // Emit ONLY finalized segments to prevent run-on walls of text
            console.log('[SpeechRecognition] Finalized segment:', transcriptText);
            this.onTranscriptCallback(transcriptText, true);
          } else {
            // Emit interim results strictly for live display
            this.onTranscriptCallback(transcriptText, false);
          }
        }
      };

      this.recognition.onerror = (event: any) => {
        console.warn('[SpeechRecognition] Event note:', event.error);
      };

      this.recognition.onend = () => {
        if (this.isListening) {
          try {
            this.recognition.start();
          } catch (e) {
            // ignore
          }
        }
      };
    } else {
      console.warn('[SpeechRecognition] Web Speech API not supported in browser.');
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
        // ignore
      }
    }
  }
}
