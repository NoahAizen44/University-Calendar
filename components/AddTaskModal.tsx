import React, { useMemo, useRef, useState } from 'react';
import { X, CheckSquare, ChevronDown, Upload, Paperclip, Trash2 } from 'lucide-react';
import { Assignment, AssignmentAttachment, Course, Priority, RecurringTask } from '../types';
import DatePicker from './DatePicker';
import { uid } from '../services/id';
import { putBlob, getBlob, deleteBlob } from '../services/idb';
import { toast } from '../services/toast';

const INDEPENDENT_COURSE_ID = '__independent__';

type Step = 'details' | 'schedule';

type RecurrenceMode = 'none' | 'daily' | 'weekly';

type Draft = {
  title: string;
  courseId: string;
  dueDate: string; // yyyy-mm-dd (also used as series start)
  dueTime: string; // HH:MM or ''
  priority: Priority;
  repeats: boolean;
  recurrenceMode: RecurrenceMode;
  intervalDays: string; // keep as string for input
  byWeekday: number[]; // 1=Mon..7=Sun
  intervalWeeks: string; // keep as string for input
  untilYmd: string; // yyyy-mm-dd
  isGraded: boolean;
  weightPercent: string; // keep as string for input
  pointsPossible: string;
  description: string;
  attachments: AssignmentAttachment[];
};

const WEEKDAYS: Array<{ iso: number; label: string }> = [
  { iso: 1, label: 'Mon' },
  { iso: 2, label: 'Tue' },
  { iso: 3, label: 'Wed' },
  { iso: 4, label: 'Thu' },
  { iso: 5, label: 'Fri' },
  { iso: 6, label: 'Sat' },
  { iso: 7, label: 'Sun' },
];

function isoWeekdayFromYmd(ymd: string): number {
  // JS getDay: 0=Sun..6=Sat
  const d = new Date(ymd);
  const js = d.getDay();
  return js === 0 ? 7 : js;
}

export interface AddTaskModalProps {
  open: boolean;
  courses: Course[];
  initialCourseId?: string;
  onClose: () => void;
  onCreate: (item: Omit<Assignment, 'id'> | Omit<RecurringTask, 'id'>) => void;
}

