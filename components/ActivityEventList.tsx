import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Filter, Plus, Search, Trash2, X } from 'lucide-react';
import type { CalendarEvent, Course, UniCalendar } from '../types';
import DatePicker from './DatePicker';
import ConfirmDialog from './ConfirmDialog';

type EventFilterMode = 'upcoming' | 'today' | 'week' | 'past';
type ExamFilterMode = 'upcoming' | 'past';
type ExamKindFilter = 'all' | 'exam' | 'quiz';
type EditTab = 'details' | 'schedule';

type Draft = {
  title: string;
  courseId: string;
  calendarId: string;
  examKind: 'exam' | 'quiz';
  examWeightPercent: string;
  examTotalMarks: string;
  location: string;
  notes: string;
  startYmd: string;
  startTime: string;
  endYmd: string;
  endTime: string;
  recurrenceMode: 'none' | 'daily' | 'weekly';
  intervalDays: string;
  intervalWeeks: string;
  byWeekday: number[];
  untilYmd: string;
};

type Props = {
  mode: 'events' | 'exams';
  events: CalendarEvent[];
  courses: Course[];
  calendars: UniCalendar[];
  onAdd: (event: Omit<CalendarEvent, 'id'>) => void;
  onChange: (events: CalendarEvent[]) => void;
};

const WEEKDAYS = [
  { iso: 1, label: 'Mon' },
  { iso: 2, label: 'Tue' },
  { iso: 3, label: 'Wed' },
  { iso: 4, label: 'Thu' },
  { iso: 5, label: 'Fri' },
  { iso: 6, label: 'Sat' },
  { iso: 7, label: 'Sun' },
] as const;

function toYmd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function toHm(d: Date) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function isoWeekday(d: Date) {
  const js = d.getDay();
  return js === 0 ? 7 : js;
}

