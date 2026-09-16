import React, { useState, useEffect } from 'react';
import { StoredSession, getAllSessions, deleteSession, getTeardownBySessionId } from '../services/db';
import { TeardownReport } from '../types';
import { Clock, Play, Trash2, Award, AlertOctagon, Video, Volume2, Calendar, FileText, ChevronRight, CheckCircle2 } from 'lucide-react';

interface SessionHistoryViewProps {
  onViewTeardown: (report: TeardownReport) => void;
}

export const SessionHistoryView: React.FC<SessionHistoryViewProps> = ({ onViewTeardown }) => {
  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<StoredSession | null>(null);
  const [teardownsMap, setTeardownsMap] = useState<Record<string, TeardownReport>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    setLoading(true);
    try {
      const list = await getAllSessions();
      setSessions(list);

      const map: Record<string, TeardownReport> = {};
      for (const s of list) {
        const td = await getTeardownBySessionId(s.id);
        if (td) {
          map[s.id] = td;
        }
      }
      setTeardownsMap(map);

      if (list.length > 0 && !selectedSession) {
        setSelectedSession(list[0]);
      }
    } catch (err) {
      console.error('[SessionHistory] Error loading sessions:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this session recording and log?')) {
      await deleteSession(id);
      if (selectedSession?.id === id) {
        setSelectedSession(null);
      }
      await loadSessions();
    }
  };

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s}s`;
  };

  const formatDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
              <Clock className="w-8 h-8 text-cyan-400" />
              Session & Interruption History
            </h1>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              {sessions.length} Saved Reps
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Reopen past speech reps to analyze video/audio recordings, transcript evidence, and interruption logs.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-500">Loading history...</div>
      ) : sessions.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-12 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto text-slate-500">
            <Video className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-white">No Saved Sessions Yet</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            Start a session in Live Studio. Your video/audio recordings, transcripts, and interruption logs will automatically be saved here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Sessions List */}
          <div className="lg:col-span-5 space-y-3 max-h-[750px] overflow-y-auto pr-1 custom-scrollbar">
            {sessions.map((session) => {
              const isSelected = selectedSession?.id === session.id;
              const teardown = teardownsMap[session.id];
              const interCount = session.interruptions?.length || 0;

              return (
                <div
                  key={session.id}
                  onClick={() => setSelectedSession(session)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                    isSelected
                      ? 'bg-gradient-to-r from-cyan-950/80 to-blue-950/80 border-cyan-500/80 shadow-lg shadow-cyan-950/50'
                      : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                            session.mode === 'rehearsal'
                              ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                              : 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
                          }`}
                        >
                          {session.mode}
                        </span>
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-500" />
                          {formatDate(session.createdAt)}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-white mt-1.5 flex items-center gap-2">
                        Duration: {formatDuration(session.durationSec)}
                      </h3>
                    </div>

                    <button
                      onClick={(e) => handleDeleteSession(session.id, e)}
                      title="Delete Session"
                      className="text-slate-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-slate-800 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-800/60 text-slate-400">
                    <span className="flex items-center gap-1 text-rose-400 font-semibold">
                      <AlertOctagon className="w-3.5 h-3.5" />
                      {interCount} Interruption{interCount === 1 ? '' : 's'}
                    </span>

                    {teardown && (
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30 flex items-center gap-1">
                        <Award className="w-3 h-3" />
                        Score: {teardown.compositeScore}
                      </span>
                    )}

                    <ChevronRight className="w-4 h-4 text-slate-600" />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Detailed Selected Session Panel */}
          {selectedSession && (
            <div className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-3xl p-6 space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                <div>
                  <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Session Detail Log</span>
                  <h2 className="text-xl font-black text-white flex items-center gap-2">
                    {formatDate(selectedSession.createdAt)}
                  </h2>
                </div>

                {teardownsMap[selectedSession.id] && (
                  <button
                    onClick={() => onViewTeardown(teardownsMap[selectedSession.id])}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-950/40 transition-all"
                  >
                    <Award className="w-4 h-4" />
                    View Teardown Report
                  </button>
                )}
              </div>

              {/* Video / Audio Recording Player */}
              {selectedSession.mediaBlobUrl ? (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <Video className="w-4 h-4 text-cyan-400" />
                    Session Media Recording
                  </h4>
                  <div className="rounded-2xl overflow-hidden bg-black border border-slate-800 shadow-2xl">
                    <video
                      controls
                      src={selectedSession.mediaBlobUrl}
                      className="w-full max-h-[300px] object-contain"
                    />
                  </div>
                </div>
              ) : (
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 text-xs text-slate-500 flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-slate-600" />
                  No video recording saved for this session turn.
                </div>
              )}

              {/* Rehearsal Interruption Log */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-2">
                  <AlertOctagon className="w-4 h-4" />
                  Rehearsal Interruption History ({selectedSession.interruptions?.length || 0})
                </h4>

                {(!selectedSession.interruptions || selectedSession.interruptions.length === 0) ? (
                  <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800 text-xs text-slate-500">
                    Clean run! No interruptions triggered during this rep.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-44 overflow-y-auto pr-1 custom-scrollbar">
                    {selectedSession.interruptions.map((inter, i) => (
                      <div
                        key={i}
                        className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                          inter.isHostileAudienceTurn
                            ? 'bg-rose-950/40 border-rose-600/60 text-rose-200'
                            : 'bg-slate-950 border-slate-800 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="font-black text-rose-400 px-2 py-0.5 rounded bg-rose-500/20 text-[10px]">
                            #{inter.count}
                          </span>
                          <span className="font-semibold">{inter.reason}</span>
                        </div>
                        <span className="text-[11px] text-slate-500 font-mono">
                          {Math.floor(inter.timestampSec / 60)}:{(Math.floor(inter.timestampSec % 60)).toString().padStart(2, '0')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Timestamped Transcript */}
              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-400" />
                  Session Transcript ({selectedSession.transcript.length} turns)
                </h4>

                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3 max-h-56 overflow-y-auto custom-scrollbar text-xs">
                  {selectedSession.transcript.map((t, idx) => {
                    const sec = t.timestampSec || 0;
                    const m = Math.floor(sec / 60).toString().padStart(2, '0');
                    const s = Math.floor(sec % 60).toString().padStart(2, '0');

                    return (
                      <div key={idx} className="flex items-start gap-2.5">
                        <span className="text-[10px] font-mono text-slate-500 pt-0.5">[{m}:{s}]</span>
                        <span
                          className={`font-bold px-1.5 py-0.5 rounded text-[10px] uppercase ${
                            t.speaker === 'user' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-purple-500/20 text-purple-400'
                          }`}
                        >
                          {t.speaker === 'user' ? 'Mano' : 'Coach'}
                        </span>
                        <span className="text-slate-300 flex-1">{t.text}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
