import React from 'react';
import { TeardownReport, EvidencedScore } from '../types';
import { FlatStretchWindow } from '../utils/retentionEngine';
import { Target, Award, AlertTriangle, MessageSquare, Flame, CheckCircle, Clock } from 'lucide-react';

interface TeardownViewProps {
  report: TeardownReport;
  flatStretches: FlatStretchWindow[];
  durationSec: number;
  onBackToDashboard: () => void;
}

export const TeardownView: React.FC<TeardownViewProps> = ({
  report,
  flatStretches,
  durationSec,
  onBackToDashboard,
}) => {
  const formatSecToMin = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const renderScoreCard = (
    title: string,
    weight: string,
    scoreData?: EvidencedScore,
    colorClass: string = 'text-cyan-400'
  ) => {
    if (!scoreData) return null;
    return (
      <div className="bg-dark-800 p-4 rounded-xl border border-slate-800 space-y-2 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{title}</span>
            <span className="text-[10px] text-slate-500 font-mono">Weight {weight}</span>
          </div>
          <div className={`text-3xl font-black ${colorClass} mt-1`}>{scoreData.score} <span className="text-xs text-slate-500 font-normal">/ 100</span></div>
        </div>

        <div className="bg-dark-900 p-2.5 rounded-lg border border-slate-700/60 text-xs space-y-1">
          <div className="flex items-center gap-1.5 text-amber-400 font-mono text-[11px]">
            <Clock className="w-3 h-3" />
            Evidenced Quote [{scoreData.timestamp}]
          </div>
          <p className="text-slate-300 italic">"{scoreData.evidenceQuote}"</p>
          <p className="text-slate-400 text-[11px] pt-1">{scoreData.explanation}</p>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      {/* Top Header & Composite Score */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold text-white tracking-tight">Post-Session Teardown</h1>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-500/20 text-rose-400 border border-rose-500/40">
              Blunt Feedback Mode
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Session Duration: {formatSecToMin(durationSec)} | Mode: {report.mode.toUpperCase()}
          </p>
        </div>

        <div className="flex items-center gap-4 bg-dark-800 p-4 rounded-xl border border-slate-800">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Composite Score</div>
            <div className="text-4xl font-black text-cyan-400 mt-0.5">{report.compositeScore} <span className="text-sm text-slate-500">/ 100</span></div>
          </div>
          <button
            onClick={onBackToDashboard}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white font-medium text-xs rounded-lg transition-all"
          >
            Back to Dashboard
          </button>
        </div>
      </div>

      {/* 1. Retention Engine Timeline (Flat-Stretch Red Bands) */}
      <div className="bg-dark-800 p-5 rounded-xl border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            Retention Engine Timeline — Flat-Stretch Drop-Off Windows (90s+)
          </h2>
          <span className="text-xs text-rose-400 font-semibold">{flatStretches.length} Drop-off bands detected</span>
        </div>

        <div className="relative w-full h-8 bg-slate-900 rounded-lg overflow-hidden border border-slate-800 flex items-center">
          {/* Main timeline bar */}
          <div className="absolute inset-0 bg-emerald-950/40" />

          {/* Render red bands for flat stretches */}
          {flatStretches.map((w, i) => {
            const leftPct = (w.startSec / Math.max(1, durationSec)) * 100;
            const widthPct = ((w.endSec - w.startSec) / Math.max(1, durationSec)) * 100;
            return (
              <div
                key={i}
                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                className="absolute top-0 bottom-0 bg-rose-600/80 border-x border-rose-400 group cursor-pointer"
                title={`Drop-off window (${formatSecToMin(w.startSec)} - ${formatSecToMin(w.endSec)}): ${w.reason}`}
              />
            );
          })}
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
          <span>0:00</span>
          <span>{formatSecToMin(durationSec)}</span>
        </div>
      </div>

      {/* 2. THE ONE THING (Highest leverage fix) */}
      <div className="bg-rose-950/30 p-5 rounded-xl border border-rose-800/50 space-y-2">
        <div className="flex items-center gap-2 text-rose-400 font-bold uppercase tracking-wider text-xs">
          <Target className="w-4 h-4" />
          The One Thing — Highest-Leverage Fix
        </div>
        <p className="text-slate-100 text-sm font-medium leading-relaxed">{report.theOneThing}</p>
      </div>

      {/* 3. Evidenced Scores Grid */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
          <Award className="w-4 h-4 text-cyan-400" />
          4-Dimension Evidenced Scores (Strict Anti-Inflation)
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {renderScoreCard('Story & Structure', '35%', report.scores?.storyStructure, 'text-cyan-400')}
          {renderScoreCard('Delivery', '30%', report.scores?.delivery, 'text-emerald-400')}
          {renderScoreCard('Register & Phrasing', '25%', report.scores?.registerPhrasing, 'text-amber-400')}
          {renderScoreCard('Wit & Lightness', '10%', report.scores?.witLightness, 'text-purple-400')}
        </div>
      </div>

      {/* 4. Structure Teardown */}
      {report.structureTeardown && report.structureTeardown.length > 0 && (
        <div className="bg-dark-800 p-5 rounded-xl border border-slate-800 space-y-4">
          <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-cyan-400" />
            Structure Teardown (Hook, Stakes, Obstacle, Turn, Payoff, Landing Line)
          </h2>

          <div className="space-y-3 text-xs">
            {report.structureTeardown.map((item, idx) => (
              <div key={idx} className="bg-dark-900 p-4 rounded-lg border border-slate-700/60 space-y-2">
                <div className="flex items-center justify-between font-semibold text-slate-200">
                  <span>Story: {item.storyName || 'Main Segment'}</span>
                  {item.missingBeats && item.missingBeats.length > 0 && (
                    <span className="text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/30">
                      Missing: {item.missingBeats.join(', ')}
                    </span>
                  )}
                </div>
                <p className="text-slate-300">{item.analysis}</p>
                {item.suggestedLandingLine && (
                  <div className="bg-slate-800 p-2.5 rounded border border-cyan-500/30 text-cyan-300 font-medium">
                    <span className="text-slate-400 text-[10px] uppercase font-bold block">Suggested Landing Line (&lt;12 words):</span>
                    "{item.suggestedLandingLine}"
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. Register & Phrasing Improvements */}
      {report.registerTeardown && report.registerTeardown.length > 0 && (
        <div className="bg-dark-800 p-5 rounded-xl border border-slate-800 space-y-4">
          <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <Flame className="w-4 h-4 text-amber-400" />
            Register & Phrasing (Native Speaker Alternatives)
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {report.registerTeardown.map((reg, idx) => (
              <div key={idx} className="bg-dark-900 p-4 rounded-lg border border-slate-700/60 space-y-2">
                <div className="text-rose-400 font-medium">
                  <span className="text-slate-500 uppercase text-[10px] font-bold block">What Mano Said:</span>
                  "{reg.originalText}"
                </div>

                <div className="space-y-1">
                  <span className="text-emerald-400 uppercase text-[10px] font-bold block">Native Alternatives:</span>
                  <div className="text-slate-200 font-semibold">• "{reg.nativeAlternative1}"</div>
                  <div className="text-slate-200 font-semibold">• "{reg.nativeAlternative2}"</div>
                </div>

                <p className="text-slate-400 text-[11px] pt-1 border-t border-slate-800">{reg.contextAndRegister}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. Tomorrow's Drill (Always Ends Here) */}
      <div className="bg-emerald-950/40 p-6 rounded-xl border border-emerald-500/40 space-y-3">
        <div className="flex items-center gap-2 text-emerald-400 font-bold uppercase tracking-wider text-xs">
          <CheckCircle className="w-5 h-5" />
          Tomorrow's Assigned Drill (10 Minutes, Specific & Repeatable)
        </div>
        <p className="text-slate-100 text-sm font-semibold leading-relaxed whitespace-pre-wrap">
          {report.tomorrowDrill}
        </p>
      </div>
    </div>
  );
};