const priorityUi: Array<{ value: Priority; label: string; classes: string }> = [
  { value: 'low', label: 'Low', classes: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
  { value: 'medium', label: 'Med', classes: 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100' },
  { value: 'high', label: 'High', classes: 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100' },
];

const AddTaskModal: React.FC<AddTaskModalProps> = ({ open, courses, initialCourseId, onClose, onCreate }) => {
  const defaultCourseId = useMemo(
    () => initialCourseId ?? courses[0]?.id ?? INDEPENDENT_COURSE_ID,
    [initialCourseId, courses]
  );

  const [step, setStep] = useState<Step>('details');
  const [courseMenuOpen, setCourseMenuOpen] = useState(false);
  const courseMenuRef = useRef<HTMLDivElement | null>(null);
  const courseButtonRef = useRef<HTMLButtonElement | null>(null);
  const [courseMenuPos, setCourseMenuPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const [draft, setDraft] = useState<Draft>({
    title: '',
    courseId: defaultCourseId,
    dueDate: '',
    dueTime: '',
    priority: 'medium',
    repeats: false,
  recurrenceMode: 'none',
    intervalDays: '1',
    byWeekday: [1],
    intervalWeeks: '1',
    untilYmd: '',
    isGraded: false,
    weightPercent: '',
    pointsPossible: '',
    description: '',
    attachments: [],
  });

  // When opened with a different initial course, sync draft.
  React.useEffect(() => {
    if (!open) return;
    setStep('details');
    setCourseMenuOpen(false);
    setCourseMenuPos(null);
    setDraft(prev => ({
      ...prev,
      title: '',
      courseId: defaultCourseId,
      dueDate: '',
      dueTime: '',
      priority: 'medium',
      repeats: false,
  recurrenceMode: 'none',
      intervalDays: '1',
      byWeekday: [1],
      intervalWeeks: '1',
      untilYmd: '',
      isGraded: false,
      weightPercent: '',
      pointsPossible: '',
      description: '',
      attachments: [],
    }));
  }, [open, defaultCourseId]);

  // Close the dropdown when clicking outside.
  React.useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (!courseMenuRef.current) return;
      if (!courseMenuRef.current.contains(e.target as Node)) setCourseMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  // Position the floating menu when opened.
  React.useEffect(() => {
    if (!open) return;
    if (!courseMenuOpen) return;
    const el = courseButtonRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setCourseMenuPos({ left: r.left, top: r.bottom + 8, width: r.width });
  }, [open, courseMenuOpen]);

  if (!open) return null;

  const courseLocked = Boolean(initialCourseId);
  const selectedCourse = courses.find(c => c.id === draft.courseId);
  const isIndependent = draft.courseId === INDEPENDENT_COURSE_ID;

  const canContinueDetails = draft.title.trim().length > 0 && draft.courseId;
  const canContinueSchedule = Boolean(draft.dueDate) && (
    !draft.repeats || draft.recurrenceMode === 'none'
      ? true
      : draft.recurrenceMode === 'daily'
        ? (draft.intervalDays === '' || Number(draft.intervalDays) >= 1)
        : draft.byWeekday.length > 0 && (draft.intervalWeeks === '' || Number(draft.intervalWeeks) >= 1)
  );
  const submit = () => {
    if (!draft.title.trim()) return;
    if (!draft.courseId) return;
    if (!draft.dueDate) return;

    const dueIso = new Date(draft.dueDate).toISOString();

    const isGraded = draft.isGraded;
    const weightPercent = isGraded && draft.weightPercent !== '' ? Number(draft.weightPercent) : undefined;
    const pointsPossible = isGraded && draft.pointsPossible !== '' ? Number(draft.pointsPossible) : undefined;

    const courseIdForSave = draft.courseId === INDEPENDENT_COURSE_ID ? '' : draft.courseId;

    const attachments = draft.attachments.length > 0 ? draft.attachments : undefined;
    const dueTime = draft.dueTime.trim() ? draft.dueTime.trim() : undefined;

    if (!draft.repeats || draft.recurrenceMode === 'none') {
      onCreate({
        title: draft.title.trim(),
        courseId: courseIdForSave,
        dueDate: dueIso,
        dueTime,
        priority: draft.priority,
        completed: false,
        estimatedHours: 1, // kept for backwards compatibility; UI does not expose it.
        description: draft.description.trim() ? draft.description.trim() : undefined,
        attachments,
        isGraded,
        weightPercent,
        pointsPossible,
        // pointsEarned intentionally empty until returned
      });
    } else {
      const intervalWeeks = draft.intervalWeeks !== '' ? Math.max(1, Number(draft.intervalWeeks) || 1) : 1;
      const intervalDays = draft.intervalDays !== '' ? Math.max(1, Number(draft.intervalDays) || 1) : 1;

      const byWeekday = draft.byWeekday.length > 0
        ? draft.byWeekday
        : [isoWeekdayFromYmd(draft.dueDate)];
      const nowIso = new Date().toISOString();

      onCreate({
        title: draft.title.trim(),
        courseId: courseIdForSave,
        priority: draft.priority,
        description: draft.description.trim() ? draft.description.trim() : undefined,
        attachments,
        isGraded,
        weightPercent,
        pointsPossible,
        rule: {
          frequency: draft.recurrenceMode === 'daily' ? 'daily' : 'weekly',
          intervalDays: draft.recurrenceMode === 'daily' ? intervalDays : undefined,
          byWeekday: draft.recurrenceMode === 'daily' ? undefined : byWeekday,
          intervalWeeks: draft.recurrenceMode === 'daily' ? undefined : intervalWeeks,
          timeOfDay: dueTime,
          dueTime,
          startYmd: draft.dueDate,
          untilYmd: draft.untilYmd.trim() ? draft.untilYmd.trim() : undefined,
        },
        completed: {},
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }

    onClose();
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const now = new Date().toISOString();
    const created: AssignmentAttachment[] = [];
    for (const file of Array.from(files)) {
      const blobId = uid('blob');
      await putBlob(blobId, file);
      created.push({
        id: uid('att'),
        name: file.name,
        createdAt: now,
        blobId,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
      });
    }
    setDraft(prev => ({ ...prev, attachments: [...prev.attachments, ...created] }));
  };

  const openAttachment = async (att: AssignmentAttachment) => {
    const blob = await getBlob(att.blobId);
    if (!blob) {
      toast('File attachment is missing. It may have been cleared from local storage.');
      return;
    }
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const removeAttachment = async (att: AssignmentAttachment) => {
    await deleteBlob(att.blobId);
    setDraft(prev => ({ ...prev, attachments: prev.attachments.filter(x => x.id !== att.id) }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />

      {courseMenuOpen && !courseLocked && courseMenuPos && (
        <div
          className="fixed z-[60]"
          style={{ left: courseMenuPos.left, top: courseMenuPos.top, width: courseMenuPos.width }}
          role="listbox"
        >
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div
              className="p-1"
              style={{ maxHeight: 280, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}
            >
              <button
                type="button"
                role="option"
                aria-selected={isIndependent}
                onClick={() => {
                  setDraft({ ...draft, courseId: INDEPENDENT_COURSE_ID });
                  setCourseMenuOpen(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-colors ${
                  isIndependent ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="font-semibold">Independent assignment</div>
                <div className={`text-xs ${isIndependent ? 'text-indigo-100' : 'text-slate-400'}`}>
                  Personal / non-university
                </div>
              </button>

              <div className="my-1 border-t border-slate-100" />

              {courses.map(c => {
                const active = c.id === draft.courseId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      setDraft({ ...draft, courseId: c.id });
                      setCourseMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-colors ${
                      active ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${c.color || 'bg-slate-300'}`} />
                      <div className="font-semibold">{c.code}</div>
                    </div>
                    <div className={`text-xs ${active ? 'text-indigo-100' : 'text-slate-400'}`}>{c.name}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <div className="inline-flex items-center px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-[11px] font-semibold uppercase tracking-wide">Assignment</div>
            <div className="text-xl font-bold text-slate-900 mt-2">Add assignment</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 max-h-[72vh] overflow-y-auto">
          {/* Step breadcrumbs */}
          <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 mb-5">
            {([
              { key: 'details', label: 'Details' },
              { key: 'schedule', label: 'Schedule' },
            ] as const).map(item => (
              <span
                key={item.key}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
                  step === item.key ? 'bg-indigo-600 text-white' : 'text-slate-500'
                }`}
              >
                {item.label}
              </span>
            ))}
          </div>

          {step === 'details' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Assignment name</label>
                <input
                  autoFocus
                  required
                  value={draft.title}
                  onChange={e => setDraft({ ...draft, title: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  placeholder=""
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Course</label>
                <div ref={courseMenuRef} className="relative">
                  <button
                    type="button"
                    ref={courseButtonRef}
                    disabled={courseLocked}
                    onClick={() => setCourseMenuOpen(v => !v)}
                    className={`w-full flex items-center justify-between gap-3 pl-4 pr-3 py-2 border rounded-xl text-sm transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 ${
                      courseLocked
                        ? 'bg-slate-50 text-slate-500 border-slate-200 cursor-not-allowed'
                        : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300'
                    }`}
                    aria-haspopup="listbox"
                    aria-expanded={courseMenuOpen}
                  >
                    <span className="min-w-0 flex items-center gap-2 truncate">
                      {!isIndependent && selectedCourse?.color && (
                        <span className={`w-2.5 h-2.5 rounded-full ${selectedCourse.color}`} />
                      )}
                      <span className="truncate">
                        {isIndependent
                          ? 'Independent assignment'
                          : selectedCourse
                            ? `${selectedCourse.code} — ${selectedCourse.name}`
                            : 'Select a course'}
                      </span>
                    </span>
                    <ChevronDown className={`w-4 h-4 ${courseLocked ? 'text-slate-300' : 'text-slate-400'}`} />
                  </button>

                </div>
                {selectedCourse && !isIndependent && (
                  <div className="text-xs text-slate-400 mt-1">Adding to <span className="font-semibold text-slate-600">{selectedCourse.code}</span></div>
                )}
                {isIndependent && (
                  <div className="text-xs text-slate-400 mt-1">This won’t be tied to a course.</div>
                )}
              </div>

              <div className="pt-2 text-xs text-slate-500">
                Details are entered manually in this flow.
              </div>
            </div>
          )}

          {step === 'schedule' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <DatePicker
                    label={!draft.repeats || draft.recurrenceMode === 'none' ? 'Due date' : 'Start (first due)'}
                    value={draft.dueDate}
                    onChange={(next) => {
                      setDraft(prev => {
                        const nextDraft: Draft = { ...prev, dueDate: next };
                        // If no weekdays chosen yet, default to the chosen date's weekday.
                        if (next && nextDraft.byWeekday.length === 0) {
                          nextDraft.byWeekday = [isoWeekdayFromYmd(next)];
                        }
                        return nextDraft;
                      });
                    }}
                    placeholder="Select date"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Due time (optional)</label>
                  <input
                    type="time"
                    value={draft.dueTime}
                    onChange={(e) => setDraft(prev => ({ ...prev, dueTime: e.target.value }))}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl"
                  />
                  <div className="text-xs text-slate-400 mt-2">Leave blank if there isn’t a specific time.</div>
                </div>
              </div>

              <div className="border border-slate-200 rounded-2xl p-4 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-800">Repeats</div>
                    <div className="text-xs text-slate-400">If yes, your assignment becomes a weekly/daily series.</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setDraft(prev => ({ ...prev, repeats: false, recurrenceMode: 'none' }))}
                      className={`px-3 py-2 rounded-xl border text-xs font-bold uppercase tracking-wider transition-colors ${
                        !draft.repeats
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      No
                    </button>
                    <button
                      type="button"
                      onClick={() => setDraft(prev => ({ ...prev, repeats: true, recurrenceMode: prev.recurrenceMode === 'none' ? 'weekly' : prev.recurrenceMode }))}
                      className={`px-3 py-2 rounded-xl border text-xs font-bold uppercase tracking-wider transition-colors ${
                        draft.repeats
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      Yes
                    </button>
                  </div>
                </div>
              </div>

              {draft.repeats && draft.recurrenceMode !== 'none' && (
                <div className="border border-slate-200 rounded-2xl p-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Repeat pattern</label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setDraft(prev => ({ ...prev, recurrenceMode: 'daily' }))}
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
                        onClick={() => setDraft(prev => ({ ...prev, recurrenceMode: 'weekly', intervalWeeks: '1' }))}
                        className={`px-3 py-2 rounded-xl border text-xs font-bold uppercase tracking-wider transition-colors ${
                          draft.recurrenceMode === 'weekly'
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        Weekly
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          toast('AI custom recurrence is coming soon. For now, use Daily or Weekly.');
                        }}
                        className="px-3 py-2 rounded-xl border text-xs font-bold uppercase tracking-wider bg-white text-slate-400 border-slate-200 cursor-not-allowed"
                        title="Coming soon"
                      >
                        AI Custom
                      </button>
                    </div>
                    <div className="text-xs text-slate-400 mt-2">
                      Daily supports “every other day” (2) or “every X days”. Weekly supports every N weeks + chosen weekdays.
                    </div>
                  </div>

                  {draft.recurrenceMode === 'daily' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Repeat every</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={draft.intervalDays}
                            onChange={e => setDraft(prev => ({ ...prev, intervalDays: e.target.value }))}
                            className="w-24 px-4 py-2 border border-slate-200 rounded-xl"
                            placeholder="1"
                          />
                          <div className="text-sm text-slate-600">days</div>
                        </div>
                        <div className="text-xs text-slate-400 mt-1">Example: 2 = every other day.</div>
                      </div>
                      <div>
                        <DatePicker
                          label="Ends (optional)"
                          value={draft.untilYmd}
                          onChange={(next) => setDraft(prev => ({ ...prev, untilYmd: next }))}
                          placeholder="No end"
                        />
                      </div>
                    </div>
                  )}

                  {draft.recurrenceMode === 'weekly' && (
                    <div>
                      <div className="text-sm font-semibold text-slate-800">Repeat on</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {WEEKDAYS.map(d => {
                          const active = draft.byWeekday.includes(d.iso);
                          return (
                            <button
                              key={d.iso}
                              type="button"
                              onClick={() => setDraft(prev => {
                                const has = prev.byWeekday.includes(d.iso);
                                const next = has ? prev.byWeekday.filter(x => x !== d.iso) : [...prev.byWeekday, d.iso];
                                return { ...prev, byWeekday: next };
                              })}
                              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                                active
                                  ? 'bg-indigo-600 text-white border-indigo-600'
                                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              {d.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {draft.recurrenceMode === 'weekly' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Repeat every</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={draft.intervalWeeks}
                            onChange={e => setDraft(prev => ({ ...prev, intervalWeeks: e.target.value }))}
                            className="w-24 px-4 py-2 border border-slate-200 rounded-xl"
                            placeholder="1"
                          />
                          <div className="text-sm text-slate-600">weeks</div>
                        </div>
                        <div className="text-xs text-slate-400 mt-1">Example: 2 = every other week.</div>
                      </div>
                      <div>
                        <DatePicker
                          label="Ends (optional)"
                          value={draft.untilYmd}
                          onChange={(next) => setDraft(prev => ({ ...prev, untilYmd: next }))}
                          placeholder="No end"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 'details' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
                  <div className="flex items-center gap-2">
                    {priorityUi.map(p => (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => setDraft({ ...draft, priority: p.value })}
                        className={`flex-1 px-3 py-2 rounded-xl border text-xs font-bold uppercase tracking-wider transition-colors ${p.classes} ${draft.priority === p.value ? 'ring-2 ring-indigo-500/20 border-indigo-300' : ''}`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="border border-slate-200 rounded-2xl p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <CheckSquare className="w-4 h-4 text-indigo-600" />
                    <div className="text-sm font-semibold text-slate-800">Counts toward grade?</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDraft(prev => ({ ...prev, isGraded: !prev.isGraded }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${draft.isGraded ? 'bg-indigo-600' : 'bg-slate-200'}`}
                    aria-pressed={draft.isGraded}
                    aria-label="Toggle graded assignment"
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${draft.isGraded ? 'translate-x-5' : 'translate-x-1'}`}
                    />
                  </button>
                </div>

                {draft.isGraded && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Weight (%)</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        required
                        value={draft.weightPercent}
                        onChange={e => setDraft({ ...draft, weightPercent: e.target.value })}
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl"
                        placeholder="e.g. 10"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Out of (optional)</label>
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={draft.pointsPossible}
                        onChange={e => setDraft({ ...draft, pointsPossible: e.target.value })}
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl"
                        placeholder="e.g. 20"
                      />
                    </div>
                  </div>
                )}
                <div className="text-xs text-slate-400 mt-3">You can fill the score later when it’s returned.</div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea
                  value={draft.description}
                  onChange={e => setDraft({ ...draft, description: e.target.value })}
                  className="w-full min-h-[120px] px-4 py-3 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm"
                  placeholder="Paste requirements, notes, links..."
                />
              </div>

              <div className="pt-2">
                <div className="text-sm font-semibold text-slate-800 mb-2">Resources (optional)</div>

                <label className="flex items-center justify-center gap-2 px-4 py-6 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors">
                  <Upload className="w-4 h-4 text-slate-500" />
                  <span className="text-sm font-semibold text-slate-700">Add files</span>
                  <input
                    type="file"
                    className="hidden"
                    multiple
                    onChange={(e) => uploadFiles(e.target.files)}
                  />
                </label>

                {draft.attachments.length > 0 && (
                  <div className="space-y-2 mt-3">
                    {draft.attachments.map(att => (
                      <div key={att.id} className="flex items-center justify-between gap-3 p-3 rounded-2xl border border-slate-200">
                        <div className="min-w-0 flex items-center gap-2">
                          <Paperclip className="w-4 h-4 text-slate-400" />
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-800 truncate">{att.name}</div>
                            <div className="text-xs text-slate-500">{Math.round(att.size / 1024)} KB</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openAttachment(att)}
                            className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200"
                          >
                            Open
                          </button>
                          <button
                            type="button"
                            onClick={() => removeAttachment(att)}
                            className="p-2 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100"
                            title="Remove"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="text-xs text-slate-400 mt-2">You can add more files later from the assignment details too.</div>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                if (step === 'details') onClose();
                else setStep('details');
              }}
              className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
            >
              {step === 'details' ? 'Cancel' : 'Back'}
            </button>

            {step === 'details' ? (
              <button
                type="button"
                disabled={!canContinueDetails}
                onClick={() => {
                  setStep('schedule');
                }}
                className={`px-4 py-2 text-sm font-medium text-white rounded-xl transition-colors ${
                  !canContinueDetails
                    ? 'bg-slate-300 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                disabled={!canContinueSchedule}
                onClick={submit}
                className={`px-4 py-2 text-sm font-medium text-white rounded-xl transition-colors ${
                  !canContinueSchedule ? 'bg-slate-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                Create assignment
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddTaskModal;
