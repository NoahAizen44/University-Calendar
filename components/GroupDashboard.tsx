import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react';
import type { CalendarEvent, UniCalendar } from '../types';
import { uid } from '../services/id';
import CalendarView from './CalendarView';
import ConfirmDialog from './ConfirmDialog';
import { toast } from '../services/toast';

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatShortDate(d: Date) {
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

type Props = {
  group: UniCalendar;
  events: CalendarEvent[];
  // (Optional) We can later pass assignments/courses too for richer group calendar.
  onBack: () => void;
  onUpdateGroups: (next: UniCalendar[]) => void;
  allGroups: UniCalendar[];
  onUpdateEvents: (next: CalendarEvent[]) => void;
};

type TabKey = 'overview' | 'calendar' | 'notes' | 'goals';

type DraftEvent = {
  title: string;
  date: string; // yyyy-mm-dd
  start: string; // HH:mm
  end: string; // HH:mm
  location?: string;
};

function toYmd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseLocalDateTime(dateYmd: string, timeHm: string) {
  const [y, m, d] = dateYmd.split('-').map(Number);
  const [hh, mm] = timeHm.split(':').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
}

const GroupDashboard: React.FC<Props> = ({ group, events, onBack, onUpdateGroups, allGroups, onUpdateEvents }) => {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(group.name);

  const notesStorageKey = `group_notes_${group.id}`;
  const goalStorageKey = `group_goal_hours_${group.id}`;
  const [notes, setNotes] = useState('');
  const [weeklyGoalHours, setWeeklyGoalHours] = useState<number>(8);

  const [showCreate, setShowCreate] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [draft, setDraft] = useState<DraftEvent>(() => {
    const now = new Date();
    const start = new Date(now);
    start.setMinutes(0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    return {
      title: '',
      date: toYmd(now),
      start: `${String(start.getHours()).padStart(2, '0')}:00`,
      end: `${String(end.getHours()).padStart(2, '0')}:00`,
      location: '',
    };
  });

  const groupEvents = useMemo(
    () => events.filter(e => e.calendarId === group.id),
    [events, group.id]
  );

  useEffect(() => {
    // Load per-group notes + goal.
    try {
      const n = localStorage.getItem(notesStorageKey);
      if (n != null) setNotes(n);
      const g = localStorage.getItem(goalStorageKey);
      if (g != null && !Number.isNaN(Number(g))) setWeeklyGoalHours(Math.max(0, Number(g)));
    } catch {
      // ignore
    }

    // Reset UI drafts when switching groups.
    setNameDraft(group.name);
    setRenaming(false);
    setActiveTab('overview');
  }, [group.id]);

  useEffect(() => {
    try {
      localStorage.setItem(notesStorageKey, notes);
    } catch {
      // ignore
    }
  }, [notes, notesStorageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(goalStorageKey, String(weeklyGoalHours));
    } catch {
      // ignore
    }
  }, [weeklyGoalHours, goalStorageKey]);

  const upcoming = useMemo(() => {
    const now = new Date();
    return groupEvents
      .filter(e => new Date(e.endTime).getTime() >= now.getTime())
      .slice()
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
      .slice(0, 10);
  }, [groupEvents]);

  const weekSummary = useMemo(() => {
    const now = new Date();
    const start = startOfDay(now);
    const end = endOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 6));

    const inRange = groupEvents.filter(e => {
      const s = new Date(e.startTime);
      return s >= start && s <= end;
    });

    const totalMinutes = inRange.reduce((acc, e) => {
      const s = new Date(e.startTime).getTime();
      const en = new Date(e.endTime).getTime();
      return acc + Math.max(0, (en - s) / 60000);
    }, 0);

    return {
      count: inRange.length,
      hours: Math.round((totalMinutes / 60) * 10) / 10,
      today: inRange.filter(e => isSameDay(new Date(e.startTime), now)).length,
    };
  }, [groupEvents]);

  const toggleVisible = () => {
    onUpdateGroups(allGroups.map(g => (g.id === group.id ? { ...g, visible: !g.visible } : g)));
  };

  const saveRename = () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) return;
    onUpdateGroups(allGroups.map(g => (g.id === group.id ? { ...g, name: trimmed } : g)));
    setRenaming(false);
  };

  const deleteGroup = () => {
    if (allGroups.length <= 1) return;
    setShowDeleteConfirm(true);
  };

  const createEvent = (e: React.FormEvent) => {
    e.preventDefault();
    const title = draft.title.trim();
    if (!title) return;

    const start = parseLocalDateTime(draft.date, draft.start);
    const end = parseLocalDateTime(draft.date, draft.end);
    if (end.getTime() <= start.getTime()) {
      toast('End time must be after start time');
      return;
    }

    const next: CalendarEvent = {
      id: uid('evt'),
      title,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      calendarId: group.id,
      location: draft.location?.trim() || undefined,
      source: 'manual',
    };

    onUpdateEvents([...events, next]);
    setShowCreate(false);
    setDraft(prev => ({ ...prev, title: '' }));
    toast('Event created');
  };

  return (
    <div className="space-y-6">
      {/* Back row */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="w-5 h-5" />
          Back
        </button>
      </div>

      {/* Hero Banner */}
      <div className={`relative overflow-hidden rounded-2xl p-8 text-white shadow-lg ${group.color}`}>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-white/20 backdrop-blur-sm text-xs font-bold uppercase tracking-wider mb-3">
              <span>Group</span>
              <span className="opacity-70">•</span>
              <span className="opacity-90">{group.visible ? 'Visible' : 'Hidden'}</span>
            </div>

            {!renaming ? (
              <h2 className="text-3xl font-bold mb-2 truncate">{group.name}</h2>
            ) : (
              <div className="flex items-center gap-3 mb-2">
                <input
                  value={nameDraft}
                  onChange={ev => setNameDraft(ev.target.value)}
                  className="px-4 py-2 rounded-xl bg-white/20 backdrop-blur-sm placeholder-white/60 text-white border border-white/20 focus:ring-2 focus:ring-white/30 outline-none"
                />
                <button
                  type="button"
                  onClick={saveRename}
                  className="px-4 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-xl text-sm font-semibold transition-colors"
                >
                  Save
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-4 text-white/90">
              <div className="text-sm font-medium">This week: {weekSummary.count} events • {weekSummary.hours} hrs</div>
              <div className="text-sm font-medium">Today: {weekSummary.today} events</div>
              <div className="text-sm font-medium">Total: {groupEvents.length} events</div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-xl text-sm font-semibold transition-colors inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add event
            </button>

            <button
              type="button"
              onClick={toggleVisible}
              className="px-4 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-xl text-sm font-semibold transition-colors inline-flex items-center gap-2"
              title={group.visible ? 'Hide from calendar' : 'Show in calendar'}
            >
              {group.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              {group.visible ? 'Visible' : 'Hidden'}
            </button>

            {!renaming && (
              <button
                type="button"
                onClick={() => setRenaming(true)}
                className="px-4 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-xl text-sm font-semibold transition-colors inline-flex items-center gap-2"
              >
                <Pencil className="w-4 h-4" />
                Rename
              </button>
            )}

            <button
              type="button"
              onClick={deleteGroup}
              disabled={allGroups.length <= 1}
              className={`px-4 py-2 backdrop-blur-sm rounded-xl text-sm font-semibold transition-colors inline-flex items-center gap-2 ${
                allGroups.length <= 1
                  ? 'bg-white/10 text-white/40 cursor-not-allowed'
                  : 'bg-white/20 hover:bg-white/30 text-white'
              }`}
              title={allGroups.length <= 1 ? 'You need at least one group' : 'Delete group'}
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        </div>

        {/* Abstract shapes decoration */}
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-40 h-40 bg-black/5 rounded-full blur-2xl"></div>
      </div>

      {/* Tabs (sticky under the app header) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-2 shadow-sm sticky top-16 z-[5]">
        <div className="flex items-center gap-2 overflow-x-auto">
          {([
            { k: 'overview', label: 'Overview' },
            { k: 'calendar', label: 'Calendar' },
            { k: 'notes', label: 'Notes' },
            { k: 'goals', label: 'Goals' },
          ] as Array<{ k: TabKey; label: string }>).map(t => (
            <button
              key={t.k}
              type="button"
              onClick={() => setActiveTab(t.k)}
              className={`px-4 py-2 text-sm font-semibold rounded-xl transition-colors ${
                activeTab === t.k ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800">Upcoming</h3>
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
              >
                Add event
              </button>
            </div>

            {upcoming.length === 0 ? (
              <div className="py-10 text-center text-slate-500">No upcoming events yet.</div>
            ) : (
              <div className="space-y-3">
                {upcoming.map(e => {
                  const s = new Date(e.startTime);
                  const en = new Date(e.endTime);
                  return (
                    <div key={e.id} className="flex items-start gap-4 p-4 rounded-2xl border border-slate-200">
                      <div className={`w-2.5 h-2.5 rounded-full mt-1 ${group.color}`} />
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-800 truncate">{e.title}</div>
                        <div className="text-sm text-slate-500 mt-1">
                          {formatShortDate(s)} • {formatTime(s)}–{formatTime(en)}
                          {e.location ? <span className="text-slate-300"> • </span> : null}
                          {e.location ? <span className="text-slate-500">{e.location}</span> : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-slate-800 mb-3">This week</h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Events</div>
                  <div className="mt-1 text-2xl font-bold text-slate-800">{weekSummary.count}</div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Hours</div>
                  <div className="mt-1 text-2xl font-bold text-slate-800">{weekSummary.hours}</div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Today</div>
                  <div className="mt-1 text-2xl font-bold text-slate-800">{weekSummary.today}</div>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-800">Goal progress</h3>
                <button
                  type="button"
                  onClick={() => setActiveTab('goals')}
                  className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
                >
                  Edit
                </button>
              </div>

              <div className="flex items-baseline justify-between">
                <div className="text-2xl font-bold text-slate-800">{weekSummary.hours}h</div>
                <div className="text-sm text-slate-500">/ {weeklyGoalHours}h</div>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2 mt-3 overflow-hidden">
                <div
                  className="bg-indigo-600 h-2 rounded-full"
                  style={{ width: `${weeklyGoalHours > 0 ? Math.min(100, (weekSummary.hours / weeklyGoalHours) * 100) : 0}%` }}
                />
              </div>
              <div className="mt-2 text-xs text-slate-500">{weekSummary.count} events scheduled this week.</div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'calendar' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <CalendarView
            assignments={[]}
            studySessions={[]}
            courses={[]}
            events={groupEvents}
            calendars={[group]}
            fullView
            onEventsChange={onUpdateEvents}
          />
        </div>
      )}

      {activeTab === 'notes' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 mb-3">Notes</h3>
          <p className="text-sm text-slate-500 mb-4">Quick notes for this group — autosaved.</p>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Add notes…"
            className="w-full min-h-[260px] px-4 py-3 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500/20 outline-none text-slate-800"
          />
        </div>
      )}

      {activeTab === 'goals' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 mb-3">Goals</h3>
          <p className="text-sm text-slate-500 mb-6">Set a weekly hours goal for this group and track progress from scheduled events.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-700">Weekly goal (hours)</label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={weeklyGoalHours}
                onChange={e => setWeeklyGoalHours(Number(e.target.value))}
                className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20"
              />
              <div className="text-xs text-slate-400">Example: 5h for gym, 12h for study, etc.</div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">This week progress</div>
              <div className="mt-2 flex items-baseline justify-between">
                <div className="text-2xl font-bold text-slate-800">{weekSummary.hours}h</div>
                <div className="text-sm text-slate-500">/ {weeklyGoalHours}h</div>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2 mt-3 overflow-hidden">
                <div
                  className="bg-indigo-600 h-2 rounded-full"
                  style={{ width: `${weeklyGoalHours > 0 ? Math.min(100, (weekSummary.hours / weeklyGoalHours) * 100) : 0}%` }}
                />
              </div>
              <div className="mt-2 text-xs text-slate-500">{weekSummary.count} events scheduled this week.</div>
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form onSubmit={createEvent} className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold">Add event</h3>
              <button type="button" onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
                <input
                  autoFocus
                  required
                  value={draft.title}
                  onChange={ev => setDraft(prev => ({ ...prev, title: ev.target.value }))}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20"
                  placeholder="e.g. Gym session"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-3">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={draft.date}
                    onChange={ev => setDraft(prev => ({ ...prev, date: ev.target.value }))}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Start</label>
                  <input
                    type="time"
                    required
                    value={draft.start}
                    onChange={ev => setDraft(prev => ({ ...prev, start: ev.target.value }))}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">End</label>
                  <input
                    type="time"
                    required
                    value={draft.end}
                    onChange={ev => setDraft(prev => ({ ...prev, end: ev.target.value }))}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                <div className="col-span-3">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Location (optional)</label>
                  <input
                    value={draft.location}
                    onChange={ev => setDraft(prev => ({ ...prev, location: ev.target.value }))}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20"
                    placeholder="e.g. Rec Center"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700"
                >
                  Add
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete group?"
        message="Events in this group will also be deleted."
        confirmLabel="Delete group"
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={() => {
          onUpdateGroups(allGroups.filter(g => g.id !== group.id));
          onUpdateEvents(events.filter(e => e.calendarId !== group.id));
          setShowDeleteConfirm(false);
          toast('Group deleted');
          onBack();
        }}
      />
    </div>
  );
};

export default GroupDashboard;
