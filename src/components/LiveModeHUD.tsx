import React from 'react';
import { MetricSnapshot } from '../utils/metricsEngine';
import { Zap, AlertTriangle, ShieldCheck } from 'lucide-react';

interface LiveModeHUDProps {
  metrics: MetricSnapshot;
}

export const LiveModeHUD: React.FC<LiveModeHUDProps> = ({ metrics }) => {
  const getPaceStatus = () => {
    if (metrics.wpm15s === 0) return { label: 'Listening...', color: 'text-slate-400', barColor: 'bg-slate-700' };
    if (metrics.wpm15s >= 120 && metrics.wpm15s <= 160) {
      return { label: `Target Pace (${metrics.wpm15s} WPM)`, color: 'text-emerald-400', barColor: 'bg-emerald-400 shadow-emerald-500/80 ring-2 ring-emerald-500/30' };
    }
    if (metrics.wpm15s > 180) {
      return { label: `Rushing Pace (${metrics.wpm15s} WPM)`, color: 'text-rose-400 animate-pulse', barColor: 'bg-rose-500 shadow-rose-500/80 ring-2 ring-rose-500/30' };
    }
    if (metrics.wpm15s > 160) {
      return { label: `Fast (${metrics.wpm15s} WPM)`, color: 'text-amber-400', barColor: 'bg-amber-500 shadow-amber-500/80 ring-2 ring-amber-500/30' };
    }
    return { label: `Slow Pace (${metrics.wpm15s} WPM)`, color: 'text-amber-400', barColor: 'bg-amber-500 shadow-amber-500/80 ring-2 ring-amber-500/30' };
  };

  const paceInfo = getPaceStatus();
  const pacePercentage = Math.min(100, Math.max(8, (metrics.wpm15s / 220) * 100));

  return (
    <div className="fixed bottom-6 right-6 z-50 pointer-events-none select-none flex items-center gap-4 bg-slate-950/85 backdrop-blur-xl p-3.5 rounded-2xl border border-cyan-500/30 shadow-2xl shadow-cyan-950/50">
      {/* 1. Filler Alert Dot (Pulses red when threshold crossed) */}
      <div className="flex items-center gap-2.5 px-1">
        <div
          className={`w-4 h-4 rounded-full transition-all duration-300 ${
            metrics.isFillerThresholdExceeded
              ? 'bg-rose-500 animate-hud-pulse shadow-lg shadow-rose-500/90 ring-4 ring-rose-500/40'
              : 'bg-emerald-500/60 ring-1 ring-emerald-500/40'
          }`}
          title="Filler Density Dot"
        />
        {metrics.isFillerThresholdExceeded && (
          <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider animate-pulse flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Filler Warning
          </span>
        )}
      </div>

      <div className="h-6 w-[1px] bg-slate-800" />

      {/* 2. Pace Bar & Speed Display */}
      <div className="flex flex-col gap-1 w-36">
        <div className="flex items-center justify-between text-[10px] font-bold">
          <span className={`${paceInfo.color} flex items-center gap-1`}>
            <Zap className="w-3 h-3" />
            {paceInfo.label}
          </span>
        </div>

        <div className="w-full bg-slate-900 h-3 rounded-full overflow-hidden p-0.5 border border-white/10">
          <div
            className={`h-full rounded-full transition-all duration-300 shadow-md ${paceInfo.barColor}`}
            style={{ width: `${pacePercentage}%` }}
          />
        </div>
      </div>
    </div>
  );
};
