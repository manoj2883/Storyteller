import React, { useState, useEffect } from 'react';
import { Bit } from '../types';
import { getAllBits, saveBit, deleteBit } from '../services/db';
import { Sparkles, Plus, Trash2, Tag, Smile, HelpCircle, Info, X } from 'lucide-react';

export const BitBank: React.FC = () => {
  const [bits, setBits] = useState<Bit[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const [setup, setSetup] = useState('');
  const [line, setLine] = useState('');
  const [topics, setTopics] = useState('');
  const [device, setDevice] = useState<Bit['device']>('rule_of_three');

  useEffect(() => {
    loadBits();
  }, []);

  const loadBits = async () => {
    const list = await getAllBits();
    setBits(list);
  };

  const handleSaveBit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newBit: Bit = {
      id: 'bit_' + Date.now(),
      setup,
      line,
      topics: topics.split(',').map((t) => t.trim()).filter(Boolean),
      device,
      reps: 0,
    };
    await saveBit(newBit);
    await loadBits();
    setIsAdding(false);
    setSetup('');
    setLine('');
    setTopics('');
  };

  const handleDelete = async (id: string) => {
    if (confirm('Delete this bit?')) {
      await deleteBit(id);
      await loadBits();
    }
  };

  const deviceGuides: Record<string, { label: string; rule: string; example: string }> = {
    rule_of_three: {
      label: 'Rule of Three',
      rule: 'List 2 normal items, then break expectations on the 3rd.',
      example: 'I prepared my pitch, reviewed financial models, and prayed to the Wi-Fi gods.',
    },
    self_deprecation: {
      label: 'Self-Deprecation',
      rule: 'Praise your team or situation while poking gentle fun at yourself (never on core competence).',
      example: 'My team built the entire architecture while I specialized in ordering coffee.',
    },
    contrast: {
      label: 'Contrast',
      rule: 'Pair a high-stakes setting with a low-stakes trivial reality.',
      example: 'We were pitching a $10M fund while I was wearing $8 socks with a hole in the big toe.',
    },
    understatement: {
      label: 'Understatement',
      rule: 'Downplay a major disaster with extreme calm phrasing.',
      example: 'Losing our entire database 10 minutes before demo was slightly suboptimal.',
    },
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold text-white tracking-tight">Bit Bank & Lightness Module</h1>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-400 border border-purple-500/30">
              {bits.length} Reusable Lines
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Short reusable humor lines drawn from Mano's life. Lightness cadence: due roughly every 90-120 seconds.
          </p>
        </div>

        <button
          onClick={() => setIsAdding(!isAdding)}
          className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs rounded-xl transition-all"
        >
          <Plus className="w-4 h-4" />
          Add Bit
        </button>
      </div>

      {isAdding && (
        <form onSubmit={handleSaveBit} className="bg-slate-900 p-6 rounded-2xl border border-slate-700 space-y-4 text-xs shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Smile className="w-4 h-4 text-purple-400" />
              Add Reusable Lightness Bit
            </h2>
            <button
              type="button"
              onClick={() => setShowGuide(!showGuide)}
              className="text-purple-400 hover:text-purple-300 text-xs font-semibold flex items-center gap-1 bg-purple-500/10 px-2.5 py-1 rounded-lg border border-purple-500/30"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              Humor Devices Guide
            </button>
          </div>

          {showGuide && (
            <div className="bg-purple-950/80 border border-purple-500/40 p-4 rounded-xl text-slate-200 space-y-2 text-xs animate-fadeIn">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Info className="w-4 h-4" /> Humor Device Rules & Examples
                </span>
                <button type="button" onClick={() => setShowGuide(false)} className="text-slate-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                {Object.entries(deviceGuides).map(([key, guide]) => (
                  <div key={key} className="bg-slate-900/90 p-2.5 rounded-lg border border-slate-800">
                    <span className="font-bold text-purple-300 block">{guide.label}</span>
                    <p className="text-slate-400 text-[11px]">{guide.rule}</p>
                    <span className="text-[11px] text-emerald-400 font-mono block mt-1">Example: "{guide.example}"</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-300 mb-1">Setup / Context *</label>
              <input
                type="text"
                placeholder="e.g. Whenever my wife asks if I listened to her..."
                required
                value={setup}
                onChange={(e) => setSetup(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-300 mb-1">Punch Line / Lightness Line *</label>
              <input
                type="text"
                placeholder="e.g. I give the confident nod of a man who missed every single word."
                required
                value={line}
                onChange={(e) => setLine(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-300 mb-1">Topics (comma separated)</label>
              <input
                type="text"
                placeholder="e.g. listening, relationships, work"
                value={topics}
                onChange={(e) => setTopics(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-300 mb-1">Humor Device Structure</label>
              <select
                value={device}
                onChange={(e) => setDevice(e.target.value as Bit['device'])}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-slate-200"
              >
                <option value="rule_of_three">Rule of Three (Third breaks pattern)</option>
                <option value="callback">Callback</option>
                <option value="contrast">Contrast</option>
                <option value="understatement">Understatement</option>
                <option value="false_precision">False Precision</option>
                <option value="self_deprecation">Self-Deprecation (Guardrail: Not on core trust)</option>
                <option value="misdirection">Misdirection</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-4 py-2 bg-slate-800 text-slate-400 hover:text-white rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-lg shadow-md shadow-purple-900/30"
            >
              Save Bit to Bank
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {bits.length === 0 ? (
          <div className="col-span-full py-12 text-center bg-slate-900/60 rounded-2xl border border-slate-800 text-slate-500 space-y-2">
            <Smile className="w-8 h-8 mx-auto text-slate-600" />
            <p className="text-sm">No bits in your Bit Bank yet.</p>
            <p className="text-xs text-slate-600">Add lines to use during dense sections for lightness beats.</p>
          </div>
        ) : (
          bits.map((bit) => (
            <div key={bit.id} className="bg-slate-900/80 p-5 rounded-2xl border border-slate-800 flex flex-col justify-between space-y-3">
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">
                    {bit.device.replace(/_/g, ' ')}
                  </span>
                  <button onClick={() => handleDelete(bit.id)} className="text-slate-500 hover:text-rose-400 p-1">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-xs text-slate-400 italic">"{bit.setup}"</p>
                <p className="text-sm font-bold text-white">"{bit.line}"</p>
              </div>

              {bit.topics.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-800/60">
                  {bit.topics.map((t, idx) => (
                    <span key={idx} className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                      #{t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
