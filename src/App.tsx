import React, { useState, useEffect, useRef } from 'react';
import { ConnectionStatus, SessionMode, TeardownReport, Story } from './types';
import { LiveStreamService } from './services/liveStreamService';
import { MetricsEngine, MetricSnapshot } from './utils/metricsEngine';
import { detectFlatStretches, FlatStretchWindow, TranscriptEntry } from './utils/retentionEngine';
import { RehearsalEngine, InterruptionEvent } from './services/rehearsalService';
import { LiveModeHUD } from './components/LiveModeHUD';
import { TeardownView } from './components/TeardownView';
import { StoryBank } from './components/StoryBank';
import { BitBank } from './components/BitBank';
import { WaveformVisualizer } from './components/WaveformVisualizer';
import { getAllStories, saveTeardown, getAllTeardowns } from './services/db';

import {
  Mic,
  Video,
  Play,
  Square,
  RefreshCw,
  BookOpen,
  Smile,
  Activity,
  Award,
  Radio,
  Sparkles,
  Volume2,
  AlertOctagon,
  Flame,
  Zap,
  Gauge,
  Tag,
  Clock,
  ShieldCheck,
} from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'storybank' | 'bitbank' | 'teardown'>('dashboard');
  const [sessionMode, setSessionMode] = useState<SessionMode>('rehearsal');

  // Session timer state
  const [isSessionActive, setIsSessionActive] = useState<boolean>(false);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [statusMessage, setStatusMessage] = useState<string>('Ready');
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [chunkIndex, setChunkIndex] = useState<number>(1);
  const [audioLevel, setAudioLevel] = useState<number>(0);

  // Metrics & transcript logs
  const [metrics, setMetrics] = useState<MetricSnapshot>({
    wpm15s: 0,
    fillerCount30s: 0,
    fillerDensity30s: 0,
    isWpmOutOfRange: false,
    isFillerThresholdExceeded: false,
    detectedFillers: [],
  });

  const [transcripts, setTranscripts] = useState<{ speaker: 'user' | 'coach'; text: string; timestampSec: number }[]>([]);
  const [interruptions, setInterruptions] = useState<InterruptionEvent[]>([]);
  const [activeTeardown, setActiveTeardown] = useState<TeardownReport | null>(null);
  const [activeFlatStretches, setActiveFlatStretches] = useState<FlatStretchWindow[]>([]);
  const [isGeneratingTeardown, setIsGeneratingTeardown] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const liveStreamRef = useRef<LiveStreamService | null>(null);
  const metricsEngineRef = useRef<MetricsEngine>(new MetricsEngine());
  const rehearsalEngineRef = useRef<RehearsalEngine | null>(null);

  const timerRef = useRef<number | null>(null);
  const metricTimerRef = useRef<number | null>(null);

  // Load past teardowns on mount
  useEffect(() => {
    getAllTeardowns().catch(console.error);
  }, []);

  // Timer loop when session is active
  useEffect(() => {
    if (isSessionActive) {
      timerRef.current = window.setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);

      metricTimerRef.current = window.setInterval(() => {
        if (metricsEngineRef.current) {
          const snap = metricsEngineRef.current.getSnapshot();
          setMetrics(snap);
        }
        if (liveStreamRef.current) {
          setAudioLevel(liveStreamRef.current.getAudioLevel());
        }
      }, 100);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      if (metricTimerRef.current) clearInterval(metricTimerRef.current);
      timerRef.current = null;
      metricTimerRef.current = null;
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (metricTimerRef.current) clearInterval(metricTimerRef.current);
    };
  }, [isSessionActive]);

  const handleStartSession = async (mode: SessionMode) => {
    setSessionMode(mode);
    setTranscripts([]);
    setInterruptions([]);
    setActiveTeardown(null);
    setElapsedSeconds(0);
    setIsSessionActive(true);
    metricsEngineRef.current.reset();

    if (mode === 'rehearsal') {
      rehearsalEngineRef.current = new RehearsalEngine((evt) => {
        setInterruptions((prev) => [...prev, evt]);
      });
    }

    const service = new LiveStreamService({
      onStatusChange: (newStatus, msg) => {
        setStatus(newStatus);
        if (msg) setStatusMessage(msg);
      },
      onTranscript: (speaker, text) => {
        const nowSec = elapsedSeconds;
        setTranscripts((prev) => [...prev, { speaker, text, timestampSec: nowSec }]);

        if (speaker === 'user') {
          metricsEngineRef.current.addText(text, nowSec);
          const currentSnap = metricsEngineRef.current.getSnapshot(nowSec);
          setMetrics(currentSnap);

          if (sessionMode === 'rehearsal' && rehearsalEngineRef.current) {
            rehearsalEngineRef.current.checkMetricsAndText(currentSnap, text, nowSec);
          }
        }
      },
      onChunkEvent: (idx, action) => {
        setChunkIndex(idx);
      },
      onLog: () => {},
    });

    liveStreamRef.current = service;
    await service.startSession(mode, videoRef.current || undefined);
  };

  const handleStopSession = async () => {
    setIsSessionActive(false);
    if (liveStreamRef.current) {
      liveStreamRef.current.endSession();
      liveStreamRef.current = null;
    }

    setStatus('disconnected');
    setStatusMessage('Session completed');
    setIsGeneratingTeardown(true);

    try {
      const transcriptEntries: TranscriptEntry[] = transcripts.map((t) => ({
        text: t.text,
        timestampSec: t.timestampSec,
      }));

      const flatStretches = detectFlatStretches(transcriptEntries, elapsedSeconds || 30);
      setActiveFlatStretches(flatStretches);

      const stories: Story[] = await getAllStories();

      const response = await fetch('/api/teardown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'sess_' + Date.now(),
          durationSec: elapsedSeconds || 30,
          mode: sessionMode,
          transcript: transcripts,
          metrics,
          flatStretches,
          stories,
        }),
      });

      if (!response.ok) {
        throw new Error(`Teardown server returned ${response.status}`);
      }

      const teardownReport: TeardownReport = await response.json();
      await saveTeardown(teardownReport);
      setActiveTeardown(teardownReport);
      setActiveTab('teardown');
    } catch (err: unknown) {
      console.error('Teardown note:', err);
    } finally {
      setIsGeneratingTeardown(false);
    }
  };

  const formatTime = (totalSec: number) => {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-[#070A12] text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-black">
      {/* Top Navbar */}
      <nav className="bg-slate-950/80 border-b border-slate-800/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 flex items-center justify-center font-black text-white text-xl shadow-lg shadow-cyan-500/20 ring-1 ring-white/20">
              S
            </div>
            <div>
              <span className="font-extrabold text-white text-lg tracking-tight flex items-center gap-2">
                Storyteller
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                  Live AI Coach
                </span>
              </span>
            </div>
          </div>

          {/* Nav Tabs */}
          <div className="flex items-center gap-1.5 bg-slate-900/90 p-1.5 rounded-2xl border border-slate-800 text-xs shadow-inner">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all ${
                activeTab === 'dashboard'
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-900/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Activity className="w-4 h-4" />
              Live Studio
            </button>

            <button
              onClick={() => setActiveTab('storybank')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all ${
                activeTab === 'storybank'
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-900/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              Story Bank
            </button>

            <button
              onClick={() => setActiveTab('bitbank')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all ${
                activeTab === 'bitbank'
                  ? 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-lg shadow-purple-900/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Smile className="w-4 h-4" />
              Bit Bank
            </button>

            {activeTeardown && (
              <button
                onClick={() => setActiveTab('teardown')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all ${
                  activeTab === 'teardown'
                    ? 'bg-gradient-to-r from-rose-500 to-orange-600 text-white shadow-lg shadow-rose-900/40'
                    : 'text-rose-400 hover:text-rose-300'
                }`}
              >
                <Award className="w-4 h-4" />
                Latest Teardown
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1">
        {activeTab === 'dashboard' && (
          <div className="max-w-7xl mx-auto p-6 space-y-6">
            {/* Header Control Panel */}
            <div className="bg-slate-900/80 backdrop-blur-xl p-6 rounded-3xl border border-slate-800 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6">
              {/* Mode Selection */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Mode Selection</span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSessionMode('rehearsal')}
                    disabled={isSessionActive}
                    className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-bold border transition-all ${
                      sessionMode === 'rehearsal'
                        ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-300 shadow-lg shadow-cyan-950/50 ring-2 ring-cyan-500/30'
                        : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Volume2 className="w-4 h-4 text-cyan-400" />
                    Rehearsal Mode (Live Interruption)
                  </button>

                  <button
                    onClick={() => setSessionMode('live')}
                    disabled={isSessionActive}
                    className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-xs font-bold border transition-all ${
                      sessionMode === 'live'
                        ? 'bg-amber-500/20 border-amber-500/60 text-amber-300 shadow-lg shadow-amber-950/50 ring-2 ring-amber-500/30'
                        : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Radio className="w-4 h-4 text-amber-400" />
                    Live Mode (Silent Ambient HUD)
                  </button>
                </div>
              </div>

              {/* Timer & Controls */}
              <div className="flex items-center gap-6">
                <div className="text-right space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Elapsed Session Time</span>
                  <div className="text-3xl font-mono font-black tracking-tight text-white flex items-center gap-2 justify-end">
                    <Clock className={`w-5 h-5 ${isSessionActive ? 'text-emerald-400 animate-pulse' : 'text-slate-600'}`} />
                    {formatTime(elapsedSeconds)}
                  </div>
                </div>

                {!isSessionActive ? (
                  <button
                    onClick={() => handleStartSession(sessionMode)}
                    className="flex items-center gap-2 bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white font-extrabold py-3.5 px-8 rounded-2xl text-sm shadow-xl shadow-cyan-900/40 transition-all hover:scale-105 active:scale-95"
                  >
                    <Play className="w-5 h-5 fill-current" />
                    Start Session
                  </button>
                ) : (
                  <button
                    onClick={handleStopSession}
                    disabled={isGeneratingTeardown}
                    className="flex items-center gap-2 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-extrabold py-3.5 px-8 rounded-2xl text-sm shadow-xl shadow-rose-950/60 transition-all hover:scale-105 active:scale-95"
                  >
                    {isGeneratingTeardown ? (
                      <RefreshCw className="w-5 h-5 animate-spin" />
                    ) : (
                      <Square className="w-5 h-5 fill-current" />
                    )}
                    {isGeneratingTeardown ? 'Generating Teardown...' : 'End & View Teardown'}
                  </button>
                )}
              </div>
            </div>

            {/* Main Interactive Studio Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Video Feed & Waveform & Rehearsal Tracker */}
              <div className="lg:col-span-6 space-y-6">
                <div className="bg-slate-900/90 rounded-3xl border border-slate-800 overflow-hidden relative aspect-video shadow-2xl group">
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    className="w-full h-full object-cover bg-slate-950"
                  />

                  {/* Top Overlay Badges */}
                  <div className="absolute top-4 left-4 flex items-center gap-2.5">
                    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/70 backdrop-blur-md text-xs font-semibold text-slate-200 border border-white/10">
                      <Video className="w-4 h-4 text-cyan-400" />
                      1 FPS Frame Stream
                    </span>
                    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/70 backdrop-blur-md text-xs font-semibold text-slate-200 border border-white/10">
                      <Mic className="w-4 h-4 text-emerald-400" />
                      16kHz PCM
                    </span>
                  </div>

                  {/* Audio Waveform Equalizer */}
                  <div className="absolute bottom-4 left-4">
                    <WaveformVisualizer level={audioLevel} isActive={isSessionActive} />
                  </div>

                  {/* Active Status Badge */}
                  {isSessionActive && (
                    <div className="absolute bottom-4 right-4 px-3.5 py-1.5 rounded-xl bg-emerald-500/20 backdrop-blur-md border border-emerald-500/40 text-emerald-400 text-xs font-bold flex items-center gap-2 shadow-lg">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                      Session Live
                    </div>
                  )}
                </div>

                {/* Rehearsal Mode Interruption Tracker */}
                {sessionMode === 'rehearsal' && (
                  <div className="bg-slate-900/80 p-5 rounded-3xl border border-slate-800 space-y-3 shadow-xl">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                        <AlertOctagon className="w-4 h-4 text-rose-400" />
                        Rehearsal Interruption Log
                      </h3>
                      <span className="text-xs font-extrabold text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded-full border border-rose-500/30">
                        {interruptions.length} Interruptions
                      </span>
                    </div>

                    <div className="space-y-2 max-h-48 overflow-y-auto pr-2 text-xs">
                      {interruptions.length === 0 ? (
                        <p className="text-slate-500 italic py-4 text-center">
                          No interruptions triggered yet. Speak in Rehearsal Mode to start reps.
                        </p>
                      ) : (
                        interruptions.map((item, idx) => (
                          <div
                            key={idx}
                            className={`p-3 rounded-xl border transition-all ${
                              item.isHostileAudienceTurn
                                ? 'bg-purple-950/40 border-purple-700/50 text-purple-200'
                                : 'bg-rose-950/40 border-rose-800/40 text-rose-200'
                            }`}
                          >
                            <span className="font-bold mr-2 text-[10px] uppercase tracking-wider">
                              #{item.count} [{item.isHostileAudienceTurn ? 'HOSTILE AUDIENCE' : 'COACH INTERRUPT'}]:
                            </span>
                            {item.reason}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Real-Time Delivery Metrics & Live Transcript Stream */}
              <div className="lg:col-span-6 space-y-6">
                {/* Delivery Gauges */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-900/80 p-5 rounded-3xl border border-slate-800 space-y-2 shadow-xl">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Rolling Pace (15s)</span>
                      <Gauge className="w-4 h-4 text-cyan-400" />
                    </div>
                    <div className="text-3xl font-black text-white">{metrics.wpm15s} <span className="text-xs text-slate-500 font-normal">WPM</span></div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" /> Target Band: 120 - 160 WPM
                    </div>
                  </div>

                  <div className="bg-slate-900/80 p-5 rounded-3xl border border-slate-800 space-y-2 shadow-xl">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Filler Words (30s)</span>
                      <Zap className="w-4 h-4 text-rose-400" />
                    </div>
                    <div className="text-3xl font-black text-rose-400">{metrics.fillerCount30s} <span className="text-xs text-slate-500 font-normal">Fillers</span></div>
                    <div className="text-[11px] text-slate-400">um, uh, like, you know, etc.</div>
                  </div>
                </div>

                {/* Real-time Transcript Feed */}
                <div className="bg-slate-900/80 p-5 rounded-3xl border border-slate-800 h-[380px] flex flex-col shadow-xl">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      Live Transcript Stream
                    </span>
                    <span className="text-xs text-slate-500 font-mono">{transcripts.length} turns recorded</span>
                  </div>

                  <div className="flex-1 overflow-y-auto mt-4 space-y-3 pr-2 text-xs">
                    {transcripts.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-slate-500 italic">
                        Start session and speak to see live transcript turns stream in real time...
                      </div>
                    ) : (
                      transcripts.map((t, idx) => (
                        <div
                          key={idx}
                          className={`p-3.5 rounded-2xl border ${
                            t.speaker === 'coach'
                              ? 'bg-cyan-950/40 border-cyan-800/40 text-cyan-200'
                              : 'bg-slate-800/60 border-slate-700/60 text-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[10px] opacity-70 mb-1">
                            <span className="font-bold uppercase tracking-wider">{t.speaker}:</span>
                            <span className="font-mono">{formatTime(t.timestampSec)}</span>
                          </div>
                          <p className="leading-relaxed">{t.text}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Story Bank */}
        {activeTab === 'storybank' && (
          <StoryBank
            onStartInterviewerSession={() => {
              setActiveTab('dashboard');
              handleStartSession('interview');
            }}
          />
        )}

        {/* TAB 3: Bit Bank */}
        {activeTab === 'bitbank' && <BitBank />}

        {/* TAB 4: Teardown View */}
        {activeTab === 'teardown' && activeTeardown && (
          <TeardownView
            report={activeTeardown}
            flatStretches={activeFlatStretches}
            durationSec={elapsedSeconds || activeTeardown.durationSec}
            onBackToDashboard={() => setActiveTab('dashboard')}
          />
        )}
      </main>

      {/* Render Ambient HUD during Live Mode */}
      {isSessionActive && sessionMode === 'live' && <LiveModeHUD metrics={metrics} />}
    </div>
  );
};

export default App;
