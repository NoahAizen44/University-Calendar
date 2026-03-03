
import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Assignment, StudySession, Course, CalendarEvent, UniCalendar } from '../types';
import AssignmentEditModal from './AssignmentEditModal';
import AddTaskModal from './AddTaskModal';
import DatePicker from './DatePicker';
import { uid } from '../services/id';
import ConfirmDialog from './ConfirmDialog';
import { toast } from '../services/toast';

interface CalendarViewProps {
  assignments: Assignment[];
  studySessions: StudySession[];
  courses: Course[];
  events?: CalendarEvent[];
  calendars?: UniCalendar[];
  assignmentScope?: 'all' | 'academic' | 'personal';
  fullView?: boolean;
  initialAssignmentCourseId?: string;
  initialEventCourseId?: string;
  lockEventCourse?: boolean;
  onEventsChange?: (events: CalendarEvent[]) => void;
  onAssignmentsChange?: (assignments: Assignment[]) => void;
  onAddAssignment?: (assignment: Omit<Assignment, 'id'>) => void;
  onEventClick?: (event: CalendarEvent) => void;
}

type ViewMode = 'day' | 'week' | 'month' | 'year';

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function isSameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function startOfWeek(d: Date) {
  // Sunday-start week to match the UI labels.
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay(), 0, 0, 0, 0);
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatShortDate(d: Date) {
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function minutesSinceStartOfDay(d: Date) {
  return d.getHours() * 60 + d.getMinutes();
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function priorityRing(p: Assignment['priority']) {
  // Border outline reads cleaner than ring-inset on tight colored pills.
  if (p === 'low') return 'border-2 border-emerald-300';
  if (p === 'high') return 'border-2 border-rose-300';
  return 'border-2 border-amber-300';
}

function isoWeekday(d: Date) {
  const js = d.getDay();
  return js === 0 ? 7 : js;
}

function daysBetween(a: Date, b: Date) {
  const ms = startOfDay(b).getTime() - startOfDay(a).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

function getRecurringBaseId(id: string) {
  return id.replace(/_\d{4}-\d{1,2}-\d{1,2}$/, '');
}

const EVENT_WEEKDAYS: Array<{ iso: number; label: string }> = [
  { iso: 1, label: 'Mon' },
  { iso: 2, label: 'Tue' },
  { iso: 3, label: 'Wed' },
  { iso: 4, label: 'Thu' },
  { iso: 5, label: 'Fri' },
  { iso: 6, label: 'Sat' },
  { iso: 7, label: 'Sun' },
];

function expandDailyRecurrence(event: CalendarEvent, monthDate: Date): CalendarEvent[] {
  if (!event.recurrence || event.recurrence.frequency !== 'daily') return [event];

  const baseStart = new Date(event.startTime);
  const baseEnd = new Date(event.endTime);
  const durationMs = baseEnd.getTime() - baseStart.getTime();
  const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const until = event.recurrence.until ? new Date(event.recurrence.until) : null;
  const intervalDays = Math.max(1, event.recurrence.intervalDays ?? 1);

  const occurrences: CalendarEvent[] = [];
  for (let day = 1; day <= monthEnd.getDate(); day++) {
    const current = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
    const diff = daysBetween(baseStart, current);
    if (diff < 0) continue;
    if (diff % intervalDays !== 0) continue;

    const start = new Date(
      current.getFullYear(),
      current.getMonth(),
      current.getDate(),
      baseStart.getHours(),
      baseStart.getMinutes(),
      0,
      0
    );

    if (until && start.getTime() > until.getTime()) continue;

    const end = new Date(start.getTime() + durationMs);
    occurrences.push({
      ...event,
      id: `${event.id}_${monthDate.getFullYear()}-${monthDate.getMonth() + 1}-${day}`,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    });
  }

  return occurrences;
}

function expandWeeklyRecurrence(event: CalendarEvent, monthDate: Date): CalendarEvent[] {
  if (!event.recurrence || event.recurrence.frequency !== 'weekly') return [event];

  const baseStart = new Date(event.startTime);
  const baseEnd = new Date(event.endTime);
  const durationMs = baseEnd.getTime() - baseStart.getTime();
  const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const until = event.recurrence.until ? new Date(event.recurrence.until) : null;
  const intervalWeeks = Math.max(1, event.recurrence.intervalWeeks ?? 1);
  const byWeekday = event.recurrence.byWeekday && event.recurrence.byWeekday.length > 0
    ? event.recurrence.byWeekday
    : [isoWeekday(baseStart)];

  const occurrences: CalendarEvent[] = [];

  for (let day = 1; day <= monthEnd.getDate(); day++) {
    const current = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
    if (!byWeekday.includes(isoWeekday(current))) continue;

    if (intervalWeeks > 1) {
      const weeksDiff = Math.floor(daysBetween(baseStart, current) / 7);
      if (weeksDiff < 0) continue;
      if (weeksDiff % intervalWeeks !== 0) continue;
    }

    const start = new Date(
      current.getFullYear(),
      current.getMonth(),
      current.getDate(),
      baseStart.getHours(),
      baseStart.getMinutes(),
      0,
      0
    );

    if (until && start.getTime() > until.getTime()) continue;

    const end = new Date(start.getTime() + durationMs);
    occurrences.push({
      ...event,
      id: `${event.id}_${monthDate.getFullYear()}-${monthDate.getMonth() + 1}-${day}`,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
    });
  }

  return occurrences;
}

const CalendarView: React.FC<CalendarViewProps> = ({
  assignments,
  studySessions,
  courses,
  events = [],
  calendars = [],
  assignmentScope = 'all',
  fullView,
  initialAssignmentCourseId,
  initialEventCourseId,
  lockEventCourse = false,
  onEventsChange,
  onAssignmentsChange,
  onAddAssignment,
  onEventClick,
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>(fullView ? 'month' : 'month');

  const [createMenuOpen, setCreateMenuOpen] = useState(false);

  const [addAssignmentOpen, setAddAssignmentOpen] = useState(false);
  const addAssignmentInitialCourseId = initialAssignmentCourseId;

  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [pendingAssignmentDeleteSeriesChoice, setPendingAssignmentDeleteSeriesChoice] = useState<{
    assignmentId: string;
    title: string;
    seriesCount: number;
  } | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [showDeleteEventConfirm, setShowDeleteEventConfirm] = useState(false);
  const [showDeleteEventSeriesChoice, setShowDeleteEventSeriesChoice] = useState(false);
  const [quickAddDateYmd, setQuickAddDateYmd] = useState<string | null>(null);
  const [quickAddTitle, setQuickAddTitle] = useState('');
  const [draggingEventId, setDraggingEventId] = useState<string | null>(null);
  const [resizeState, setResizeState] = useState<{
    eventId: string;
    startY: number;
    startStartMs: number;
    startEndMs: number;
    pxPerHour: number;
  } | null>(null);
  const [resizePreviewEndMs, setResizePreviewEndMs] = useState<number | null>(null);
  const [eventEditTab, setEventEditTab] = useState<'details' | 'schedule'>('details');
  const [eventCourseMenuOpen, setEventCourseMenuOpen] = useState(false);
  const [eventCourseMenuPos, setEventCourseMenuPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const [eventCalendarMenuOpen, setEventCalendarMenuOpen] = useState(false);
  const [eventCalendarMenuPos, setEventCalendarMenuPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const eventCourseButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const eventCalendarButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const eventCourseMenuRef = React.useRef<HTMLDivElement | null>(null);
  const eventCalendarMenuRef = React.useRef<HTMLDivElement | null>(null);
  const [eventEditDraft, setEventEditDraft] = useState<{
    entryType: 'event' | 'exam';
    examKind: 'exam' | 'quiz';
    title: string;
    courseId: string;
    calendarId: string;
    shouldAssign: boolean;
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
  } | null>(null);

  const selectedAssignment = useMemo(
    () => (selectedAssignmentId ? assignments.find(a => a.id === selectedAssignmentId) ?? null : null),
    [assignments, selectedAssignmentId]
  );

  // Assignment edit UI is handled by the shared AssignmentEditModal.
  const deleteAssignment = (assignmentId: string, deleteAllInSeries: boolean) => {
    if (!onAssignmentsChange) return;
    const target = assignments.find(a => a.id === assignmentId);
    if (!target) return;
    if (deleteAllInSeries) {
      onAssignmentsChange(
        assignments.filter(a => !(
          a.courseId === target.courseId &&
          a.title.trim().toLowerCase() === target.title.trim().toLowerCase()
        ))
      );
    } else {
      onAssignmentsChange(assignments.filter(a => a.id !== assignmentId));
    }
    setSelectedAssignmentId(null);
    setPendingAssignmentDeleteSeriesChoice(null);
  };

  const selectedEvent = useMemo(
    () => {
      if (!selectedEventId) return null;
      const found = events.find(e => e.id === selectedEventId);
      if (found) return found;
      const baseId = getRecurringBaseId(selectedEventId);
      const base = events.find(e => e.id === baseId);
      if (base) return base;
      if (selectedEventId === 'new' && eventEditDraft) {
        // Placeholder event object so the modal can render while creating.
        // The eventual save will create a real event entry.
        const parseLocal = (ymd: string, hm: string, fallback: Date) => {
          if (!ymd) return fallback;
          const d = new Date(`${ymd}T${hm || '00:00'}:00`);
          return Number.isNaN(d.getTime()) ? fallback : d;
        };
        const now = new Date();
        const fallbackStart = new Date(now);
        fallbackStart.setMinutes(0, 0, 0);
        const fallbackEnd = new Date(fallbackStart);
        fallbackEnd.setHours(fallbackEnd.getHours() + 1);
        const start = parseLocal(eventEditDraft.startYmd, eventEditDraft.startTime, fallbackStart);
        const end = parseLocal(eventEditDraft.endYmd, eventEditDraft.endTime, fallbackEnd);
        const fallbackCalendarId = calendars[0]?.id ?? 'default';
        return {
          id: 'new',
          title: eventEditDraft.title || 'New event',
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          calendarId: eventEditDraft.calendarId || fallbackCalendarId,
          courseId: eventEditDraft.courseId || undefined,
          location: eventEditDraft.location.trim() || undefined,
          notes: eventEditDraft.notes.trim() || undefined,
          source: eventEditDraft.entryType === 'exam' ? 'exam' : 'manual',
          examKind: eventEditDraft.entryType === 'exam' ? eventEditDraft.examKind : undefined,
        } as CalendarEvent;
      }
      return null;
    },
    [events, selectedEventId, eventEditDraft, calendars]
  );

  useEffect(() => {
    // Any existing event should open in read-only mode first.
    // Keep draft mode only for brand-new event creation (`selectedEventId === 'new'`).
    if (!selectedEventId) return;
    if (selectedEventId === 'new') return;
    setEventEditDraft(null);
  }, [selectedEventId]);

  const courseCalendarIds = useMemo(
    () => new Set(courses.map(c => c.calendarId).filter((id): id is string => Boolean(id))),
    [courses]
  );

  const personalCalendars = useMemo(
    () => calendars.filter(c => !courseCalendarIds.has(c.id)),
    [calendars, courseCalendarIds]
  );

  const toYmd = (d: Date) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const createDefaultEventDraftAt = (d: Date) => {
    const start = new Date(d);
    // Round to next 15 minutes for a nicer default.
    const step = 15;
    const mins = start.getMinutes();
    const snap = Math.ceil(mins / step) * step;
    start.setMinutes(snap % 60, 0, 0);
    if (snap >= 60) start.setHours(start.getHours() + 1);

    const end = new Date(start);
    end.setHours(end.getHours() + 1);

    const toHm = (x: Date) => `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;
    const prefilledCourseId = initialEventCourseId && courses.some(c => c.id === initialEventCourseId)
      ? initialEventCourseId
      : '';
    const prefilledCourseCalendarId = prefilledCourseId
      ? (courses.find(c => c.id === prefilledCourseId)?.calendarId ?? '')
      : '';
    const fallbackCalendarId = personalCalendars[0]?.id ?? calendars[0]?.id ?? '';
    return {
      entryType: 'event',
      examKind: 'exam',
      title: '',
      courseId: prefilledCourseId,
      calendarId: prefilledCourseCalendarId || fallbackCalendarId,
      shouldAssign: Boolean(prefilledCourseId),
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

  const beginCreateEvent = (d = currentDate) => {
    if (!onEventsChange) return;
    setCreateMenuOpen(false);
    setSelectedAssignmentId(null);
    setSelectedEventId('new');
    setEventEditTab('details');
    setEventCourseMenuOpen(false);
    setEventCalendarMenuOpen(false);
    setEventEditDraft({ ...createDefaultEventDraftAt(d), entryType: 'event' });
  };

  const beginCreateExam = (d = currentDate) => {
    if (!onEventsChange) return;
    setCreateMenuOpen(false);
    setSelectedAssignmentId(null);
    setSelectedEventId('new');
    setEventEditTab('details');
    setEventCourseMenuOpen(false);
    setEventCalendarMenuOpen(false);
    setEventEditDraft({ ...createDefaultEventDraftAt(d), entryType: 'exam' });
  };

  const resolveBaseEvent = (id: string) => {
    if (events.find(e => e.id === id)) return id;
    const idx = id.lastIndexOf('_');
    if (idx <= 0) return null;
    const candidate = id.slice(0, idx);
    return events.find(e => e.id === candidate) ? candidate : null;
  };

  const moveEventToDateTime = (eventId: string, nextStart: Date) => {
    if (!onEventsChange) return;
    const baseId = resolveBaseEvent(eventId);
    if (!baseId) return;
    const base = events.find(e => e.id === baseId);
    if (!base || base.source === 'assignment') return;
    const originalStart = new Date(base.startTime);
    const originalEnd = new Date(base.endTime);
    const durationMs = Math.max(15 * 60_000, originalEnd.getTime() - originalStart.getTime());
    const nextEnd = new Date(nextStart.getTime() + durationMs);
    updateEvent(base.id, { startTime: nextStart.toISOString(), endTime: nextEnd.toISOString() });
    toast('Event moved');
  };

  const beginCreateAssignment = (d = currentDate) => {
    if (!onAddAssignment) return;
    // Match the normal assignment creation flow (AddTaskModal).
    setAddAssignmentOpen(true);
  };

  const updateEvent = (eventId: string, patch: Partial<CalendarEvent>) => {
    if (!onEventsChange) return;
    onEventsChange(events.map(e => (e.id === eventId ? { ...e, ...patch } : e)));
  };

  const updateAssignment = (assignmentId: string, patch: Partial<Assignment>) => {
    if (!onAssignmentsChange) return;
    onAssignmentsChange(assignments.map(a => (a.id === assignmentId ? { ...a, ...patch } : a)));
  };

  const startEditingEvent = (e: CalendarEvent) => {
    const s = new Date(e.startTime);
    const en = new Date(e.endTime);
    const toHm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const lockedCourse = lockEventCourse && initialEventCourseId
      ? courses.find(c => c.id === initialEventCourseId)
      : undefined;
    const effectiveCourseId = lockedCourse?.id ?? e.courseId ?? '';
    const effectiveCalendarId = effectiveCourseId
      ? (courses.find(c => c.id === effectiveCourseId)?.calendarId ?? e.calendarId)
      : e.calendarId;
    setEventEditDraft({
      entryType: e.source === 'exam' ? 'exam' : 'event',
      examKind: e.examKind ?? (/\bquiz\b/i.test(e.title) ? 'quiz' : 'exam'),
      title: e.title,
      courseId: effectiveCourseId,
      calendarId: effectiveCalendarId,
      shouldAssign: Boolean(effectiveCourseId),
      location: e.location ?? '',
      notes: e.notes ?? '',
      startYmd: toYmd(s),
      startTime: toHm(s),
      endYmd: toYmd(en),
      endTime: toHm(en),
      recurrenceMode: e.recurrence?.frequency === 'daily' || e.recurrence?.frequency === 'weekly' ? e.recurrence.frequency : 'none',
      intervalDays: String(e.recurrence?.intervalDays ?? 1),
      intervalWeeks: String(e.recurrence?.intervalWeeks ?? 1),
      byWeekday: e.recurrence?.byWeekday?.length ? e.recurrence.byWeekday : [isoWeekday(s)],
      untilYmd: e.recurrence?.until ? toYmd(new Date(e.recurrence.until)) : '',
    });
    setEventEditTab('details');
    setEventCourseMenuOpen(false);
    setEventCalendarMenuOpen(false);
  };

  useEffect(() => {
    if (!selectedEvent || !eventEditDraft) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (eventCourseButtonRef.current?.contains(t) || eventCourseMenuRef.current?.contains(t)) return;
      if (eventCalendarButtonRef.current?.contains(t) || eventCalendarMenuRef.current?.contains(t)) return;
      setEventCourseMenuOpen(false);
      setEventCalendarMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [selectedEvent, eventEditDraft]);

  useEffect(() => {
    if (!eventCourseMenuOpen) return;
    const el = eventCourseButtonRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setEventCourseMenuPos({ left: r.left, top: r.bottom + 8, width: r.width });
  }, [eventCourseMenuOpen]);

  useEffect(() => {
    if (!eventCalendarMenuOpen) return;
    const el = eventCalendarButtonRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setEventCalendarMenuPos({ left: r.left, top: r.bottom + 8, width: r.width });
  }, [eventCalendarMenuOpen]);

  useEffect(() => {
    if (!resizeState) return;
    const onMove = (ev: MouseEvent) => {
      const deltaPx = ev.clientY - resizeState.startY;
      const deltaMinutes = Math.round((deltaPx / resizeState.pxPerHour) * 60 / 15) * 15;
      const minEnd = resizeState.startStartMs + 15 * 60_000;
      const nextEnd = Math.max(minEnd, resizeState.startEndMs + deltaMinutes * 60_000);
      setResizePreviewEndMs(nextEnd);
    };
    const onUp = () => {
      if (resizePreviewEndMs != null) {
        updateEvent(resizeState.eventId, { endTime: new Date(resizePreviewEndMs).toISOString() });
        toast('Event resized');
      }
      setResizeState(null);
      setResizePreviewEndMs(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizeState, resizePreviewEndMs]);

  const openEventOrAssignment = (e: CalendarEvent) => {
    if (e.source === 'assignment') {
      const id = e.id.startsWith('asg_due_') ? e.id.slice('asg_due_'.length) : e.id;
      setSelectedEventId(null);
      setEventEditDraft(null);
      setSelectedAssignmentId(id);
      return;
    }

    if (onEventClick) {
      onEventClick(e);
      return;
    }

    setSelectedAssignmentId(null);
    setSelectedEventId(e.id);
    // Open in read-only details mode first; user can opt into editing.
    setEventEditDraft(null);
  };

  const daysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const startOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const days = Array.from({ length: daysInMonth(currentDate) }, (_, i) => i + 1);
  const padding = Array.from({ length: startOfMonth(currentDate) }, (_, i) => i);
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const next = () => {
    if (viewMode === 'day') setCurrentDate(addDays(currentDate, 1));
    else if (viewMode === 'week') setCurrentDate(addDays(currentDate, 7));
    else if (viewMode === 'year') setCurrentDate(new Date(currentDate.getFullYear() + 1, currentDate.getMonth(), 1));
    else setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };
  const prev = () => {
    if (viewMode === 'day') setCurrentDate(addDays(currentDate, -1));
    else if (viewMode === 'week') setCurrentDate(addDays(currentDate, -7));
    else if (viewMode === 'year') setCurrentDate(new Date(currentDate.getFullYear() - 1, currentDate.getMonth(), 1));
    else setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const calendarColorById = new Map(calendars.map(c => [c.id, c.color] as const));

  const goToDay = (d: Date) => {
    setCurrentDate(startOfDay(d));
    setViewMode('day');
  };

  const openAssignment = (assignmentId: string) => {
    setSelectedEventId(null);
    setEventEditDraft(null);
    setSelectedAssignmentId(assignmentId);
  };

  const expandedEvents = useMemo(
    () =>
      events
        .flatMap(e => {
          if (e.recurrence?.frequency === 'daily') return expandDailyRecurrence(e, currentDate);
          if (e.recurrence?.frequency === 'weekly') return expandWeeklyRecurrence(e, currentDate);
          return [e];
        })
        .filter(e => {
          const sd = new Date(e.startTime);
          if (viewMode === 'year') return sd.getFullYear() === currentDate.getFullYear();
          if (viewMode === 'month') return isSameMonth(sd, currentDate);
          return true;
        }),
    [events, currentDate, viewMode]
  );

  const allDayAssignments = useMemo(
    () => assignments
      .filter(a => {
        const isAcademic = Boolean(a.courseId);
        if (assignmentScope === 'academic') return isAcademic;
        if (assignmentScope === 'personal') return !isAcademic;
        return true;
      })
      .map(a => ({
      id: a.id,
      title: a.title,
      date: new Date(a.dueDate),
      courseId: a.courseId,
      priority: a.priority,
      completed: a.completed,
    })),
    [assignments, assignmentScope]
  );

  const titleText = useMemo(() => {
    if (viewMode === 'day') return currentDate.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    if (viewMode === 'week') {
      const s = startOfWeek(currentDate);
      const e = addDays(s, 6);
      const sameMonth = s.getMonth() === e.getMonth();
      return sameMonth
        ? `${s.toLocaleDateString([], { month: 'long' })} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`
        : `${s.toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${s.getFullYear()}`;
    }
    if (viewMode === 'year') return String(currentDate.getFullYear());
    return currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });
  }, [currentDate, viewMode]);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-bold text-slate-700">{titleText}</h3>

        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setCreateMenuOpen(v => !v)}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-all"
              title="Create"
            >
              <Plus className="w-4 h-4" />
              Add
            </button>
            {createMenuOpen && (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setCreateMenuOpen(false)}
                  aria-label="Close create menu"
                />
                <div className="absolute right-0 mt-2 w-44 z-50 bg-white border border-slate-200 rounded-2xl shadow-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => {
                      beginCreateEvent(currentDate);
                    }}
                    disabled={!onEventsChange}
                    className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors ${
                      onEventsChange ? 'text-slate-700 hover:bg-slate-50' : 'text-slate-300 cursor-not-allowed'
                    }`}
                  >
                    Event
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      beginCreateExam(currentDate);
                    }}
                    disabled={!onEventsChange}
                    className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors ${
                      onEventsChange ? 'text-slate-700 hover:bg-slate-50' : 'text-slate-300 cursor-not-allowed'
                    }`}
                  >
                    Exam
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCreateMenuOpen(false);
                      beginCreateAssignment(currentDate);
                    }}
                    disabled={!onAddAssignment}
                    className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors ${
                      onAddAssignment ? 'text-slate-700 hover:bg-slate-50' : 'text-slate-300 cursor-not-allowed'
                    }`}
                  >
                    Assignment
                  </button>
                </div>
              </>
            )}
          </div>

          {fullView && (
            <div className="mr-2 flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
              {([
                { k: 'day', label: 'Day' },
                { k: 'week', label: 'Week' },
                { k: 'month', label: 'Month' },
                { k: 'year', label: 'Year' },
              ] as Array<{ k: ViewMode; label: string }>).map(v => (
                <button
                  key={v.k}
                  type="button"
                  onClick={() => setViewMode(v.k)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                    viewMode === v.k ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          )}

          <button onClick={prev} className="p-1 hover:bg-slate-100 rounded-lg" aria-label="Previous">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button onClick={next} className="p-1 hover:bg-slate-100 rounded-lg" aria-label="Next">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {viewMode === 'day' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Day</div>
          </div>

          {(() => {
            const day = currentDate;

            const dayEventsRaw = expandedEvents
              .filter(e => {
                const start = new Date(e.startTime);
                return start >= startOfDay(day) && start <= endOfDay(day);
              })
              .slice()
              .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

            const timedEvents = dayEventsRaw.filter(e => {
              const s = new Date(e.startTime);
              const en = new Date(e.endTime);
              return !(s.getHours() === 0 && s.getMinutes() === 0 && en.getHours() === 0 && en.getMinutes() === 0 && en.getTime() > s.getTime());
            });

            const dayAssignments = allDayAssignments
              .filter(a => isSameDay(a.date, day))
              .slice()
              .sort((a, b) => a.title.localeCompare(b.title));

            const hours = Array.from({ length: 24 }, (_, i) => i);
            const pxPerHour = 64;
            const gridHeight = pxPerHour * 24;

            return (
              <div className="p-4">
                <div className="rounded-2xl border border-slate-100 overflow-hidden">
                  {/* Sticky top section */}
                  <div className="sticky top-0 z-10 bg-white border-b border-slate-100 p-3">
                    <div className="text-xs font-semibold text-slate-500 mb-2">All-day / Due</div>
                    {dayAssignments.length === 0 ? (
                      <div className="text-xs text-slate-400">Nothing due today.</div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {dayAssignments.map(a => {
                          const courseColor = courses.find(c => c.id === a.courseId)?.color || 'bg-slate-600';
                          return (
                            <button
                              key={a.id}
                              type="button"
                              onClick={() => openAssignment(a.id)}
                              className={`text-xs px-2 py-1 rounded-xl ${courseColor} text-white hover:brightness-95 transition-colors ${a.completed ? 'opacity-60 line-through' : ''}`}
                              title={a.title}
                            >
                              Due: {a.title}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Scrollable hours */}
                  <div className="max-h-[70vh] overflow-y-auto">
                    <div className="grid grid-cols-[56px_1fr] gap-3 p-3">
                      <div className="select-none">
                        {hours.map(h => (
                          <div key={h} className="h-16 flex items-start justify-end pr-2 text-[11px] font-semibold text-slate-400">
                            {h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`}
                          </div>
                        ))}
                      </div>

                      <div
                        className="relative"
                        style={{ height: gridHeight }}
                        onDragOver={ev => {
                          if (!draggingEventId) return;
                          ev.preventDefault();
                        }}
                        onDrop={ev => {
                          if (!draggingEventId) return;
                          ev.preventDefault();
                          const rect = (ev.currentTarget as HTMLDivElement).getBoundingClientRect();
                          const y = clamp(ev.clientY - rect.top, 0, gridHeight - 1);
                          const minute = Math.round(((y / gridHeight) * 24 * 60) / 15) * 15;
                          const nextStart = new Date(day);
                          nextStart.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
                          moveEventToDateTime(draggingEventId, nextStart);
                          setDraggingEventId(null);
                        }}
                      >
                        {hours.map(h => (
                          <div key={h} className="absolute left-0 right-0 border-t border-slate-100" style={{ top: h * pxPerHour }} />
                        ))}

                        {timedEvents.map(e => {
                          const s = new Date(e.startTime);
                          const en = new Date(
                            resizeState?.eventId === e.id && resizePreviewEndMs != null
                              ? resizePreviewEndMs
                              : e.endTime
                          );
                          const startMin = clamp(minutesSinceStartOfDay(s), 0, 24 * 60);
                          const endMin = clamp(minutesSinceStartOfDay(en), 0, 24 * 60);
                          const durationMin = Math.max(15, endMin - startMin);
                          const top = (startMin / 60) * pxPerHour;
                          const height = (durationMin / 60) * pxPerHour;
                          const color = calendarColorById.get(e.calendarId) || 'bg-slate-600';
                          return (
                            <div
                              key={e.id}
                              onClick={() => openEventOrAssignment(e)}
                              draggable={e.source !== 'assignment'}
                              onDragStart={() => {
                                if (e.source === 'assignment') return;
                                setDraggingEventId(e.id);
                              }}
                              onDragEnd={() => setDraggingEventId(null)}
                              className={`absolute left-2 right-2 ${color} text-white rounded-xl px-2 py-1 shadow-sm overflow-hidden text-left hover:brightness-95 transition-colors ${
                                e.source === 'assignment' ? '' : 'ring-1 ring-slate-900/15 ring-inset'
                              }`}
                              style={{ top, height }}
                              title={`${e.title} • ${formatTime(s)}–${formatTime(en)}`}
                            >
                              <div className="text-xs font-semibold truncate">{e.title}</div>
                              <div className="text-[11px] opacity-90">{formatTime(s)}–{formatTime(en)}</div>
                              {e.source !== 'assignment' && (
                                <div
                                  role="button"
                                  tabIndex={0}
                                  onMouseDown={ev => {
                                    ev.stopPropagation();
                                    ev.preventDefault();
                                    setResizeState({
                                      eventId: e.id,
                                      startY: ev.clientY,
                                      startStartMs: new Date(e.startTime).getTime(),
                                      startEndMs: new Date(e.endTime).getTime(),
                                      pxPerHour,
                                    });
                                    setResizePreviewEndMs(new Date(e.endTime).getTime());
                                  }}
                                  className="absolute left-1 right-1 bottom-0 h-2 cursor-ns-resize rounded-b-xl bg-black/20 hover:bg-black/30"
                                  title="Drag to resize"
                                />
                              )}
                            </div>
                          );
                        })}

                        {timedEvents.length === 0 && (
                          <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-300 pointer-events-none">
                            No timed events
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {viewMode === 'week' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Week</div>
          </div>

          {(() => {
            const weekStart = startOfWeek(currentDate);
            const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
            const hours = Array.from({ length: 24 }, (_, i) => i);
            const pxPerHour = 56;
            const gridHeight = pxPerHour * 24;

            // Simple stacking within each day column to avoid perfectly overlapping blocks.
            const laneForEvent = (ev: CalendarEvent, dayEvents: CalendarEvent[]) => {
              const s = new Date(ev.startTime).getTime();
              const en = new Date(ev.endTime).getTime();
              const lanesEnd: number[] = [];
              for (const e of dayEvents) {
                if (e.id === ev.id) break;
                const es = new Date(e.startTime).getTime();
                const ee = new Date(e.endTime).getTime();
                if (ee <= s || es >= en) continue;
                // occupy a lane
                let placed = false;
                for (let i = 0; i < lanesEnd.length; i++) {
                  if (lanesEnd[i] <= es) {
                    lanesEnd[i] = ee;
                    placed = true;
                    break;
                  }
                }
                if (!placed) lanesEnd.push(ee);
              }
              return lanesEnd.length;
            };

            const allDayRowsByDay = days.map(d => {
              const dayAssignments = allDayAssignments.filter(a => isSameDay(a.date, d));
              // treat 00:00–00:00+ events as all-day-ish
              const allDayEvents = expandedEvents.filter(e => {
                if (e.source === 'assignment') return false;
                const s = new Date(e.startTime);
                const en = new Date(e.endTime);
                const sameDay = s >= startOfDay(d) && s <= endOfDay(d);
                const isAllDayish = s.getHours() === 0 && s.getMinutes() === 0 && en.getHours() === 0 && en.getMinutes() === 0 && en.getTime() > s.getTime();
                return sameDay && isAllDayish;
              });
              return { dayAssignments, allDayEvents };
            });

            return (
              <div className="p-4">
                <div className="rounded-2xl border border-slate-100 overflow-hidden">
                  {/* Sticky header (days + all-day) */}
                  <div className="sticky top-0 z-10 bg-white border-b border-slate-100">
                    <div className="grid grid-cols-[56px_repeat(7,1fr)] gap-2 items-stretch p-3">
                      <div />
                      {days.map(d => (
                        <button
                          key={d.toISOString()}
                          type="button"
                          onClick={() => goToDay(d)}
                          className="text-center rounded-xl hover:bg-slate-50 transition-colors"
                          title="Go to day"
                        >
                          <div className="text-xs font-semibold text-slate-400">{d.toLocaleDateString([], { weekday: 'short' })}</div>
                          <div className={`text-sm font-bold ${isSameDay(d, new Date()) ? 'text-indigo-600' : 'text-slate-700'}`}>{d.getDate()}</div>
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-[56px_repeat(7,1fr)] gap-2 px-3 pb-3">
                      <div className="text-[11px] font-semibold text-slate-400 pt-1">All-day</div>
                      {days.map((d, idx) => (
                        <div key={d.toISOString()} className="min-h-[36px] rounded-xl border border-slate-100 p-1 flex flex-wrap gap-1 bg-white">
                          {allDayRowsByDay[idx].allDayEvents.slice(0, 3).map(e => (
                            <div
                              key={e.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => openEventOrAssignment(e)}
                              onKeyDown={ev => {
                                if (ev.key === 'Enter' || ev.key === ' ') openEventOrAssignment(e);
                              }}
                              className={`cursor-pointer text-[10px] truncate px-1.5 py-0.5 rounded ${calendarColorById.get(e.calendarId) || 'bg-slate-600'} text-white ring-1 ring-slate-900/15 ring-inset hover:brightness-95`}
                              title={e.title}
                            >
                              {e.title}
                            </div>
                          ))}
                          {allDayRowsByDay[idx].dayAssignments.slice(0, 3).map(a => (
                            <div
                              key={a.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => openAssignment(a.id)}
                              onKeyDown={ev => {
                                if (ev.key === 'Enter' || ev.key === ' ') openAssignment(a.id);
                              }}
                              className={`cursor-pointer text-[10px] truncate px-1.5 py-0.5 rounded ${courses.find(c => c.id === a.courseId)?.color || 'bg-slate-600'} text-white hover:brightness-95 ${priorityRing(a.priority)} ${a.completed ? 'opacity-60 line-through' : ''}`}
                              title={a.title}
                            >
                              Due: {a.title}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Scrollable hour grid */}
                  <div className="max-h-[70vh] overflow-y-auto">
                    <div className="grid grid-cols-[56px_1fr] gap-2 p-3">
                      <div className="select-none">
                        {hours.map(h => (
                          <div key={h} className="h-14 flex items-start justify-end pr-2 text-[11px] font-semibold text-slate-400">
                            {h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`}
                          </div>
                        ))}
                      </div>

                      <div
                        className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white"
                        style={{ height: gridHeight }}
                        onDragOver={ev => {
                          if (!draggingEventId) return;
                          ev.preventDefault();
                        }}
                        onDrop={ev => {
                          if (!draggingEventId) return;
                          ev.preventDefault();
                          const rect = (ev.currentTarget as HTMLDivElement).getBoundingClientRect();
                          const x = clamp(ev.clientX - rect.left, 0, rect.width - 1);
                          const y = clamp(ev.clientY - rect.top, 0, gridHeight - 1);
                          const dayIdx = clamp(Math.floor((x / rect.width) * 7), 0, 6);
                          const minute = Math.round(((y / gridHeight) * 24 * 60) / 15) * 15;
                          const nextStart = new Date(days[dayIdx]);
                          nextStart.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
                          moveEventToDateTime(draggingEventId, nextStart);
                          setDraggingEventId(null);
                        }}
                      >
                        {/* hour lines */}
                        {hours.map(h => (
                          <div key={h} className="absolute left-0 right-0 border-t border-slate-100" style={{ top: h * pxPerHour }} />
                        ))}
                        {/* vertical day divisions */}
                        {Array.from({ length: 7 }, (_, i) => i + 1).map(i => (
                          <div key={i} className="absolute top-0 bottom-0 border-l border-slate-100" style={{ left: `${(i / 7) * 100}%` }} />
                        ))}

                        {days.map((d, dayIdx) => {
                          const dayStart = startOfDay(d);
                          const dayEnd = endOfDay(d);
                          const dayTimedEvents = expandedEvents
                            .filter(e => {
                              const s = new Date(e.startTime);
                              const en = new Date(e.endTime);
                              const inDay = s >= dayStart && s <= dayEnd;
                              const allDayish = s.getHours() === 0 && s.getMinutes() === 0 && en.getHours() === 0 && en.getMinutes() === 0 && en.getTime() > s.getTime();
                              return inDay && !allDayish;
                            })
                            .slice()
                            .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

                          const colLeftPct = (dayIdx / 7) * 100;
                          const colWidthPct = 100 / 7;

                          return (
                            <React.Fragment key={d.toISOString()}>
                              {dayTimedEvents.map((e, idx) => {
                                const s = new Date(e.startTime);
                                const en = new Date(
                                  resizeState?.eventId === e.id && resizePreviewEndMs != null
                                    ? resizePreviewEndMs
                                    : e.endTime
                                );
                                const startMin = clamp(minutesSinceStartOfDay(s), 0, 24 * 60);
                                const endMin = clamp(minutesSinceStartOfDay(en), 0, 24 * 60);
                                const durationMin = Math.max(15, endMin - startMin);
                                const top = (startMin / 60) * pxPerHour;
                                const height = (durationMin / 60) * pxPerHour;

                                const lane = laneForEvent(e, dayTimedEvents.slice(0, idx + 1));
                                const maxLanes = 3;
                                const laneWidthPct = colWidthPct / maxLanes;
                                const left = colLeftPct + laneWidthPct * clamp(lane, 0, maxLanes - 1);
                                const width = laneWidthPct;

                                const color = calendarColorById.get(e.calendarId) || 'bg-slate-600';

                                return (
                                  <div
                                    key={e.id}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => openEventOrAssignment(e)}
                                    onKeyDown={ev => {
                                      if (ev.key === 'Enter' || ev.key === ' ') openEventOrAssignment(e);
                                    }}
                                    draggable={e.source !== 'assignment'}
                                    onDragStart={() => {
                                      if (e.source === 'assignment') return;
                                      setDraggingEventId(e.id);
                                    }}
                                    onDragEnd={() => setDraggingEventId(null)}
                                    className={`cursor-pointer absolute ${color} text-white rounded-xl px-2 py-1 shadow-sm overflow-hidden hover:brightness-95`}
                                    style={{ top, height, left: `${left}%`, width: `${width}%` }}
                                    title={`${e.title} • ${formatTime(s)}–${formatTime(en)}`}
                                  >
                                    <div className="text-[11px] font-semibold truncate">{e.title}</div>
                                    <div className="text-[10px] opacity-90">{formatTime(s)}</div>
                                    {e.source !== 'assignment' && (
                                      <div
                                        role="button"
                                        tabIndex={0}
                                        onMouseDown={ev => {
                                          ev.stopPropagation();
                                          ev.preventDefault();
                                          setResizeState({
                                            eventId: e.id,
                                            startY: ev.clientY,
                                            startStartMs: new Date(e.startTime).getTime(),
                                            startEndMs: new Date(e.endTime).getTime(),
                                            pxPerHour,
                                          });
                                          setResizePreviewEndMs(new Date(e.endTime).getTime());
                                        }}
                                        className="absolute left-1 right-1 bottom-0 h-2 cursor-ns-resize rounded-b-xl bg-black/20 hover:bg-black/30"
                                        title="Drag to resize"
                                      />
                                    )}
                                  </div>
                                );
                              })}
                            </React.Fragment>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {viewMode === 'year' && (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {Array.from({ length: 12 }, (_, m) => m).map(month => {
                              const monthDate = new Date(currentDate.getFullYear(), month, 1);
                              const monthEvents = events.flatMap(e => expandWeeklyRecurrence(e, monthDate))
                                .filter(e => isSameMonth(new Date(e.startTime), monthDate));

                              const monthAssignments = allDayAssignments.filter(a => {
                                const d = a.date;
                                return d.getFullYear() === monthDate.getFullYear() && d.getMonth() === month;
                              });

                              const busyDays = new Set<number>();
                              monthEvents.forEach(e => busyDays.add(new Date(e.startTime).getDate()));
                              monthAssignments.forEach(a => busyDays.add(a.date.getDate()));

                              const dim = new Date(monthDate.getFullYear(), month + 1, 0).getDate();
                              const pad = new Date(monthDate.getFullYear(), month, 1).getDay();

                              return (
                                <button
                                  key={month}
                                  type="button"
                                  onClick={() => {
                                    setCurrentDate(monthDate);
                                    setViewMode('month');
                                  }}
                                  className="text-left bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-all p-4"
                                >
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="font-bold text-slate-800">{monthDate.toLocaleDateString([], { month: 'long' })}</div>
                                    <div className="text-xs text-slate-400">{monthEvents.length + monthAssignments.length} items</div>
                                  </div>
                                  <div className="grid grid-cols-7 gap-1">
                                    {Array.from({ length: pad }, (_, i) => (
                                      <div key={`p-${i}`} className="h-5" />
                                    ))}
                                    {Array.from({ length: dim }, (_, i) => i + 1).map(day => (
                                      <button
                                        key={day}
                                        type="button"
                                        onClick={e => {
                                          e.stopPropagation();
                                          goToDay(new Date(monthDate.getFullYear(), monthDate.getMonth(), day));
                                        }}
                                        className={`h-5 rounded-md border border-slate-100 text-[10px] font-semibold leading-5 text-center transition-colors ${
                                          busyDays.has(day)
                                            ? 'bg-indigo-100 border-indigo-200 text-indigo-700 hover:bg-indigo-200'
                                            : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                                        }`}
                                        title={`${monthDate.toLocaleDateString([], { month: 'short' })} ${day}`}
                                      >
                                        {day}
                                      </button>
                                    ))}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
      )}

      {viewMode === 'month' && (
        <>
          <div className="calendar-grid gap-1 mb-2">
            {weekDays.map(day => (
              <div key={day} className="text-center text-xs font-semibold text-slate-400 py-2">
                {day}
              </div>
            ))}
          </div>

          <div className="calendar-grid gap-1">
            {padding.map(i => (
              <div key={`pad-${i}`} className="h-24 md:h-32 bg-slate-50/50 rounded-lg" />
            ))}

            {days.map(day => {
              const today = new Date();
              const isToday = today.getDate() === day && today.getMonth() === currentDate.getMonth() && today.getFullYear() === currentDate.getFullYear();
              const cellDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);

              const dayAssignments = allDayAssignments.filter(a => {
                const d = a.date;
                return d.getDate() === day && d.getMonth() === currentDate.getMonth() && d.getFullYear() === currentDate.getFullYear();
              });

              const dayEvents = expandedEvents.filter(e => {
                const start = new Date(e.startTime);
                if (e.source === 'assignment') return false;
                return start >= startOfDay(cellDate) && start <= endOfDay(cellDate);
              });

              return (
                <div
                  key={day}
                  role="button"
                  tabIndex={0}
                  onClick={() => goToDay(cellDate)}
                  onDoubleClick={e => {
                    e.stopPropagation();
                    setQuickAddDateYmd(toYmd(cellDate));
                    setQuickAddTitle('');
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') goToDay(cellDate);
                  }}
                  onDragOver={ev => {
                    if (!draggingEventId) return;
                    ev.preventDefault();
                  }}
                  onDrop={ev => {
                    if (!draggingEventId) return;
                    ev.preventDefault();
                    ev.stopPropagation();
                    const dropped = new Date(cellDate);
                    const sourceEvent = events.find(x => x.id === resolveBaseEvent(draggingEventId) || x.id === draggingEventId);
                    if (sourceEvent) {
                      const s = new Date(sourceEvent.startTime);
                      dropped.setHours(s.getHours(), s.getMinutes(), 0, 0);
                    } else {
                      dropped.setHours(9, 0, 0, 0);
                    }
                    moveEventToDateTime(draggingEventId, dropped);
                    setDraggingEventId(null);
                  }}
                  className={`h-24 md:h-32 p-2 bg-white border border-slate-100 rounded-lg hover:border-indigo-200 transition-colors cursor-pointer ${
                    isToday ? 'ring-2 ring-indigo-500' : ''
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        goToDay(cellDate);
                      }}
                      className={`text-sm font-medium rounded-md px-1 py-0.5 hover:bg-slate-50 transition-colors ${isToday ? 'text-indigo-600' : 'text-slate-600'}`}
                      title="Go to day"
                    >
                      {day}
                    </button>
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        setQuickAddDateYmd(toYmd(cellDate));
                        setQuickAddTitle('');
                      }}
                      className="text-[10px] px-1.5 py-0.5 rounded-md text-slate-500 hover:bg-slate-100"
                      title="Quick add"
                    >
                      + 
                    </button>
                  </div>

                  {quickAddDateYmd === toYmd(cellDate) && (
                    <input
                      autoFocus
                      value={quickAddTitle}
                      onChange={e => setQuickAddTitle(e.target.value)}
                      onClick={e => e.stopPropagation()}
                      onKeyDown={e => {
                        if (e.key === 'Escape') {
                          setQuickAddDateYmd(null);
                          setQuickAddTitle('');
                          return;
                        }
                        if (e.key !== 'Enter') return;
                        e.preventDefault();
                        if (!onEventsChange) return;
                        const title = quickAddTitle.trim();
                        if (!title) return;
                        const start = new Date(cellDate);
                        start.setHours(9, 0, 0, 0);
                        const end = new Date(start.getTime() + 60 * 60 * 1000);
                        onEventsChange([
                          ...events,
                          {
                            id: uid('evt'),
                            title,
                            startTime: start.toISOString(),
                            endTime: end.toISOString(),
                            calendarId: calendars[0]?.id ?? 'default',
                            source: 'manual',
                          },
                        ]);
                        setQuickAddDateYmd(null);
                        setQuickAddTitle('');
                        toast('Event created');
                      }}
                      placeholder="Quick add event..."
                      className="w-full mb-1 px-2 py-1 text-[10px] border border-indigo-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  )}

                  <div className="space-y-1 overflow-y-auto max-h-[80%] custom-scrollbar">
                    {dayEvents.map(e => (
                      <button
                        key={e.id}
                        type="button"
                        onClick={ev => {
                          ev.stopPropagation();
                          openEventOrAssignment(e);
                        }}
                        draggable={e.source !== 'assignment'}
                        onDragStart={ev => {
                          ev.stopPropagation();
                          if (e.source === 'assignment') return;
                          setDraggingEventId(e.id);
                        }}
                        onDragEnd={() => setDraggingEventId(null)}
                        className={`w-full text-left text-[10px] truncate px-1 py-0.5 rounded ${calendarColorById.get(e.calendarId) || 'bg-slate-600'} text-white hover:brightness-95 transition-colors ${
                          e.source === 'assignment' ? '' : 'ring-1 ring-slate-900/15 ring-inset'
                        }`}
                        title={`${e.title} • ${formatTime(new Date(e.startTime))}`}
                      >
                        {e.title}
                      </button>
                    ))}

                    {dayAssignments.map(a => {
                      const courseColor = courses.find(c => c.id === a.courseId)?.color || 'bg-slate-600';
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={ev => {
                            ev.stopPropagation();
                            openAssignment(a.id);
                          }}
                          className={`w-full text-left text-[10px] truncate px-1 py-0.5 rounded ${courseColor} text-white hover:brightness-95 transition-colors ${
                            priorityRing(a.priority)
                          } ${
                            a.completed ? 'opacity-60 line-through' : ''
                          }`}
                          title={`Due: ${a.title}`}
                        >
                          Due: {a.title}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <AssignmentEditModal
        open={Boolean(selectedAssignment)}
        assignment={selectedAssignment}
        courses={courses}
        onClose={() => setSelectedAssignmentId(null)}
        onDelete={(assignmentId) => {
          if (!onAssignmentsChange) return;
          const target = assignments.find(a => a.id === assignmentId);
          if (!target) return;
          const series = assignments.filter(a =>
            a.id !== assignmentId &&
            a.courseId === target.courseId &&
            a.title.trim().toLowerCase() === target.title.trim().toLowerCase()
          );
          if (series.length > 0) {
            setPendingAssignmentDeleteSeriesChoice({
              assignmentId,
              title: target.title,
              seriesCount: series.length + 1,
            });
            return;
          }
          deleteAssignment(assignmentId, false);
        }}
        onSave={patch => {
          if (!selectedAssignment) return;
          updateAssignment(selectedAssignment.id, patch);
        }}
      />

      <AddTaskModal
        open={addAssignmentOpen}
        courses={courses}
        initialCourseId={addAssignmentInitialCourseId}
        onClose={() => setAddAssignmentOpen(false)}
        onCreate={item => {
          if (!onAddAssignment) return;
          // AddTaskModal can also create recurring tasks; calendar 'Add → Assignment' should create only assignments.
          if (!('dueDate' in item)) return;
          onAddAssignment(item as Omit<Assignment, 'id'>);
          setAddAssignmentOpen(false);
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingAssignmentDeleteSeriesChoice)}
        title="Delete recurring assignments?"
        message={
          pendingAssignmentDeleteSeriesChoice
            ? `"${pendingAssignmentDeleteSeriesChoice.title}" belongs to a recurring series (${pendingAssignmentDeleteSeriesChoice.seriesCount} items).`
            : ''
        }
        confirmLabel="Delete all"
        secondaryLabel="Delete this one"
        onCancel={() => setPendingAssignmentDeleteSeriesChoice(null)}
        onSecondary={() => {
          if (!pendingAssignmentDeleteSeriesChoice) return;
          deleteAssignment(pendingAssignmentDeleteSeriesChoice.assignmentId, false);
        }}
        onConfirm={() => {
          if (!pendingAssignmentDeleteSeriesChoice) return;
          deleteAssignment(pendingAssignmentDeleteSeriesChoice.assignmentId, true);
        }}
      />

      {/* Event details modal */}
      {selectedEvent && selectedEvent.source !== 'assignment' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
            onClick={() => {
              setSelectedEventId(null);
              setEventEditDraft(null);
            }}
            aria-hidden="true"
          />
          {eventEditDraft && !lockEventCourse && eventEditDraft.shouldAssign && eventEditDraft.courseId && eventCourseMenuOpen && eventCourseMenuPos && (
            <div
              ref={eventCourseMenuRef}
              className="fixed z-[80] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
              style={{ left: eventCourseMenuPos.left, top: eventCourseMenuPos.top, width: eventCourseMenuPos.width }}
              role="listbox"
            >
              <div className="p-1">
                <button
                  type="button"
                  role="option"
                  aria-selected={!eventEditDraft.courseId}
                  onClick={() => {
                    const fallbackCalendarId = (personalCalendars.length > 0 ? personalCalendars[0].id : calendars[0]?.id) || eventEditDraft.calendarId;
                    setEventEditDraft({
                      ...eventEditDraft,
                      shouldAssign: false,
                      courseId: '',
                      calendarId: fallbackCalendarId,
                    });
                    setEventCourseMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-colors ${
                    !eventEditDraft.courseId ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="font-semibold">Independent activity</div>
                  <div className={`text-xs ${!eventEditDraft.courseId ? 'text-indigo-100' : 'text-slate-400'}`}>
                    Personal calendar
                  </div>
                </button>
                <div className="my-1 border-t border-slate-100" />
                {courses.map(c => {
                  const active = eventEditDraft.courseId === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => {
                        setEventEditDraft({
                          ...eventEditDraft,
                          shouldAssign: true,
                          courseId: c.id,
                          calendarId: c.calendarId ?? eventEditDraft.calendarId,
                        });
                        setEventCourseMenuOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-colors ${
                        active ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${c.color || 'bg-slate-300'}`} />
                        <span className="font-semibold">{c.code || 'Course'}</span>
                      </div>
                      <div className={`text-xs ${active ? 'text-indigo-100' : 'text-slate-400'}`}>{c.name}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {eventEditDraft && eventEditDraft.shouldAssign && !eventEditDraft.courseId && eventCalendarMenuOpen && eventCalendarMenuPos && (
            <div
              ref={eventCalendarMenuRef}
              className="fixed z-[80] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
              style={{ left: eventCalendarMenuPos.left, top: eventCalendarMenuPos.top, width: eventCalendarMenuPos.width }}
              role="listbox"
            >
              <div className="p-1">
                {(personalCalendars.length > 0 ? personalCalendars : calendars).map(cal => {
                  const active = eventEditDraft.calendarId === cal.id;
                  return (
                    <button
                      key={cal.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => {
                        setEventEditDraft({ ...eventEditDraft, calendarId: cal.id });
                        setEventCalendarMenuOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-colors ${
                        active ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${cal.color || 'bg-slate-300'}`} />
                        <span className="font-semibold">{cal.name}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-100">
              <div className="min-w-0">
                <div className="inline-flex items-center px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-[11px] font-semibold uppercase tracking-wide">Event</div>
                <div className="text-xl font-bold text-slate-900 truncate mt-2">{selectedEvent.title}</div>
                <div className="text-sm text-slate-500 mt-1">
                  {formatShortDate(new Date(selectedEvent.startTime))} • {formatTime(new Date(selectedEvent.startTime))}–{formatTime(new Date(selectedEvent.endTime))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!eventEditDraft && (
                  <>
                    <button
                      type="button"
                      onClick={() => startEditingEvent(selectedEvent)}
                      className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                      title="Edit details"
                    >
                      <Pencil className="w-4 h-4" />
                      Edit details
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!onEventsChange) return;
                        const baseId = selectedEventId ? getRecurringBaseId(selectedEventId) : selectedEvent.id;
                        const baseEvent = events.find(e => e.id === baseId) ?? selectedEvent;
                        const recurring = Boolean(baseEvent.recurrence && baseEvent.recurrence.frequency !== 'none');
                        setShowDeleteEventSeriesChoice(recurring);
                        setShowDeleteEventConfirm(true);
                      }}
                      disabled={!onEventsChange}
                      className={`inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl transition-colors ${
                        onEventsChange
                          ? 'text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100'
                          : 'text-slate-300 bg-slate-100 cursor-not-allowed'
                      }`}
                      title="Delete event"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedEventId(null);
                    setEventEditDraft(null);
                  }}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors"
                  title="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="px-6 py-5 space-y-4 max-h-[72vh] overflow-y-auto">
              {eventEditDraft ? (
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
                    <button
                      type="button"
                      onClick={() => setEventEditTab('details')}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                        eventEditTab === 'details' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      Details
                    </button>
                    <button
                      type="button"
                      onClick={() => setEventEditTab('schedule')}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                        eventEditTab === 'schedule' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      Schedule
                    </button>
                  </div>

                  {eventEditTab === 'details' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
                        <input
                          value={eventEditDraft.title}
                          onChange={e => setEventEditDraft({ ...eventEditDraft, title: e.target.value })}
                          className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        />
                      </div>

                      {eventEditDraft.entryType === 'exam' && (
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-slate-700 mb-2">Assessment type</label>
                          <div className="grid grid-cols-2 gap-3">
                            <button
                              type="button"
                              onClick={() => setEventEditDraft({ ...eventEditDraft, examKind: 'exam' })}
                              className={`px-3 py-2 rounded-xl border text-sm font-semibold transition-colors ${
                                eventEditDraft.examKind === 'exam'
                                  ? 'bg-indigo-600 text-white border-indigo-600'
                                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              Exam
                            </button>
                            <button
                              type="button"
                              onClick={() => setEventEditDraft({ ...eventEditDraft, examKind: 'quiz' })}
                              className={`px-3 py-2 rounded-xl border text-sm font-semibold transition-colors ${
                                eventEditDraft.examKind === 'quiz'
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
                        <div className="text-sm font-semibold text-slate-800 mb-3">Assign to</div>
                        {lockEventCourse ? (
                          <div>
                            <div className="px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50 text-sm font-semibold text-indigo-700">
                              Course event
                            </div>
                            <div className="text-xs text-slate-500 mt-2">This calendar is tied to the selected class.</div>
                          </div>
                        ) : (
                          <>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                              <button
                                type="button"
                                onClick={() => setEventEditDraft({
                                  ...eventEditDraft,
                                  shouldAssign: true,
                                })}
                                className={`px-3 py-2 rounded-xl border text-sm font-semibold transition-colors ${
                                  eventEditDraft.shouldAssign
                                    ? 'bg-indigo-600 text-white border-indigo-600'
                                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                }`}
                              >
                                Yes, assign it
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEventCourseMenuOpen(false);
                                  setEventCalendarMenuOpen(false);
                                  setEventEditDraft({
                                    ...eventEditDraft,
                                    shouldAssign: false,
                                    courseId: '',
                                  });
                                }}
                                className={`px-3 py-2 rounded-xl border text-sm font-semibold transition-colors ${
                                  !eventEditDraft.shouldAssign
                                    ? 'bg-indigo-600 text-white border-indigo-600'
                                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                }`}
                              >
                                No, keep independent
                              </button>
                            </div>
                            {!eventEditDraft.shouldAssign && (
                              <div className="text-xs text-slate-500">
                                This event will stay independent and won&apos;t be tied to a class or personal activity group.
                              </div>
                            )}
                            {eventEditDraft.shouldAssign && (
                              <>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (courses.length === 0) return;
                                      const nextCourseId = eventEditDraft.courseId || courses[0].id;
                                      const nextCourse = courses.find(c => c.id === nextCourseId);
                                      setEventEditDraft({
                                        ...eventEditDraft,
                                        courseId: nextCourseId,
                                        calendarId: nextCourse?.calendarId ?? eventEditDraft.calendarId,
                                      });
                                    }}
                                    disabled={courses.length === 0}
                                    className={`px-3 py-2 rounded-xl border text-sm font-semibold transition-colors ${
                                      eventEditDraft.courseId
                                        ? 'bg-indigo-600 text-white border-indigo-600'
                                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                    } ${courses.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                                  >
                                    Course
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEventEditDraft({ ...eventEditDraft, courseId: '' })}
                                    className={`px-3 py-2 rounded-xl border text-sm font-semibold transition-colors ${
                                      !eventEditDraft.courseId
                                        ? 'bg-indigo-600 text-white border-indigo-600'
                                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                    }`}
                                  >
                                    Personal activity
                                  </button>
                                </div>
                                {courses.length === 0 && (
                                  <div className="text-xs text-slate-500 mt-2">Create a course first to assign this event to a class.</div>
                                )}
                              </>
                            )}
                          </>
                        )}

                        {eventEditDraft.shouldAssign && eventEditDraft.courseId ? (
                          <div className="mt-3">
                            <label className="block text-sm font-medium text-slate-700 mb-1">Course</label>
                            <button
                              ref={eventCourseButtonRef}
                              type="button"
                              onClick={() => {
                                if (lockEventCourse) return;
                                setEventCalendarMenuOpen(false);
                                setEventCourseMenuOpen(v => !v);
                              }}
                              disabled={lockEventCourse}
                              className="w-full flex items-center justify-between gap-3 px-4 py-2 border border-slate-200 rounded-xl bg-white text-sm text-slate-800 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                            >
                              <span className="min-w-0 flex items-center gap-2 truncate">
                                <span className={`w-2.5 h-2.5 rounded-full ${courses.find(c => c.id === eventEditDraft.courseId)?.color || 'bg-slate-300'}`} />
                                <span className="truncate">
                                  {(() => {
                                    const c = courses.find(x => x.id === eventEditDraft.courseId);
                                    if (!c) return 'Select course';
                                    return `${c.code ? `${c.code} — ` : ''}${c.name}`;
                                  })()}
                                </span>
                              </span>
                              {!lockEventCourse && <ChevronDown className="w-4 h-4 text-slate-400" />}
                            </button>
                          </div>
                        ) : eventEditDraft.shouldAssign ? (
                          <div className="mt-3">
                            <label className="block text-sm font-medium text-slate-700 mb-1">Personal calendar</label>
                            <button
                              ref={eventCalendarButtonRef}
                              type="button"
                              onClick={() => {
                                setEventCourseMenuOpen(false);
                                setEventCalendarMenuOpen(v => !v);
                              }}
                              className="w-full flex items-center justify-between gap-3 px-4 py-2 border border-slate-200 rounded-xl bg-white text-sm text-slate-800 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                            >
                              <span className="min-w-0 flex items-center gap-2 truncate">
                                <span className={`w-2.5 h-2.5 rounded-full ${(calendars.find(c => c.id === eventEditDraft.calendarId)?.color) || 'bg-slate-300'}`} />
                                <span className="truncate">{calendars.find(c => c.id === eventEditDraft.calendarId)?.name || 'Select personal calendar'}</span>
                              </span>
                              <ChevronDown className="w-4 h-4 text-slate-400" />
                            </button>
                          </div>
                        ) : null}
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Location</label>
                        <input
                          value={eventEditDraft.location}
                          onChange={e => setEventEditDraft({ ...eventEditDraft, location: e.target.value })}
                          placeholder="Optional"
                          className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                        <textarea
                          value={eventEditDraft.notes}
                          onChange={e => setEventEditDraft({ ...eventEditDraft, notes: e.target.value })}
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
                            <DatePicker
                              value={eventEditDraft.startYmd}
                              onChange={(ymd) => setEventEditDraft({ ...eventEditDraft, startYmd: ymd })}
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">End date</label>
                            <DatePicker
                              value={eventEditDraft.endYmd}
                              onChange={(ymd) => setEventEditDraft({ ...eventEditDraft, endYmd: ymd })}
                              min={eventEditDraft.startYmd || undefined}
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Start time</label>
                            <input
                              type="time"
                              value={eventEditDraft.startTime}
                              onChange={e => setEventEditDraft({ ...eventEditDraft, startTime: e.target.value })}
                              className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">End time</label>
                            <input
                              type="time"
                              value={eventEditDraft.endTime}
                              onChange={e => setEventEditDraft({ ...eventEditDraft, endTime: e.target.value })}
                              className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                        <div className="text-sm font-semibold text-slate-800">Repeats</div>
                        <div className="grid grid-cols-3 gap-2">
                          <button
                            type="button"
                            onClick={() => setEventEditDraft({ ...eventEditDraft, recurrenceMode: 'none' })}
                            className={`px-3 py-2 rounded-xl border text-xs font-bold uppercase tracking-wider transition-colors ${
                              eventEditDraft.recurrenceMode === 'none'
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            None
                          </button>
                          <button
                            type="button"
                            onClick={() => setEventEditDraft({ ...eventEditDraft, recurrenceMode: 'daily' })}
                            className={`px-3 py-2 rounded-xl border text-xs font-bold uppercase tracking-wider transition-colors ${
                              eventEditDraft.recurrenceMode === 'daily'
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            Daily
                          </button>
                          <button
                            type="button"
                            onClick={() => setEventEditDraft({ ...eventEditDraft, recurrenceMode: 'weekly' })}
                            className={`px-3 py-2 rounded-xl border text-xs font-bold uppercase tracking-wider transition-colors ${
                              eventEditDraft.recurrenceMode === 'weekly'
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            Weekly
                          </button>
                        </div>

                        {eventEditDraft.recurrenceMode === 'daily' && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-slate-700 mb-1">Every</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={1}
                                  step={1}
                                  value={eventEditDraft.intervalDays}
                                  onChange={e => setEventEditDraft({ ...eventEditDraft, intervalDays: e.target.value })}
                                  className="w-24 px-4 py-2 border border-slate-200 rounded-xl"
                                />
                                <span className="text-sm text-slate-600">days</span>
                              </div>
                            </div>
                            <div>
                              <DatePicker
                                label="Until (optional)"
                                value={eventEditDraft.untilYmd}
                                onChange={(next) => setEventEditDraft({ ...eventEditDraft, untilYmd: next })}
                                placeholder="No end"
                              />
                            </div>
                          </div>
                        )}

                        {eventEditDraft.recurrenceMode === 'weekly' && (
                          <>
                            <div>
                              <label className="block text-sm font-medium text-slate-700 mb-2">Repeat on</label>
                              <div className="flex flex-wrap gap-2">
                                {EVENT_WEEKDAYS.map(d => {
                                  const active = eventEditDraft.byWeekday.includes(d.iso);
                                  return (
                                    <button
                                      key={d.iso}
                                      type="button"
                                      onClick={() => {
                                        const has = eventEditDraft.byWeekday.includes(d.iso);
                                        const next = has
                                          ? eventEditDraft.byWeekday.filter(x => x !== d.iso)
                                          : [...eventEditDraft.byWeekday, d.iso];
                                        setEventEditDraft({ ...eventEditDraft, byWeekday: next });
                                      }}
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
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Every</label>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    min={1}
                                    step={1}
                                    value={eventEditDraft.intervalWeeks}
                                    onChange={e => setEventEditDraft({ ...eventEditDraft, intervalWeeks: e.target.value })}
                                    className="w-24 px-4 py-2 border border-slate-200 rounded-xl"
                                  />
                                  <span className="text-sm text-slate-600">weeks</span>
                                </div>
                              </div>
                              <div>
                                <DatePicker
                                  label="Until (optional)"
                                  value={eventEditDraft.untilYmd}
                                  onChange={(next) => setEventEditDraft({ ...eventEditDraft, untilYmd: next })}
                                  placeholder="No end"
                                />
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const s = new Date(selectedEvent.startTime);
                        const en = new Date(selectedEvent.endTime);
                        const toYmd = (d: Date) => {
                          const yyyy = d.getFullYear();
                          const mm = String(d.getMonth() + 1).padStart(2, '0');
                          const dd = String(d.getDate()).padStart(2, '0');
                          return `${yyyy}-${mm}-${dd}`;
                        };
                        const toHm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                        setEventEditDraft({
                          entryType: selectedEvent.source === 'exam' ? 'exam' : 'event',
                          examKind: selectedEvent.examKind ?? (/\bquiz\b/i.test(selectedEvent.title) ? 'quiz' : 'exam'),
                          title: selectedEvent.title,
                          courseId: selectedEvent.courseId ?? '',
                          calendarId: selectedEvent.calendarId,
                          shouldAssign: Boolean(selectedEvent.courseId),
                          location: selectedEvent.location ?? '',
                          notes: selectedEvent.notes ?? '',
                          startYmd: toYmd(s),
                          startTime: toHm(s),
                          endYmd: toYmd(en),
                          endTime: toHm(en),
                          recurrenceMode: selectedEvent.recurrence?.frequency === 'daily' || selectedEvent.recurrence?.frequency === 'weekly' ? selectedEvent.recurrence.frequency : 'none',
                          intervalDays: String(selectedEvent.recurrence?.intervalDays ?? 1),
                          intervalWeeks: String(selectedEvent.recurrence?.intervalWeeks ?? 1),
                          byWeekday: selectedEvent.recurrence?.byWeekday?.length ? selectedEvent.recurrence.byWeekday : [isoWeekday(s)],
                          untilYmd: selectedEvent.recurrence?.until ? toYmd(new Date(selectedEvent.recurrence.until)) : '',
                        });
                      }}
                      className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!onEventsChange) return;
                        if (!eventEditDraft) return;
                        if (!eventEditDraft.startYmd || !eventEditDraft.endYmd) return;
                        const nextStart = new Date(`${eventEditDraft.startYmd}T${eventEditDraft.startTime || '00:00'}`);
                        const nextEnd = new Date(`${eventEditDraft.endYmd}T${eventEditDraft.endTime || '00:00'}`);
                        if (Number.isNaN(nextStart.getTime()) || Number.isNaN(nextEnd.getTime())) return;
                        if (nextEnd.getTime() <= nextStart.getTime()) return;

                        const effectiveCourseId = lockEventCourse && initialEventCourseId
                          ? initialEventCourseId
                          : (eventEditDraft.shouldAssign ? eventEditDraft.courseId : '');
                        const selectedCourse = courses.find(c => c.id === effectiveCourseId);
                        const nextCalendarId = effectiveCourseId
                          ? (selectedCourse?.calendarId ?? eventEditDraft.calendarId ?? calendars[0]?.id ?? selectedEvent.calendarId)
                          : (eventEditDraft.calendarId || personalCalendars[0]?.id || calendars[0]?.id || selectedEvent.calendarId);

                        const patch: Partial<CalendarEvent> = {
                          title: eventEditDraft.title.trim() || selectedEvent.title,
                          startTime: nextStart.toISOString(),
                          endTime: nextEnd.toISOString(),
                          location: eventEditDraft.location.trim() ? eventEditDraft.location.trim() : undefined,
                          notes: eventEditDraft.notes.trim() ? eventEditDraft.notes.trim() : undefined,
                          courseId: effectiveCourseId || undefined,
                          calendarId: nextCalendarId,
                          source: eventEditDraft.entryType === 'exam' ? 'exam' : 'manual',
                          examKind: eventEditDraft.entryType === 'exam' ? eventEditDraft.examKind : undefined,
                          recurrence: eventEditDraft.recurrenceMode === 'none'
                            ? undefined
                            : eventEditDraft.recurrenceMode === 'daily'
                              ? {
                                  frequency: 'daily',
                                  intervalDays: Math.max(1, Number(eventEditDraft.intervalDays) || 1),
                                  until: eventEditDraft.untilYmd ? new Date(`${eventEditDraft.untilYmd}T23:59:59`).toISOString() : undefined,
                                }
                              : {
                                  frequency: 'weekly',
                                  byWeekday: eventEditDraft.byWeekday.length > 0 ? eventEditDraft.byWeekday : [isoWeekday(nextStart)],
                                  intervalWeeks: Math.max(1, Number(eventEditDraft.intervalWeeks) || 1),
                                  until: eventEditDraft.untilYmd ? new Date(`${eventEditDraft.untilYmd}T23:59:59`).toISOString() : undefined,
                                },
                        };

                        if (selectedEvent.id === 'new') {
                          onEventsChange([
                            ...events,
                            {
                              id: uid('evt'),
                              title: patch.title ?? selectedEvent.title,
                              startTime: patch.startTime ?? selectedEvent.startTime,
                              endTime: patch.endTime ?? selectedEvent.endTime,
                              calendarId: patch.calendarId ?? (calendars[0]?.id ?? 'default'),
                              courseId: patch.courseId,
                              location: patch.location,
                              notes: patch.notes,
                              source: patch.source ?? 'manual',
                              examKind: patch.examKind,
                            },
                          ]);
                          toast('Event created');
                        } else {
                          updateEvent(selectedEvent.id, patch);
                          toast('Event updated');
                        }
                        setSelectedEventId(null);
                        setEventEditDraft(null);
                      }}
                      disabled={!onEventsChange}
                      className={`px-4 py-2 text-sm font-medium rounded-xl transition-colors ${
                        onEventsChange
                          ? 'text-white bg-indigo-600 hover:bg-indigo-700'
                          : 'text-slate-300 bg-slate-100 cursor-not-allowed'
                      }`}
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {selectedEvent.location?.trim() && (
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                      <div className="text-xs font-semibold text-slate-600 mb-1">Location</div>
                      <div className="text-sm text-slate-700">{selectedEvent.location}</div>
                    </div>
                  )}

                  <div>
                    <div className="text-xs font-semibold text-slate-600 mb-1">Notes</div>
                    <div className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-2xl p-4 whitespace-pre-wrap">
                      {selectedEvent.notes?.trim() ? selectedEvent.notes : 'No notes yet.'}
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedEventId(null);
                        setEventEditDraft(null);
                      }}
                      className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-all"
                    >
                      Done
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showDeleteEventConfirm && Boolean(selectedEvent) && selectedEvent.source !== 'assignment'}
        title="Delete event?"
        message={
          selectedEvent
            ? showDeleteEventSeriesChoice
              ? `"${selectedEvent.title}" is recurring. Delete all in the series or only this one?`
              : `This will permanently delete "${selectedEvent.title}".`
            : ''
        }
        confirmLabel={showDeleteEventSeriesChoice ? 'Delete all' : 'Delete event'}
        secondaryLabel={showDeleteEventSeriesChoice ? 'Delete this one' : undefined}
        onSecondary={
          showDeleteEventSeriesChoice
            ? () => {
                if (!onEventsChange || !selectedEvent || selectedEvent.source === 'assignment') return;
                const targetId = selectedEventId ?? selectedEvent.id;
                const concrete = events.some(e => e.id === targetId);
                const baseId = getRecurringBaseId(targetId);
                onEventsChange(events.filter(e => concrete ? e.id !== targetId : e.id !== baseId));
                toast('Event deleted');
                setShowDeleteEventConfirm(false);
                setShowDeleteEventSeriesChoice(false);
                setSelectedEventId(null);
                setEventEditDraft(null);
              }
            : undefined
        }
        onCancel={() => {
          setShowDeleteEventConfirm(false);
          setShowDeleteEventSeriesChoice(false);
        }}
        onConfirm={() => {
          if (!onEventsChange || !selectedEvent || selectedEvent.source === 'assignment') return;
          if (showDeleteEventSeriesChoice) {
            const targetId = selectedEventId ?? selectedEvent.id;
            const baseId = getRecurringBaseId(targetId);
            onEventsChange(events.filter(e => getRecurringBaseId(e.id) !== baseId));
          } else {
            const targetId = selectedEventId ?? selectedEvent.id;
            const concrete = events.some(e => e.id === targetId);
            const baseId = getRecurringBaseId(targetId);
            onEventsChange(events.filter(e => concrete ? e.id !== targetId : e.id !== baseId));
          }
          toast('Event deleted');
          setShowDeleteEventConfirm(false);
          setShowDeleteEventSeriesChoice(false);
          setSelectedEventId(null);
          setEventEditDraft(null);
        }}
      />
    </div>
  );
};

export default CalendarView;
