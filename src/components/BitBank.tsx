import React, { useState, useEffect } from 'react';
import { Bit } from '../types';
import { getAllBits, saveBit, deleteBit } from '../services/db';
import { Sparkles, Plus, Trash2, Tag, Smile } from 'lucide-react';

export const BitBank: React.FC = () => {
  const [bits, setBits] = useState<Bit[]>([]);
  const [isAdding, setIsAdding] = useState(false);

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
        <form onSubmit={handleSaveBit} className="bg-dark-800 p-6 rounded-2xl border border-slate-700 space-y-4 text-xs">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Smile className="w-4 h-4 text-purple-400" />
            Add Reusable Lightness Bit
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="Setup / Context *"
              required
              value={setup}
              onChange={(e) => setSetup(e.target.value)}
              className="bg-dark-900 border border-slate-700 rounded-lg p-2.5 text-slate-200"
            />
            <input
              type="text"
              placeholder="Punch Line / Lightness Line *"
              required
              value={line}
              onChange={(e) => setLine(e.target.value)}
              className="bg-dark-900 border border-slate-700 rounded-lg p-2.5 text-slate-200"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="Topics (comma separated)"
              value={topics}
              onChange={(e) => setTopics(e.target.value)}
              className="bg-dark-900 border border-slate-700 rounded-lg p-2.5 text-slate-200"
            />
            <select
              value={device}
              onChange={(e) => setDevice(e.target.value as Bit['device'])}
              className="bg-dark-900 border border-slate-700 rounded-lg p-2.5 text-slate-200"
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
              Save Bit
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {bits.length === 0 ? (
          <div className="col-span-full py-12 text-center bg-dark-800 rounded-2xl border border-slate-800 text-slate-500 space-y-2">
            <Smile className="w-8 h-8 mx-auto text-slate-600" />
            <p className="text-sm">No bits in your Bit Bank yet.</p>
            <p className="text-xs text-slate-600">Add lines to use during dense sections for lightness beats.</p>
          </div>
        ) : (
          bits.map((bit) => (
            <div key={bit.id} className="bg-dark-800 p-5 rounded-2xl border border-slate-800 flex flex-col justify-between space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    {bit.device.replace('_', ' ')}
                  </span>
                  <button
                    onClick={() => handleDelete(bit.id)}
                    className="text-slate-600 hover:text-rose-400 p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="text-xs text-slate-400">
                  <span className="font-semibold text-slate-500 block">Setup:</span> {bit.setup}
                </div>
                <div className="text-xs font-semibold text-purple-200 bg-purple-950/40 p-2.5 rounded-lg border border-purple-800/40">
                  "{bit.line}"
                </div>
              </div>

              {bit.topics.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-slate-500 pt-2 border-t border-slate-800">
                  <Tag className="w-3 h-3 text-slate-600" />
                  {bit.topics.join(', ')}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
