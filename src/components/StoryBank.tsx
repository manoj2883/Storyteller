import React, { useState, useEffect } from 'react';
import { Story } from '../types';
import { getAllStories, saveStory, deleteStory } from '../services/db';
import { BookOpen, Plus, Trash2, AlertCircle, CheckCircle2, Clock, Sparkles, FileText } from 'lucide-react';

interface StoryBankProps {
  onStartInterviewerSession: () => void;
}

export const StoryBank: React.FC<StoryBankProps> = ({ onStartInterviewerSession }) => {
  const [stories, setStories] = useState<Story[]>([]);
  const [isAddingNew, setIsAddingNew] = useState<boolean>(false);
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);

  // New story form state
  const [title, setTitle] = useState('');
  const [rawTranscript, setRawTranscript] = useState('');
  const [hook, setHook] = useState('');
  const [stakes, setStakes] = useState('');
  const [obstacle, setObstacle] = useState('');
  const [turn, setTurn] = useState('');
  const [payoff, setPayoff] = useState('');
  const [landingLine, setLandingLine] = useState('');
  const [emotion, setEmotion] = useState('');
  const [lesson, setLesson] = useState('');
  const [dur30s, setDur30s] = useState('');
  const [dur2min, setDur2min] = useState('');
  const [dur5min, setDur5min] = useState('');
  const [concreteImage, setConcreteImage] = useState('');
  const [themes, setThemes] = useState('');

  useEffect(() => {
    loadStories();
  }, []);

  const loadStories = async () => {
    const list = await getAllStories();
    setStories(list);
  };

  const isLandingLineFinished = (line: string) => {
    const wordCount = line.trim().split(/\s+/).filter(Boolean).length;
    return wordCount > 0 && wordCount <= 12;
  };

  const handleSavePastedStory = async (e: React.FormEvent) => {
    e.preventDefault();

    const newStory: Story = {
      id: 'story_' + Date.now(),
      title: title || 'Untitled Story',
      source: 'pasted',
      rawTranscript,
      beats: {
        hook,
        stakes,
        obstacle,
        turn,
        payoff,
        landingLine,
      },
      emotion,
      lesson,
      durations: {
        '30s': dur30s,
        '2min': dur2min,
        '5min': dur5min,
      },
      themes: themes.split(',').map((t) => t.trim()).filter(Boolean),
      concreteImage,
      reps: 0,
      lastTold: new Date().toISOString().split('T')[0],
      laughPoints: [],
    };

    await saveStory(newStory);
    await loadStories();
    setIsAddingNew(false);
    resetForm();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this story?')) {
      await deleteStory(id);
      await loadStories();
      if (selectedStory?.id === id) setSelectedStory(null);
    }
  };

  const resetForm = () => {
    setTitle('');
    setRawTranscript('');
    setHook('');
    setStakes('');
    setObstacle('');
    setTurn('');
    setPayoff('');
    setLandingLine('');
    setEmotion('');
    setLesson('');
    setDur30s('');
    setDur2min('');
    setDur5min('');
    setConcreteImage('');
    setThemes('');
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold text-white tracking-tight">Persistent Story Bank</h1>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              {stories.length} Core Stories
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Enforced Rules: 1 Story = 1 Lesson | Mandatory 30s version | Landing line &lt; 12 words
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onStartInterviewerSession}
            className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-medium text-xs rounded-xl shadow-lg shadow-purple-900/30 transition-all"
          >
            <Sparkles className="w-4 h-4" />
            Story Interviewer Session
          </button>
          <button
            onClick={() => setIsAddingNew(!isAddingNew)}
            className="flex items-center gap-2 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs rounded-xl transition-all"
          >
            <Plus className="w-4 h-4" />
            Paste Document Story
          </button>
        </div>
      </div>

      {/* Paste Importer Form Modal/Drawer */}
      {isAddingNew && (
        <form onSubmit={handleSavePastedStory} className="bg-dark-800 p-6 rounded-2xl border border-slate-700 space-y-4 text-xs">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-cyan-400" />
            Add Story via Document Paste
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="Story Title *"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-dark-900 border border-slate-700 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-cyan-500"
            />
            <input
              type="text"
              placeholder="One-Sentence Lesson (What this story is FOR) *"
              required
              value={lesson}
              onChange={(e) => setLesson(e.target.value)}
              className="bg-dark-900 border border-slate-700 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <textarea
            placeholder="Paste Raw Story / Transcript Document *"
            rows={4}
            required
            value={rawTranscript}
            onChange={(e) => setRawTranscript(e.target.value)}
            className="w-full bg-dark-900 border border-slate-700 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-cyan-500"
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="text"
              placeholder="Hook (Opening line)"
              value={hook}
              onChange={(e) => setHook(e.target.value)}
              className="bg-dark-900 border border-slate-700 rounded-lg p-2.5 text-slate-200"
            />
            <input
              type="text"
              placeholder="Stakes (What happens if it goes wrong)"
              value={stakes}
              onChange={(e) => setStakes(e.target.value)}
              className="bg-dark-900 border border-slate-700 rounded-lg p-2.5 text-slate-200"
            />
            <input
              type="text"
              placeholder="Obstacle"
              value={obstacle}
              onChange={(e) => setObstacle(e.target.value)}
              className="bg-dark-900 border border-slate-700 rounded-lg p-2.5 text-slate-200"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="text"
              placeholder="Turn (Moment it changes)"
              value={turn}
              onChange={(e) => setTurn(e.target.value)}
              className="bg-dark-900 border border-slate-700 rounded-lg p-2.5 text-slate-200"
            />
            <input
              type="text"
              placeholder="Payoff"
              value={payoff}
              onChange={(e) => setPayoff(e.target.value)}
              className="bg-dark-900 border border-slate-700 rounded-lg p-2.5 text-slate-200"
            />
            <div className="relative">
              <input
                type="text"
                placeholder="Landing Line (< 12 words) *"
                required
                value={landingLine}
                onChange={(e) => setLandingLine(e.target.value)}
                className={`w-full bg-dark-900 border rounded-lg p-2.5 text-slate-200 ${
                  isLandingLineFinished(landingLine)
                    ? 'border-emerald-500'
                    : 'border-rose-500'
                }`}
              />
              <span className="absolute right-2 top-2.5 text-[10px] text-slate-400">
                {landingLine.trim().split(/\s+/).filter(Boolean).length} words
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <textarea
              placeholder="30-Second Version *"
              required
              rows={2}
              value={dur30s}
              onChange={(e) => setDur30s(e.target.value)}
              className="bg-dark-900 border border-slate-700 rounded-lg p-2 text-slate-200"
            />
            <textarea
              placeholder="2-Minute Version"
              rows={2}
              value={dur2min}
              onChange={(e) => setDur2min(e.target.value)}
              className="bg-dark-900 border border-slate-700 rounded-lg p-2 text-slate-200"
            />
            <textarea
              placeholder="5-Minute Version"
              rows={2}
              value={dur5min}
              onChange={(e) => setDur5min(e.target.value)}
              className="bg-dark-900 border border-slate-700 rounded-lg p-2 text-slate-200"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Concrete Visual Image (Single visual audience keeps)"
              value={concreteImage}
              onChange={(e) => setConcreteImage(e.target.value)}
              className="bg-dark-900 border border-slate-700 rounded-lg p-2.5 text-slate-200"
            />
            <input
              type="text"
              placeholder="Themes / Tags (comma separated)"
              value={themes}
              onChange={(e) => setThemes(e.target.value)}
              className="bg-dark-900 border border-slate-700 rounded-lg p-2.5 text-slate-200"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsAddingNew(false)}
              className="px-4 py-2 bg-slate-800 text-slate-400 hover:text-white rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-medium rounded-lg shadow-md shadow-cyan-900/30"
            >
              Save Story to Bank
            </button>
          </div>
        </form>
      )}

      {/* Story Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stories.length === 0 ? (
          <div className="col-span-full py-12 text-center bg-dark-800 rounded-2xl border border-slate-800 text-slate-500 space-y-2">
            <BookOpen className="w-8 h-8 mx-auto text-slate-600" />
            <p className="text-sm">No stories in your Story Bank yet.</p>
            <p className="text-xs text-slate-600">Start an interview session or paste a document story above.</p>
          </div>
        ) : (
          stories.map((story) => {
            const landingWordCount = story.beats.landingLine
              ? story.beats.landingLine.trim().split(/\s+/).filter(Boolean).length
              : 0;
            const isFinished = landingWordCount > 0 && landingWordCount <= 12;

            return (
              <div
                key={story.id}
                onClick={() => setSelectedStory(story)}
                className="bg-dark-800 p-5 rounded-2xl border border-slate-800 hover:border-cyan-500/50 cursor-pointer transition-all flex flex-col justify-between space-y-3 group"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between">
                    <h3 className="font-bold text-white group-hover:text-cyan-300 transition-colors text-sm line-clamp-1">
                      {story.title}
                    </h3>
                    <span
                      className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                        isFinished
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                      }`}
                    >
                      {isFinished ? (
                        <>
                          <CheckCircle2 className="w-3 h-3" /> Ready
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-3 h-3" /> Unfinished (&gt;12w landing)
                        </>
                      )}
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 line-clamp-2 italic">
                    "{story.lesson}"
                  </p>
                </div>

                <div className="bg-dark-900 p-2.5 rounded-xl border border-slate-800 text-[11px] space-y-1">
                  <span className="text-slate-500 font-bold uppercase text-[9px]">30s Landing Version:</span>
                  <p className="text-slate-300 line-clamp-2">{story.durations['30s'] || 'No 30s version'}</p>
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-500 pt-2 border-t border-slate-800">
                  <span className="capitalize">Source: {story.source}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(story.id);
                    }}
                    className="text-slate-600 hover:text-rose-400 p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
