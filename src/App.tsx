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
} from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'storybank' | 'bitbank' | 'teardown'>('dashboard');
  const [sessionMode, setSessionMode] = useState<SessionMode>('rehearsal');

  // Session state
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [statusMessage, setStatusMessage] = useState<string>('Ready');
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [chunkIndex, setChunkIndex] = useState<number>(1);
  const [logs, setLogs] = useState<string[]>([]);

  // Realtime metric snapshots & transcripts
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
  const [pastTeardowns, setPastTeardowns] = useState<TeardownReport[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const liveStreamRef = useRef<LiveStreamService | null>(null);
  const metricsEngineRef = useRef<MetricsEngine>(new MetricsEngine());
  const rehearsalEngineRef = useRef<RehearsalEngine | null>(null);

  const timerRef = useRef<number | null>(null);
  const metricTimerRef = useRef<number | null>(null);

  // Load past teardowns on mount
  useEffect(() => {
    getAllTeardowns().then(setPastTeardowns).catch(console.error);
  }, []);

  // Session timer
  useEffect(() => {
    if (status === 'connected' || status === 'chunking') {
      timerRef.current = window.setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);

      // Periodically update metrics snapshot
      metricTimerRef.current = window.setInterval(() => {
        if (metricsEngineRef.current) {
          const snap = metricsEngineRef.current.getSnapshot();
          setMetrics(snap);
        }
      }, 1000);
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
  }, [status]);

  const addLog = (msg: string) => {
    const timeStr = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${timeStr}] ${msg}`]);
  };

  const handleStartSession = async (mode: SessionMode) => {
    setSessionMode(mode);
    setTranscripts([]);
    setInterruptions([]);
    setActiveTeardown(null);
    metricsEngineRef.current.reset();

    // Rehearsal Engine setup
    if (mode === 'rehearsal') {
      rehearsalEngineRef.current = new RehearsalEngine((evt) => {
        setInterruptions((prev) => [...prev, evt]);
        addLog(`[REHEARSAL INTERRUPTION #${evt.count}] ${evt.reason}${evt.isHostileAudienceTurn ? ' (Hostile Audience Switch!)' : ''}`);
      });
    }

    addLog(`Starting ${mode.toUpperCase()} session...`);

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
        addLog(`Session Chunk #${idx} state: ${action}`);
      },
      onLog: (logText) => {
        addLog(logText);
      },
    });

    liveStreamRef.current = service;
    await service.startSession(mode, videoRef.current || undefined);
  };

  const handleStopSession = async () => {
    if (liveStreamRef.current) {
      liveStreamRef.current.endSession();
      liveStreamRef.current = null;
    }

    setStatus('disconnected');
    setStatusMessage('Session completed');
    addLog('Session stopped. Running Retention Engine & Post-Session Teardown...');

    setIsGeneratingTeardown(true);

    try {
      // 1. Run Pure Heuristic Retention Engine flat-stretch detection
      const transcriptEntries: TranscriptEntry[] = transcripts.map((t) => ({
        text: t.text,
        timestampSec: t.timestampSec,
      }));

      const flatStretches = detectFlatStretches(transcriptEntries, elapsedSeconds);
      setActiveFlatStretches(flatStretches);

      // 2. Fetch Story Bank entries to provide context to Teardown
      const stories: Story[] = await getAllStories();

      // 3. Call backend /api/teardown endpoint
      const response = await fetch('/api/teardown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'sess_' + Date.now(),
          durationSec: elapsedSeconds,
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
      setPastTeardowns((prev) => [teardownReport, ...prev]);

      setActiveTab('teardown');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog(`[Teardown Error] ${msg}`);
      alert(`Teardown generation note: ${msg}`);
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
    <div className="min-h-screen bg-dark-900 text-slate-100 flex flex-col font-sans">
      {/* Top Navbar */}
      <nav className="bg-dark-800/90 border-b border-slate-800 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-cyan-900/40">
              S
            </div>
            <div>
              <span className="font-extrabold text-white text-lg tracking-tight">Storyteller</span>
              <span className="text-[10px] text-cyan-400 font-semibold block leading-none">Live Communication Coach</span>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 bg-dark-900/80 p-1.5 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-medium transition-all ${
                activeTab === 'dashboard'
                  ? 'bg-cyan-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              Live & Rehearsal Studio
            </button>

            <button
              onClick={() => setActiveTab('storybank')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-medium transition-all ${
                activeTab === 'storybank'
                  ? 'bg-cyan-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              Story Bank
            </button>

            <button
              onClick={() => setActiveTab('bitbank')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-medium transition-all ${
                activeTab === 'bitbank'
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Smile className="w-3.5 h-3.5" />
              Bit Bank
            </button>

            {activeTeardown && (
              <button
                onClick={() => setActiveTab('teardown')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg font-medium transition-all ${
                  activeTab === 'teardown'
                    ? 'bg-rose-600 text-white shadow-md'
                    : 'text-rose-400 hover:text-rose-300'
                }`}
              >
                <Award className="w-3.5 h-3.5" />
                Latest Teardown
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Main Container */}
      <main className="flex-1">
        {/* TAB 1: Live & Rehearsal Studio */}
        {activeTab === 'dashboard' && (
          <div className="max-w-7xl mx-auto p-6 space-y-6">
            {/* Top Control Bar */}
            <div className="bg-dark-800 p-5 rounded-2xl border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Select Mode:</span>
                <button
                  onClick={() => setSessionMode('live')}
                  disabled={status !== 'disconnected'}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-all ${
                    sessionMode === 'live'
                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 shadow-md'
                      : 'bg-dark-700 border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Live Mode (Silent Ambient HUD)
                </button>
                <button
                  onClick={() => setSessionMode('rehearsal')}
                  disabled={status !== 'disconnected'}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-all ${
                    sessionMode === 'rehearsal'
                      ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300 shadow-md'
                      : 'bg-dark-700 border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Rehearsal Mode (Active Interruptions)
                </button>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Duration</div>
                  <div className="text-xl font-mono font-extrabold text-white">{formatTime(elapsedSeconds)}</div>
                </div>

                {status === 'disconnected' ? (
                  <button
                    onClick={() => handleStartSession(sessionMode)}
                    className="flex items-center gap-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold py-2.5 px-6 rounded-xl text-xs shadow-lg shadow-cyan-900/30 transition-all"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    Start {sessionMode.toUpperCase()}
                  </button>
                ) : (
                  <button
                    onClick={handleStopSession}
                    disabled={isGeneratingTeardown}
                    className="flex items-center gap-2 bg-rose-600 hover:bg-rose-500 text-white font-bold py-2.5 px-6 rounded-xl text-xs shadow-lg shadow-rose-900/30 transition-all"
                  >
                    {isGeneratingTeardown ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Square className="w-4 h-4 fill-current" />
                    )}
                    {isGeneratingTeardown ? 'Analyzing...' : 'End & Generate Teardown'}
                  </button>
                )}
              </div>
            </div>

            {/* Video Preview & Studio Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Camera & Rehearsal Interruption Tracker */}
              <div className="lg:col-span-6 space-y-4">
                <div className="bg-dark-800 rounded-2xl border border-slate-800 overflow-hidden relative group aspect-video">
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    className="w-full h-full object-cover bg-slate-950"
                  />

                  {/* Overlays */}
                  <div className="absolute top-3 left-3 flex items-center gap-2">
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-md text-[11px] font-medium text-slate-200 border border-white/10">
                      <Video className="w-3.5 h-3.5 text-cyan-400" />
                      1 FPS Video
                    </span>
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-md text-[11px] font-medium text-slate-200 border border-white/10">
                      <Mic className="w-3.5 h-3.5 text-emerald-400" />
                      16kHz PCM
                    </span>
                  </div>

                  {status === 'connected' && sessionMode === 'live' && (
                    <div className="absolute top-3 right-3 px-3 py-1 rounded-full bg-amber-500/20 backdrop-blur-md border border-amber-500/40 text-amber-400 text-xs font-semibold flex items-center gap-1.5">
                      <Radio className="w-3.5 h-3.5 animate-pulse" />
                      Silent Ambient Mode (No Voice Output)
                    </div>
                  )}

                  {status === 'connected' && sessionMode === 'rehearsal' && (
                    <div className="absolute top-3 right-3 px-3 py-1 rounded-full bg-cyan-500/20 backdrop-blur-md border border-cyan-500/40 text-cyan-400 text-xs font-semibold flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5 animate-pulse" />
                      Rehearsal Coach Active
                    </div>
                  )}
                </div>

                {/* Rehearsal Interruptions Box */}
                {sessionMode === 'rehearsal' && (
                  <div className="bg-dark-800 p-4 rounded-2xl border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-700/60 pb-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                        <AlertOctagon className="w-4 h-4 text-rose-400" />
                        Rehearsal Interruption Tracker
                      </h3>
                      <span className="text-xs font-bold text-rose-400">{interruptions.length} Interruptions</span>
                    </div>

                    <div className="space-y-2 max-h-40 overflow-y-auto pr-2 text-xs">
                      {interruptions.length === 0 ? (
                        <p className="text-slate-500 italic py-2">No interruptions triggered yet. Speak in rehearsal mode.</p>
                      ) : (
                        interruptions.map((item, idx) => (
                          <div
                            key={idx}
                            className={`p-2.5 rounded-lg border ${
                              item.isHostileAudienceTurn
                                ? 'bg-purple-950/40 border-purple-700/50 text-purple-200'
                                : 'bg-rose-950/40 border-rose-800/40 text-rose-200'
                            }`}
                          >
                            <span className="font-bold mr-2 text-[10px] uppercase">
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

              {/* Right Column: Live Transcript Stream & Realtime Metrics */}
              <div className="lg:col-span-6 space-y-4">
                {/* Metrics Live Card */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-dark-800 p-4 rounded-xl border border-slate-800 space-y-1">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Rolling Pace (15s Window)</span>
                    <div className="text-2xl font-black text-white">{metrics.wpm15s} <span className="text-xs text-slate-500 font-normal">WPM</span></div>
                    <div className="text-[11px] text-slate-400">Target Band: 120 - 160 WPM</div>
                  </div>

                  <div className="bg-dark-800 p-4 rounded-xl border border-slate-800 space-y-1">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Filler Density (30s Window)</span>
                    <div className="text-2xl font-black text-rose-400">{metrics.fillerCount30s} <span className="text-xs text-slate-500 font-normal">Fillers</span></div>
                    <div className="text-[11px] text-slate-400">List: um, uh, like, you know, etc.</div>
                  </div>
                </div>

                {/* Transcript Stream */}
                <div className="bg-dark-800 p-4 rounded-2xl border border-slate-800 h-96 flex flex-col">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-700/60">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Realtime Transcript Stream</span>
                    <span className="text-xs text-slate-500">{transcripts.length} turns</span>
                  </div>

                  <div className="flex-1 overflow-y-auto mt-3 space-y-3 pr-2 text-xs">
                    {transcripts.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-slate-500 italic">
                        Start session and speak to capture live transcript turns...
                      </div>
                    ) : (
                      transcripts.map((t, idx) => (
                        <div
                          key={idx}
                          className={`p-3 rounded-xl border ${
                            t.speaker === 'coach'
                              ? 'bg-cyan-950/40 border-cyan-800/40 text-cyan-200'
                              : 'bg-dark-700 border-slate-700 text-slate-200'
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
      {status === 'connected' && sessionMode === 'live' && <LiveModeHUD metrics={metrics} />}
    </div>
  );
};

export default App;
