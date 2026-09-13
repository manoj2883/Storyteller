import React from 'react';
import { MetricSnapshot } from '../utils/metricsEngine';

interface LiveModeHUDProps {
  metrics: MetricSnapshot;
}

export const LiveModeHUD: React.FC<LiveModeHUDProps> = ({ metrics }) => {
  // Target band: 120 - 160 WPM
  // Colour shifts: Emerald (120-160 WPM), Amber (<120 or >160 WPM), Rose (>180 or <90 WPM)
  const getPaceColor = () => {
    if (metrics.wpm15s === 0) return 'bg-slate-700';
    if (metrics.wpm15s >= 120 && metrics.wpm15s <= 160) return 'bg-emerald-500 shadow-emerald-500/50';
    if (metrics.wpm15s > 180 || metrics.wpm15s < 90) return 'bg-rose-500 shadow-rose-500/50';
    return 'bg-amber-500 shadow-amber-500/50';
  };

  // Width percentage for Pace Bar (clamped 0 - 220 WPM)
  const pacePercentage = Math.min(100, Math.max(5, (metrics.wpm15s / 220) * 100));

  return (
    <div className="fixed bottom-6 right-6 z-50 pointer-events-none select-none flex items-center gap-4 bg-dark-900/80 backdrop-blur-lg p-3 rounded-2xl border border-white/10 shadow-2xl">
      {/* 1. Filler Dot (Pulses red when filler density crosses threshold) */}
      <div className="flex items-center gap-2 px-2">
        <div
          className={`w-4 h-4 rounded-full transition-all duration-300 ${
            metrics.isFillerThresholdExceeded
              ? 'bg-rose-500 animate-hud-pulse shadow-lg shadow-rose-500/80 ring-4 ring-rose-500/30'
              : 'bg-slate-700/60 ring-1 ring-white/10'
          }`}
          title="Filler Density Alert Dot"
        />
      </div>

      {/* Vertical separator */}
      <div className="h-6 w-[1px] bg-slate-800" />

      {/* 2. Pace Bar (Color shifts when WPM leaves 120-160 band) */}
      <div className="flex flex-col gap-1 w-32">
        <div className="w-full bg-slate-800/80 h-3 rounded-full overflow-hidden p-0.5 border border-white/5">
          <div
            className={`h-full rounded-full transition-all duration-500 shadow-md ${getPaceColor()}`}
            style={{ width: `${pacePercentage}%` }}
          />
        </div>
      </div>
    </div>
  );
};
