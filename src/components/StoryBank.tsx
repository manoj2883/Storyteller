import React, { useState, useEffect } from 'react';
import { Story } from '../types';
import { getAllStories, saveStory, deleteStory } from '../services/db';
import { BookOpen, Plus, Trash2, AlertCircle, CheckCircle2, Clock, Sparkles, FileText, Info, HelpCircle, X } from 'lucide-react';

interface StoryBankProps {
  onStartInterviewerSession: () => void;
}

export const StoryBank: React.FC<StoryBankProps> = ({ onStartInterviewerSession }) => {
  const [stories, setStories] = useState<Story[]>([]);
  const [isAddingNew, setIsAddingNew] = useState<boolean>(false);
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

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

  const fieldGuides: Record<string, { label: string; rule: string; example: string }> = {
    title: {
      label: 'Story Title',
      rule: 'Short memorable name for your story rep bank.',
      example: 'The Cold Coffee Firing',
    },
    lesson: {
      label: 'One-Sentence Lesson',
      rule: 'What does this story prove to the audience? (1 Story = 1 Lesson)',
      example: 'Vulnerability beats polished slides every single time.',
    },
    rawTranscript: {
      label: 'Raw Story / Transcript',
      rule: 'Paste full notes or transcript text of the event.',
      example: 'I was sitting in the room when the projector died...',
    },
    hook: {
      label: 'Hook (Opening line)',
      rule: 'Set the scene immediately with specific time, place, or action.',
      example: 'I got fired on a Tuesday at 9:01 AM holding a cold cup of coffee.',
    },
    stakes: {
      label: 'Stakes',
      rule: 'What is at risk if you fail in this situation?',
      example: 'My rent was due in 3 days and I had $42 in checking.',
    },
    obstacle: {
      label: 'Obstacle',
      rule: 'The conflict or wall in your way.',
      example: 'The client projector fried 2 minutes before my presentation.',
    },
    turn: {
      label: 'Turn (Turning Point)',
      rule: 'The exact decision or shift where momentum changes.',
      example: 'Instead of reading slides, I closed my laptop and told the raw truth.',
    },
    payoff: {
      label: 'Payoff',
      rule: 'The outcome and resolution.',
      example: 'The client signed a $50k contract on a paper napkin.',
    },
    landingLine: {
      label: 'Landing Line (< 12 words)',
      rule: 'Final memorable punchline under 12 words.',
      example: 'Courage is acting before you feel ready.',
    },
    dur30s: {
      label: '30-Second Version',
      rule: 'Compressed elevator-pitch version of the story.',
      example: 'Hook + Obstacle + Landing line in under 60 words.',
    },
    concreteImage: {
      label: 'Concrete Visual Image',
      rule: 'Single vivid physical sensory detail the audience visualizes.',
      example: 'A stained white mug on a glass boardroom table.',
    },
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

      {/* Paste Importer Form Modal */}
      {isAddingNew && (
        <form onSubmit={handleSavePastedStory} className="bg-slate-900 p-6 rounded-2xl border border-slate-700 space-y-4 text-xs shadow-2xl relative">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-cyan-400" />
              Add Story via Document Paste
            </h2>
            <button
              type="button"
              onClick={() => setActiveTooltip(activeTooltip ? null : 'all')}
              className="text-cyan-400 hover:text-cyan-300 text-xs font-semibold flex items-center gap-1 bg-cyan-500/10 px-2.5 py-1 rounded-lg border border-cyan-500/30"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              Field Guide & Examples
            </button>
          </div>

          {/* Form Guide Banner if toggled */}
          {activeTooltip && (
            <div className="bg-cyan-950/80 border border-cyan-500/40 p-4 rounded-xl text-slate-200 space-y-2 text-xs animate-fadeIn">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Info className="w-4 h-4" /> Story Beats Quick Guide & Examples
                </span>
                <button type="button" onClick={() => setActiveTooltip(null)} className="text-slate-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                {Object.entries(fieldGuides).map(([key, guide]) => (
                  <div key={key} className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                    <span className="font-bold text-cyan-300 block">{guide.label}</span>
                    <p className="text-slate-400 text-[11px]">{guide.rule}</p>
                    <span className="text-[11px] text-emerald-400 font-mono block mt-1">Example: "{guide.example}"</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-300 mb-1 flex items-center gap-1">
                Story Title *
              </label>
              <input
                type="text"
                placeholder="Story Title *"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-300 mb-1 flex items-center gap-1">
                One-Sentence Lesson (What this story is FOR) *
              </label>
              <input
                type="text"
                placeholder="One-Sentence Lesson *"
                required
                value={lesson}
                onChange={(e) => setLesson(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-300 mb-1">Raw Story / Transcript Document *</label>
            <textarea
              placeholder="Paste Raw Story / Transcript Document *"
              rows={3}
              required
              value={rawTranscript}
              onChange={(e) => setRawTranscript(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block font-bold text-slate-300 mb-1">Hook (Opening line)</label>
              <input
                type="text"
                placeholder="e.g. I got fired on a Tuesday at 9:01 AM..."
                value={hook}
                onChange={(e) => setHook(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-300 mb-1">Stakes (What happens if it goes wrong)</label>
              <input
                type="text"
                placeholder="e.g. Rent due in 3 days with $42 in checking..."
                value={stakes}
                onChange={(e) => setStakes(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-300 mb-1">Obstacle</label>
              <input
                type="text"
                placeholder="e.g. Projector fried 2 minutes before presentation..."
                value={obstacle}
                onChange={(e) => setObstacle(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block font-bold text-slate-300 mb-1">Turn (Moment it changes)</label>
              <input
                type="text"
                placeholder="e.g. Closed laptop and told raw truth..."
                value={turn}
                onChange={(e) => setTurn(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-300 mb-1">Payoff</label>
              <input
                type="text"
                placeholder="e.g. Signed $50k contract on a napkin..."
                value={payoff}
                onChange={(e) => setPayoff(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-300 mb-1">Landing Line (&lt; 12 words) *</label>
              <input
                type="text"
                placeholder="e.g. Vulnerability beats polished slides every time."
                required
                value={landingLine}
                onChange={(e) => setLandingLine(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-300 mb-1">30-Second Version *</label>
              <textarea
                rows={2}
                placeholder="30-second compressed version of the story..."
                required
                value={dur30s}
                onChange={(e) => setDur30s(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-300 mb-1">Concrete Visual Image</label>
              <input
                type="text"
                placeholder="e.g. A stained white mug on a glass boardroom table"
                value={concreteImage}
                onChange={(e) => setConcreteImage(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsAddingNew(false)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl shadow-lg shadow-cyan-950/40"
            >
              Save Story to Bank
            </button>
          </div>
        </form>
      )}

      {/* Story Grid / Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stories.map((story) => (
          <div
            key={story.id}
            onClick={() => setSelectedStory(story)}
            className={`p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-4 ${
              selectedStory?.id === story.id
                ? 'bg-slate-900 border-cyan-500/80 shadow-xl shadow-cyan-950/40'
                : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div>
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-extrabold text-white text-base">{story.title}</h3>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(story.id);
                  }}
                  className="text-slate-500 hover:text-rose-400 p-1 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-cyan-400 mt-1 font-semibold">Lesson: {story.lesson}</p>
            </div>

            <div className="space-y-2 text-xs text-slate-300">
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Landing Line</span>
                <span className="font-semibold text-emerald-400">"{story.beats.landingLine}"</span>
              </div>
              {story.concreteImage && (
                <p className="text-[11px] text-slate-400 italic">Visual: {story.concreteImage}</p>
              )}
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-800/60">
              <span>Told {story.reps} times</span>
              <span>Last: {story.lastTold || 'Never'}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
