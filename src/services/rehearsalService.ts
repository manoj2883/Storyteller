import { MetricSnapshot } from '../utils/metricsEngine';

export interface InterruptionEvent {
  count: number;
  reason: string;
  isHostileAudienceTurn: boolean;
  timestampSec: number;
}

export class RehearsalEngine {
  private interruptionCount: number = 0;
  private lastInterruptionTimeSec: number = 0;
  private onInterruptCallback: (event: InterruptionEvent) => void;

  constructor(onInterrupt: (event: InterruptionEvent) => void) {
    this.onInterruptCallback = onInterrupt;
  }

  public checkMetricsAndText(metrics: MetricSnapshot, userText: string, nowSec: number = Date.now() / 1000): void {
    // Cooldown: at least 8 seconds between interruptions
    if (nowSec - this.lastInterruptionTimeSec < 8) return;

    let triggerReason = '';

    // 1. WPM > 180 trigger
    if (metrics.wpm15s > 180) {
      triggerReason = `Pace runaway (${metrics.wpm15s} WPM exceeds 180 limit)`;
    }

    // 2. Filler stacking trigger (>= 3 fillers in rolling 30s)
    if (!triggerReason && metrics.fillerCount30s >= 3) {
      triggerReason = `Stacked ${metrics.fillerCount30s} fillers in one segment`;
    }

    // 3. Preamble & abstraction trigger heuristics
    if (!triggerReason && userText) {
      const lower = userText.toLowerCase();
      if (lower.includes('basically') && lower.includes('in terms of')) {
        triggerReason = 'Abstracting instead of concrete story scene';
      } else if (lower.startsWith('so before i start') || lower.startsWith('i guess what i wanted to say is')) {
        triggerReason = 'Burying point under preamble';
      }
    }

    if (triggerReason) {
      this.interruptionCount++;
      this.lastInterruptionTimeSec = nowSec;
      const isHostileAudienceTurn = this.interruptionCount % 4 === 0;

      this.onInterruptCallback({
        count: this.interruptionCount,
        reason: triggerReason,
        isHostileAudienceTurn,
        timestampSec: nowSec,
      });
    }
  }

  public reset(): void {
    this.interruptionCount = 0;
    this.lastInterruptionTimeSec = 0;
  }
}