const ActivityEventList: React.FC<Props> = ({ mode, events, courses, calendars, onAdd, onChange }) => {
  const isExamMode = mode === 'exams';
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<EventFilterMode | ExamFilterMode>('upcoming');
  const [filterOpen, setFilterOpen] = useState(false);
  const [nextRecurringOnly, setNextRecurringOnly] = useState(false);
  const [examKindFilter, setExamKindFilter] = useState<ExamKindFilter>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<CalendarEvent | null>(null);
  const [showSeriesDeleteConfirm, setShowSeriesDeleteConfirm] = useState(false);
  const [editTab, setEditTab] = useState<EditTab>('details');
  const [assignMenuOpen, setAssignMenuOpen] = useState(false);
  const assignButtonRef = useRef<HTMLButtonElement | null>(null);
  const assignMenuRef = useRef<HTMLDivElement | null>(null);

  const courseCalendarIds = useMemo(
    () => new Set(courses.map(c => c.calendarId).filter((id): id is string => Boolean(id))),
    [courses]
  );
  const personalCalendars = useMemo(
    () => calendars.filter(c => !courseCalendarIds.has(c.id)),
    [calendars, courseCalendarIds]
  );

  const createDefaultDraft = (): Draft => {
    const now = new Date();
    const start = new Date(now);
    const step = 15;
    const mins = start.getMinutes();
    const snap = Math.ceil(mins / step) * step;
    start.setMinutes(snap % 60, 0, 0);
    if (snap >= 60) start.setHours(start.getHours() + 1);
    const end = new Date(start);
    end.setHours(end.getHours() + 1);

    return {
      title: '',
      courseId: '',
      calendarId: '',
      examKind: 'exam',
      examWeightPercent: '',
      examTotalMarks: '',
      location: '',
      notes: '',
      startYmd: toYmd(start),
      startTime: toHm(start),
      endYmd: toYmd(end),
      endTime: toHm(end),
      recurrenceMode: 'none',
      intervalDays: '1',
      intervalWeeks: '1',
      byWeekday: [isoWeekday(start)],
      untilYmd: '',
    };
  };

  const [draft, setDraft] = useState<Draft>(createDefaultDraft);

  const addLabel = isExamMode ? 'Add Exam' : 'Add Event';
  const emptyLabel = isExamMode ? 'No exams yet' : 'No events yet';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byQuery = !q
      ? events
      : events.filter(e => {
          const course = e.courseId ? courses.find(c => c.id === e.courseId) : null;
          return (
            e.title.toLowerCase().includes(q) ||
            (e.location ?? '').toLowerCase().includes(q) ||
            (e.notes ?? '').toLowerCase().includes(q) ||
            (course?.code ?? '').toLowerCase().includes(q) ||
            (course?.name ?? '').toLowerCase().includes(q)
          );
        });

    const now = new Date();
    const endOfWeek = new Date(now);
    endOfWeek.setDate(now.getDate() + ((7 - now.getDay()) % 7));
    endOfWeek.setHours(23, 59, 59, 999);

    let byTime = byQuery;
    if (filter === 'past') byTime = byQuery.filter(e => new Date(e.endTime).getTime() < now.getTime());
    else if (filter === 'upcoming') byTime = byQuery.filter(e => new Date(e.endTime).getTime() >= now.getTime());
    else if (filter === 'today') {
      byTime = byQuery.filter(e => {
        const start = new Date(e.startTime);
        return (
          start.getFullYear() === now.getFullYear() &&
          start.getMonth() === now.getMonth() &&
          start.getDate() === now.getDate()
        );
      });
    } else if (filter === 'week') {
      byTime = byQuery.filter(e => {
        const start = new Date(e.startTime).getTime();
        return start >= now.getTime() && start <= endOfWeek.getTime();
      });
    }

    if (isExamMode) {
      if (examKindFilter === 'all') return byTime;
      return byTime.filter(e => {
        const kind = e.examKind ?? (/\bquiz\b/i.test(e.title) ? 'quiz' : 'exam');
        return examKindFilter === kind;
      });
    }

    if (!nextRecurringOnly) return byTime;

    const recurring = byTime.filter(e => e.recurrence && e.recurrence.frequency !== 'none');
    const groups = new Map<string, CalendarEvent[]>();
    const getRecurringBaseId = (id: string) => id.replace(/_\d{4}-\d{1,2}-\d{1,2}$/, '');

    for (const ev of recurring) {
      const key = getRecurringBaseId(ev.id);
      const list = groups.get(key);
      if (list) list.push(ev);
      else groups.set(key, [ev]);
    }

    const collapsedRecurring: CalendarEvent[] = [];
    for (const list of groups.values()) {
      const sorted = list.slice().sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
      const next = sorted.find(ev => new Date(ev.endTime).getTime() >= now.getTime());
      collapsedRecurring.push(next ?? sorted[sorted.length - 1]);
    }

    return collapsedRecurring.sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );
  }, [events, courses, query, filter, nextRecurringOnly, isExamMode, examKindFilter]);

  const draftStart = useMemo(() => new Date(`${draft.startYmd}T${draft.startTime || '00:00'}`), [draft.startYmd, draft.startTime]);
  const draftEnd = useMemo(() => new Date(`${draft.endYmd}T${draft.endTime || '00:00'}`), [draft.endYmd, draft.endTime]);
  const modalTitle = draft.title.trim() || (isExamMode ? 'New exam' : 'New event');
  const modalSub = Number.isNaN(draftStart.getTime()) || Number.isNaN(draftEnd.getTime())
    ? ''
    : `${draftStart.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} • ${draftStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}-${draftEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  const openCreate = () => {
    setEditTab('details');
    setAssignMenuOpen(false);
    setDraft(createDefaultDraft());
    setShowAddModal(true);
  };

  useEffect(() => {
    if (!assignMenuOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (assignButtonRef.current?.contains(target)) return;
      if (assignMenuRef.current?.contains(target)) return;
      setAssignMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [assignMenuOpen]);

  const assignGroups = useMemo(
    () => (personalCalendars.length > 0 ? personalCalendars : calendars),
    [personalCalendars, calendars]
  );

  const assignLabel = useMemo(() => {
    if (draft.courseId) {
      const course = courses.find(c => c.id === draft.courseId);
      return course ? `${course.code} — ${course.name}` : 'Select assignment target';
    }
    if (draft.calendarId) {
      const group = assignGroups.find(c => c.id === draft.calendarId);
      return group?.name ?? 'Select assignment target';
    }
    return 'Independent task';
  }, [draft.courseId, draft.calendarId, courses, assignGroups]);

  const submit = () => {
    if (!draft.title.trim() || !draft.startYmd || !draft.endYmd) return;
    const start = new Date(`${draft.startYmd}T${draft.startTime || '00:00'}`);
    const end = new Date(`${draft.endYmd}T${draft.endTime || '00:00'}`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) return;

    const effectiveCourseId = draft.courseId;
    const selectedCourse = courses.find(c => c.id === effectiveCourseId);
    const calendarId = effectiveCourseId
      ? (selectedCourse?.calendarId ?? draft.calendarId ?? calendars[0]?.id ?? 'default')
      : (draft.calendarId || personalCalendars[0]?.id || calendars[0]?.id || 'default');

    onAdd({
      title: draft.title.trim(),
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      calendarId,
      courseId: effectiveCourseId || undefined,
      location: draft.location.trim() || undefined,
      notes: draft.notes.trim() || undefined,
      source: isExamMode ? 'exam' : 'manual',
      examKind: isExamMode ? draft.examKind : undefined,
      examWeightPercent: isExamMode && draft.examWeightPercent.trim() !== '' ? Number(draft.examWeightPercent) : undefined,
      examTotalMarks: isExamMode && draft.examTotalMarks.trim() !== '' ? Number(draft.examTotalMarks) : undefined,
      recurrence: isExamMode
        ? undefined
        : draft.recurrenceMode === 'none'
          ? undefined
          : draft.recurrenceMode === 'daily'
            ? {
                frequency: 'daily',
                intervalDays: Math.max(1, Number(draft.intervalDays) || 1),
                until: draft.untilYmd ? new Date(`${draft.untilYmd}T23:59:59`).toISOString() : undefined,
              }
            : {
                frequency: 'weekly',
                byWeekday: draft.byWeekday.length > 0 ? draft.byWeekday : [isoWeekday(start)],
                intervalWeeks: Math.max(1, Number(draft.intervalWeeks) || 1),
                until: draft.untilYmd ? new Date(`${draft.untilYmd}T23:59:59`).toISOString() : undefined,
              },
    });

    setShowAddModal(false);
    setAssignMenuOpen(false);
    setDraft(createDefaultDraft());
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={`Search ${mode}...`}
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              type="button"
              onClick={() => setFilterOpen(v => !v)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
            >
              <Filter className="w-4 h-4" />
              Filter
            </button>

            {filterOpen && (
              <>
                <button type="button" className="fixed inset-0 z-40 cursor-default" onClick={() => setFilterOpen(false)} aria-label="Close filter" />
                <div className="absolute right-0 mt-2 w-52 z-50 bg-white border border-slate-200 rounded-2xl shadow-lg overflow-hidden">
                  {isExamMode ? (
                    <>
                      {(
                        [
                          { id: 'upcoming' as const, label: 'Upcoming' },
                          { id: 'past' as const, label: 'Past' },
                        ]
                      ).map(opt => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setFilter(opt.id)}
                          className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors ${
                            filter === opt.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                      <div className="border-t border-slate-100" />
                      {(
                        [
                          { id: 'all' as const, label: 'All types' },
                          { id: 'exam' as const, label: 'Exam' },
                          { id: 'quiz' as const, label: 'Quiz' },
                        ]
                      ).map(opt => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setExamKindFilter(opt.id)}
                          className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors ${
                            examKindFilter === opt.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setNextRecurringOnly(v => !v)}
                        className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors ${
                          nextRecurringOnly ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        Next recurring only
                      </button>
                      <div className="border-t border-slate-100" />
                      {(
                        [
                          { id: 'upcoming' as const, label: 'Upcoming' },
                          { id: 'today' as const, label: 'Today' },
                          { id: 'week' as const, label: 'This week' },
                          { id: 'past' as const, label: 'Past' },
                        ]
                      ).map(opt => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            setFilter(opt.id);
                            setFilterOpen(false);
                          }}
                          className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors ${
                            filter === opt.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-all"
          >
            <Plus className="w-4 h-4" />
            {addLabel}
          </button>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm py-20 px-6 text-center">
          <h3 className="text-lg font-semibold text-slate-800">{emptyLabel}</h3>
          <p className="text-sm text-slate-500 mt-2">Click "{addLabel}" to create your first {mode.slice(0, -1)}.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm py-16 px-6 text-center">
          <h3 className="text-lg font-semibold text-slate-800">No matching {mode}</h3>
          <p className="text-sm text-slate-500 mt-2">Try adjusting your search or filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(e => {
            const course = e.courseId ? courses.find(c => c.id === e.courseId) : null;
            return (
              <div key={e.id} className="text-left bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${course?.color || 'bg-slate-400'}`} />
                      <span className="text-xs font-medium text-slate-500">{course?.code ?? 'No course'}</span>
                    </div>
                    <div className="font-bold text-slate-800 mt-1 truncate">{e.title}</div>
                    <div className="text-xs text-slate-500 mt-2">
                      {new Date(e.startTime).toLocaleString()} - {new Date(e.endTime).toLocaleTimeString()}
                    </div>
                    {e.location ? <div className="text-xs text-slate-500 mt-1 truncate">{e.location}</div> : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingDelete(e);
                      setShowSeriesDeleteConfirm(Boolean(e.recurrence && e.recurrence.frequency !== 'none'));
                    }}
                    className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:text-rose-600 transition-colors"
                    title={`Delete ${mode.slice(0, -1)}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]" onClick={() => setShowAddModal(false)} aria-hidden="true" />
          <div className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-indigo-700">
                  {isExamMode ? 'Exam' : 'Event'}
                </div>
                <div className="mt-2 text-2xl leading-tight font-bold text-slate-900 truncate">{modalTitle}</div>
                {modalSub && <div className="mt-1 text-base text-slate-500">{modalSub}</div>}
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4 max-h-[72vh] overflow-y-auto">
              <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
                <button
                  type="button"
                  onClick={() => setEditTab('details')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                    editTab === 'details' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Details
                </button>
                <button
                  type="button"
                  onClick={() => setEditTab('schedule')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                    editTab === 'schedule' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Schedule
                </button>
              </div>

              {editTab === 'details' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
                    <input
                      value={draft.title}
                      onChange={e => setDraft({ ...draft, title: e.target.value })}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>

                  {isExamMode && (
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-2">Assessment type</label>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setDraft({ ...draft, examKind: 'exam' })}
                          className={`px-3 py-2 rounded-xl border text-sm font-semibold transition-colors ${
                            draft.examKind === 'exam'
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          Exam
                        </button>
                        <button
                          type="button"
                          onClick={() => setDraft({ ...draft, examKind: 'quiz' })}
                          className={`px-3 py-2 rounded-xl border text-sm font-semibold transition-colors ${
                            draft.examKind === 'quiz'
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          Quiz
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="md:col-span-2 bg-indigo-50 border border-indigo-200 rounded-2xl p-4">
                    <label className="block text-sm font-semibold text-slate-800 mb-2">Assign to</label>
                    <div className="relative">
                      <button
                        ref={assignButtonRef}
                        type="button"
                        onClick={() => setAssignMenuOpen(v => !v)}
                        className="w-full flex items-center justify-between gap-3 px-4 py-2 border border-indigo-200 rounded-xl bg-white text-sm text-slate-800 hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                      >
                        <span className="min-w-0 flex items-center gap-2 truncate">
                          {draft.courseId ? (
                            <span className={`w-2.5 h-2.5 rounded-full ${courses.find(c => c.id === draft.courseId)?.color || 'bg-slate-300'}`} />
                          ) : draft.calendarId ? (
                            <span className={`w-2.5 h-2.5 rounded-full ${assignGroups.find(g => g.id === draft.calendarId)?.color || 'bg-slate-300'}`} />
                          ) : (
                            <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                          )}
                          <span className="truncate">{assignLabel}</span>
                        </span>
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      </button>

                      {assignMenuOpen && (
                        <div ref={assignMenuRef} className="absolute z-40 mt-2 w-full bg-white border border-slate-200 rounded-2xl shadow-lg p-2">
                          <button
                            type="button"
                            onClick={() => {
                              setDraft({ ...draft, courseId: '', calendarId: '' });
                              setAssignMenuOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                              !draft.courseId && !draft.calendarId ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            Independent task
                          </button>

                          {courses.length > 0 && (
                            <>
                              <div className="mt-1 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Courses</div>
                              {courses.map(c => {
                                const active = draft.courseId === c.id;
                                return (
                                  <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => {
                                      setDraft({ ...draft, courseId: c.id, calendarId: c.calendarId ?? draft.calendarId });
                                      setAssignMenuOpen(false);
                                    }}
                                    className={`w-full flex items-center gap-2 text-left px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                                      active ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50'
                                    }`}
                                  >
                                    <span className={`w-2.5 h-2.5 rounded-full ${c.color || 'bg-slate-300'}`} />
                                    <span className="truncate">{c.code} — {c.name}</span>
                                  </button>
                                );
                              })}
                            </>
                          )}

                          {assignGroups.length > 0 && (
                            <>
                              <div className="mt-1 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Personal groups</div>
                              {assignGroups.map(group => {
                                const active = !draft.courseId && draft.calendarId === group.id;
                                return (
                                  <button
                                    key={group.id}
                                    type="button"
                                    onClick={() => {
                                      setDraft({ ...draft, courseId: '', calendarId: group.id });
                                      setAssignMenuOpen(false);
                                    }}
                                    className={`w-full flex items-center gap-2 text-left px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                                      active ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50'
                                    }`}
                                  >
                                    <span className={`w-2.5 h-2.5 rounded-full ${group.color || 'bg-slate-300'}`} />
                                    <span className="truncate">{group.name}</span>
                                  </button>
                                );
                              })}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {isExamMode && (
                    <div className="md:col-span-2 bg-indigo-50 border border-indigo-200 rounded-2xl p-4">
                      <div className="text-sm font-semibold text-slate-800 mb-3">Grading</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Weighting (%)</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="e.g. 30"
                            value={draft.examWeightPercent}
                            onChange={e => setDraft({ ...draft, examWeightPercent: e.target.value.replace(/[^0-9.]/g, '') })}
                            className="w-full px-4 py-2 border border-indigo-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Total marks</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="e.g. 100"
                            value={draft.examTotalMarks}
                            onChange={e => setDraft({ ...draft, examTotalMarks: e.target.value.replace(/[^0-9.]/g, '') })}
                            className="w-full px-4 py-2 border border-indigo-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Location</label>
                    <input
                      value={draft.location}
                      onChange={e => setDraft({ ...draft, location: e.target.value })}
                      placeholder="Optional"
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                    <textarea
                      value={draft.notes}
                      onChange={e => setDraft({ ...draft, notes: e.target.value })}
                      placeholder="Add notes..."
                      className="w-full min-h-[140px] px-4 py-3 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                    <div className="text-sm font-semibold text-slate-800 mb-3">Time</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Start date</label>
                        <DatePicker value={draft.startYmd} onChange={(ymd) => setDraft({ ...draft, startYmd: ymd })} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">End date</label>
                        <DatePicker value={draft.endYmd} min={draft.startYmd || undefined} onChange={(ymd) => setDraft({ ...draft, endYmd: ymd })} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Start time</label>
                        <input
                          type="time"
                          value={draft.startTime}
                          onChange={e => setDraft({ ...draft, startTime: e.target.value })}
                          className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">End time</label>
                        <input
                          type="time"
                          value={draft.endTime}
                          onChange={e => setDraft({ ...draft, endTime: e.target.value })}
                          className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        />
                      </div>
                    </div>
                  </div>

                  {!isExamMode && (
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                      <div className="text-sm font-semibold text-slate-800">Repeats</div>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => setDraft({ ...draft, recurrenceMode: 'none' })}
                          className={`px-3 py-2 rounded-xl border text-xs font-bold uppercase tracking-wider transition-colors ${
                            draft.recurrenceMode === 'none'
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          None
                        </button>
                        <button
                          type="button"
                          onClick={() => setDraft({ ...draft, recurrenceMode: 'daily' })}
                          className={`px-3 py-2 rounded-xl border text-xs font-bold uppercase tracking-wider transition-colors ${
                            draft.recurrenceMode === 'daily'
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          Daily
                        </button>
                        <button
                          type="button"
                          onClick={() => setDraft({ ...draft, recurrenceMode: 'weekly' })}
                          className={`px-3 py-2 rounded-xl border text-xs font-bold uppercase tracking-wider transition-colors ${
                            draft.recurrenceMode === 'weekly'
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          Weekly
                        </button>
                      </div>

                      {draft.recurrenceMode === 'daily' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Every</label>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min={1}
                                step={1}
                                value={draft.intervalDays}
                                onChange={e => setDraft({ ...draft, intervalDays: e.target.value })}
                                className="w-24 px-4 py-2 border border-slate-200 rounded-xl"
                              />
                              <span className="text-sm text-slate-600">days</span>
                            </div>
                          </div>
                          <div>
                            <DatePicker
                              label="Until (optional)"
                              value={draft.untilYmd}
                              onChange={(next) => setDraft({ ...draft, untilYmd: next })}
                              placeholder="No end"
                            />
                          </div>
                        </div>
                      )}

                      {draft.recurrenceMode === 'weekly' && (
                        <>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Repeat on</label>
                            <div className="flex flex-wrap gap-2">
                              {WEEKDAYS.map(d => {
                                const active = draft.byWeekday.includes(d.iso);
                                return (
                                  <button
                                    key={d.iso}
                                    type="button"
                                    onClick={() => {
                                      const has = draft.byWeekday.includes(d.iso);
                                      const next = has ? draft.byWeekday.filter(x => x !== d.iso) : [...draft.byWeekday, d.iso];
                                      setDraft({ ...draft, byWeekday: next });
                                    }}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                                      active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                    }`}
                                  >
                                    {d.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-slate-700 mb-1">Every</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={1}
                                  step={1}
                                  value={draft.intervalWeeks}
                                  onChange={e => setDraft({ ...draft, intervalWeeks: e.target.value })}
                                  className="w-24 px-4 py-2 border border-slate-200 rounded-xl"
                                />
                                <span className="text-sm text-slate-600">weeks</span>
                              </div>
                            </div>
                            <div>
                              <DatePicker
                                label="Until (optional)"
                                value={draft.untilYmd}
                                onChange={(next) => setDraft({ ...draft, untilYmd: next })}
                                placeholder="No end"
                              />
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-white flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={`Delete ${mode.slice(0, -1)}?`}
        message={
          pendingDelete
            ? showSeriesDeleteConfirm
              ? `"${pendingDelete.title}" is recurring. Delete all in the series or only this one?`
              : `This will permanently delete "${pendingDelete.title}".`
            : ''
        }
        confirmLabel={showSeriesDeleteConfirm ? 'Delete all' : `Delete ${mode.slice(0, -1)}`}
        secondaryLabel={showSeriesDeleteConfirm ? 'Delete this one' : undefined}
        onSecondary={
          showSeriesDeleteConfirm
            ? () => {
                if (!pendingDelete) return;
                onChange(events.filter(x => x.id !== pendingDelete.id));
                setPendingDelete(null);
                setShowSeriesDeleteConfirm(false);
              }
            : undefined
        }
        onCancel={() => {
          setPendingDelete(null);
          setShowSeriesDeleteConfirm(false);
        }}
        onConfirm={() => {
          if (!pendingDelete) return;
          if (showSeriesDeleteConfirm) {
            const key = pendingDelete.id.replace(/_\d{4}-\d{1,2}-\d{1,2}$/, '');
            onChange(events.filter(x => x.id.replace(/_\d{4}-\d{1,2}-\d{1,2}$/, '') !== key));
          } else {
            onChange(events.filter(x => x.id !== pendingDelete.id));
          }
          setPendingDelete(null);
          setShowSeriesDeleteConfirm(false);
        }}
      />
    </div>
  );
};

export default ActivityEventList;
