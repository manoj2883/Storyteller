import React from 'react';

interface WaveformVisualizerProps {
  level: number; // 0 to 100
  isActive: boolean;
}

export const WaveformVisualizer: React.FC<WaveformVisualizerProps> = ({ level, isActive }) => {
  const bars = [0.4, 0.7, 1.0, 0.6, 0.85, 0.5, 0.9, 0.35, 0.75, 0.55];

  return (
    <div className="flex items-center gap-1 h-6 px-2 py-1 bg-black/40 backdrop-blur-md rounded-lg border border-white/10">
      {bars.map((multiplier, idx) => {
        const heightPct = isActive
          ? Math.max(15, Math.min(100, level * multiplier * 1.4))
          : 15;

        return (
          <div
            key={idx}
            className={`w-1 rounded-full transition-all duration-100 ${
              isActive ? 'bg-cyan-400 shadow-sm shadow-cyan-400/80' : 'bg-slate-700'
            }`}
            style={{ height: `${heightPct}%` }}
          />
        );
      })}
    </div>
  );
};
