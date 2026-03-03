import React, { useMemo, useState } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import type { UniCalendar } from '../types';
import { uid } from '../services/id';
import { toast } from '../services/toast';

const COLOR_OPTIONS: Array<{ label: string; value: string }> = [
  { label: 'Indigo', value: 'bg-indigo-500' },
  { label: 'Emerald', value: 'bg-emerald-500' },
  { label: 'Rose', value: 'bg-rose-500' },
  { label: 'Sky', value: 'bg-sky-500' },
  { label: 'Amber', value: 'bg-amber-500' },
  { label: 'Violet', value: 'bg-violet-500' },
  { label: 'Slate', value: 'bg-slate-600' },
];

interface CalendarManagerProps {
  calendars: UniCalendar[];
  onUpdate: (calendars: UniCalendar[]) => void;
  onOpenGroup?: (id: string) => void;
}

const CalendarManager: React.FC<CalendarManagerProps> = ({ calendars, onUpdate, onOpenGroup }) => {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLOR_OPTIONS[0].value);

  const usedNames = useMemo(
    () => new Set(calendars.map(c => c.name.trim().toLowerCase())),
    [calendars]
  );

  const toggleVisible = (id: string) => {
    onUpdate(calendars.map(c => (c.id === id ? { ...c, visible: !c.visible } : c)));
  };

  const removeCalendar = (id: string) => {
    onUpdate(calendars.filter(c => c.id !== id));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (usedNames.has(trimmed.toLowerCase())) {
      toast('Calendar name already exists');
      return;
    }

    const next: UniCalendar = {
      id: uid('cal'),
      name: trimmed,
      color,
      visible: true,
    };

    onUpdate([...calendars, next]);
    setName('');
    setColor(COLOR_OPTIONS[0].value);
    setShowForm(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Personal Calendars</h2>
          <p className="text-slate-500">Organize life events into separate personal calendars.</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-all"
        >
          <Plus className="w-4 h-4" />
          Add Activity
        </button>
      </div>

      {calendars.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm py-20 px-6 text-center">
          <h3 className="text-lg font-semibold text-slate-800">No activities yet</h3>
          <p className="text-sm text-slate-500 mt-2">Click "Add Activity" to create your first personal calendar.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {calendars.map(cal => (
            <button
              key={cal.id}
              type="button"
              onClick={() => onOpenGroup?.(cal.id)}
              className="text-left bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-3.5 h-3.5 rounded-full ${cal.color}`}></div>
                  <div>
                    <div className="font-semibold text-slate-800">{cal.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{cal.visible ? 'Visible' : 'Hidden'}</div>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeCalendar(cal.id);
                  }}
                  className="p-2 rounded-xl transition-colors bg-slate-50 text-slate-400 hover:text-rose-600"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleVisible(cal.id);
                }}
                className={`mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                  cal.visible ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Check className={`w-4 h-4 ${cal.visible ? '' : 'opacity-0'}`} />
                {cal.visible ? 'Shown in calendar' : 'Hidden from calendar'}
              </button>
            </button>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form onSubmit={submit} className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-bold mb-6">Add Activity</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                <input
                  autoFocus
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20"
                  placeholder="e.g. Fitness, Family, Travel"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Color</label>
                <div className="grid grid-cols-4 gap-2">
                  {COLOR_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setColor(opt.value)}
                      className={`h-10 rounded-xl border transition-all ${
                        color === opt.value ? 'border-indigo-500 ring-2 ring-indigo-500/20' : 'border-slate-200'
                      }`}
                      title={opt.label}
                    >
                      <div className={`h-full w-full rounded-xl ${opt.value}`}></div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-8">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200"
              >
                Cancel
              </button>
              <button type="submit" className="flex-1 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700">
                Create
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default CalendarManager;
