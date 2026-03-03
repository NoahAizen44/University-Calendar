
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar as CalendarIcon, 
  BookOpen, 
  CheckSquare, 
  Sparkles, 
  Settings, 
  UserCircle2,
  Clock,
  Layers,
  ChevronDown
} from 'lucide-react';
import { Course, Assignment, StudySession, UniCalendar, CalendarEvent, CourseNote, CourseResource, RecurringTask, PlannerState } from './types';
import CalendarView from './components/CalendarView';
import AssignmentList from './components/AssignmentList';
import CourseManager from './components/CourseManager';
import CalendarManager from './components/CalendarManager';
import CourseDashboard from './components/CourseDashboard';
import GroupDashboard from './components/GroupDashboard';
import ToastHost from './components/ToastHost';
import AIAssistantWidget from './components/AIAssistantWidget';
import SettingsPage from './components/SettingsPage';
import AccountPage from './components/AccountPage';
import ActivityEventList from './components/ActivityEventList';
import { loadState, saveState } from './services/storage';
import { uid } from './services/id';
import { toast } from './services/toast';
import type { AssistantAction } from './services/assistantService';
import { clearStoredSession, isAuthConfigured, loadStoredSession, signInWithPassword, signUpWithPassword, storeSession, type AuthSession } from './services/auth';
import { isCloudSyncConfigured, loadCloudPlannerState, saveCloudPlannerState } from './services/cloudSync';
import { isExamEvent, withExamSource } from './services/eventClassification';

function getAssignmentDueEventId(assignmentId: string) {
  return `asg_due_${assignmentId}`;
}

function parseAssistantDateTimeLocal(input?: string) {
  if (!input) return null;
  const raw = input.trim();
  if (!raw) return null;

  // Treat assistant-provided timestamps as local wall-clock time.
  // This avoids timezone shifts when models return UTC/Z offsets.
  const m = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/
  );
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    const hour = Number(m[4] ?? '0');
    const minute = Number(m[5] ?? '0');
    const second = Number(m[6] ?? '0');
    const d = new Date(year, month - 1, day, hour, minute, second, 0);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

type CalendarScope = 'all' | 'academic' | 'personal';
type AppTab = 'calendar' | 'courses' | 'assignments' | 'events' | 'exams' | 'personal' | 'goals' | 'settings' | 'account';

const LEGACY_SAMPLE_CALENDAR_IDS = new Set(['cal_1', 'cal_personal']);
const LEGACY_SAMPLE_CALENDAR_NAMES = new Set(['semester']);
const LEGACY_SAMPLE_COURSE_IDS = new Set(['1', '2', '3']);
const LEGACY_SAMPLE_ASSIGNMENT_IDS = new Set(['a1', 'a2', 'a3']);
const LEGACY_SAMPLE_EVENT_IDS = new Set([
  'evt_1',
  getAssignmentDueEventId('a1'),
  getAssignmentDueEventId('a2'),
  getAssignmentDueEventId('a3'),
]);

const INITIAL_COURSES: Course[] = [];

const INITIAL_CALENDARS: UniCalendar[] = [];

const INITIAL_EVENTS: CalendarEvent[] = [];
const ASSISTANT_COLOR_POOL = ['bg-indigo-500', 'bg-blue-500', 'bg-emerald-500', 'bg-rose-500', 'bg-amber-500', 'bg-violet-500'];

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>('calendar');
  const [calendarScope, setCalendarScope] = useState<CalendarScope>('all');
  const [activitiesOpen, setActivitiesOpen] = useState(true);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const handleNavigate = (tab: AppTab) => {
    setActiveTab(tab);
    setSelectedCourseId(null);
    setSelectedGroupId(null);
  };

  const [calendars, setCalendars] = useState<UniCalendar[]>(INITIAL_CALENDARS);
  const [courses, setCourses] = useState<Course[]>(INITIAL_COURSES);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>(INITIAL_EVENTS);
  const [recurringTasks, setRecurringTasks] = useState<RecurringTask[]>([]);
  const [studySessions, setStudySessions] = useState<StudySession[]>([]);
  const [notes, setNotes] = useState<CourseNote[]>([]);
  const [resources, setResources] = useState<CourseResource[]>([]);
  const [assistantPreview, setAssistantPreview] = useState<null | {
    actions: AssistantAction[];
    nextAssignments: Assignment[];
    nextEvents: CalendarEvent[];
    nextCourses: Course[];
    nextCalendars: UniCalendar[];
    nextNotes: CourseNote[];
    nextResources: CourseResource[];
    createdAssignments: number;
    createdEvents: number;
    createdCourses: number;
    reassignedEvents: number;
    deletedAssignments: number;
    deletedEvents: number;
    deletedCourses: number;
    deletedItems: string[];
  }>(null);
  const [authSession, setAuthSession] = useState<AuthSession | null>(() => loadStoredSession());
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'idle' | 'syncing' | 'ok' | 'error'>('idle');
  const [cloudSyncError, setCloudSyncError] = useState<string | null>(null);
  const [cloudHydrated, setCloudHydrated] = useState(false);
  const normalizeEvents = (list: CalendarEvent[]) => list.map(e => withExamSource(e));

  const applyLoadedState = (loaded: PlannerState) => {
    const loadedCalendars = (loaded.calendars ?? []).filter(c => {
      const name = c.name.trim().toLowerCase();
      return !LEGACY_SAMPLE_CALENDAR_IDS.has(c.id) && !LEGACY_SAMPLE_CALENDAR_NAMES.has(name);
    });
    const nextCalendars = loadedCalendars;
    const nextCalendarIds = new Set(nextCalendars.map(c => c.id));

    const nextCourses = (loaded.courses ?? []).filter(c => !LEGACY_SAMPLE_COURSE_IDS.has(c.id));
    const nextAssignments = (loaded.assignments ?? []).filter(a => !LEGACY_SAMPLE_ASSIGNMENT_IDS.has(a.id));
    const nextEvents = (loaded.events ?? [])
      .filter(e => !LEGACY_SAMPLE_EVENT_IDS.has(e.id) && !LEGACY_SAMPLE_COURSE_IDS.has(e.courseId ?? ''))
      .map(e => (
        nextCalendarIds.has(e.calendarId)
          ? e
          : { ...e, calendarId: nextCalendars[0]?.id ?? e.calendarId }
      ));

    setCalendars(nextCalendars);
    setCourses(nextCourses);
    setAssignments(nextAssignments);
    setEvents(normalizeEvents(nextEvents));
    if (loaded.recurringTasks) setRecurringTasks(loaded.recurringTasks);
    if (loaded.studySessions) setStudySessions(loaded.studySessions);
    if (loaded.notes) setNotes(loaded.notes);
    if (loaded.resources) setResources(loaded.resources);
  };

  // Load persisted state once
  useEffect(() => {
    const loaded = loadState();
    if (!loaded) return;
    applyLoadedState(loaded);
  }, []);

  // If signed in, hydrate from cloud state once.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!authSession || !isCloudSyncConfigured()) {
        setCloudHydrated(false);
        setCloudSyncStatus('idle');
        return;
      }
      setCloudSyncStatus('syncing');
      try {
        const cloud = await loadCloudPlannerState(authSession);
        if (!cancelled && cloud) applyLoadedState(cloud);
        if (!cancelled) {
          setCloudHydrated(true);
          setCloudSyncStatus('ok');
          setCloudSyncError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setCloudHydrated(false);
          setCloudSyncStatus('error');
          setCloudSyncError(e instanceof Error ? e.message : 'Cloud sync failed');
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [authSession]);

  // Persist locally and optionally sync cloud
  useEffect(() => {
    const snapshot: PlannerState = { calendars, courses, assignments, recurringTasks, events, studySessions, notes, resources };
    saveState(snapshot);

    if (!authSession || !isCloudSyncConfigured() || !cloudHydrated) return;
    setCloudSyncStatus('syncing');
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          await saveCloudPlannerState(authSession, snapshot);
          setCloudSyncStatus('ok');
          setCloudSyncError(null);
        } catch (e) {
          setCloudSyncStatus('error');
          setCloudSyncError(e instanceof Error ? e.message : 'Cloud sync failed');
        }
      })();
    }, 700);
    return () => window.clearTimeout(t);
  }, [calendars, courses, assignments, recurringTasks, events, studySessions, notes, resources, authSession, cloudHydrated]);

  const handleSignIn = async (email: string, password: string) => {
    const session = await signInWithPassword(email, password);
    storeSession(session);
    setAuthSession(session);
    setCloudHydrated(false);
    toast('Signed in');
  };

  const handleSignUp = async (email: string, password: string) => {
    const session = await signUpWithPassword(email, password);
    storeSession(session);
    setAuthSession(session);
    setCloudHydrated(false);
    toast('Account created');
  };

  const handleSignOut = () => {
    clearStoredSession();
    setAuthSession(null);
    setCloudHydrated(false);
    setCloudSyncStatus('idle');
    setCloudSyncError(null);
    toast('Signed out');
  };

  // Auto-sync: ensure each incomplete assignment appears as an all-day "Due" event in the course calendar.
  useEffect(() => {
    setEvents(prev => {
      const byCourseId = new Map<string, Course>(courses.map(c => [c.id, c]));
      const dueEventsById = new Map<string, CalendarEvent>(
        prev.filter(e => e.source === 'assignment').map(e => [e.id, e])
      );

      const nextAssignmentEvents: CalendarEvent[] = [];
      for (const a of assignments) {
        if (a.completed) continue;
        if (!a.courseId) continue; // independent tasks don't belong to a class calendar
        const course = byCourseId.get(a.courseId);
        if (!course) continue;
        const calendarId = course.calendarId ?? calendars[0]?.id;
        if (!calendarId) continue;

        const start = new Date(a.dueDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);

        const id = getAssignmentDueEventId(a.id);
        const existing = dueEventsById.get(id);
        nextAssignmentEvents.push({
          id,
          title: `Due: ${a.title}`,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          calendarId,
          courseId: a.courseId,
          source: 'assignment',
          notes: existing?.notes,
        });
      }

      const keepNonAssignment = prev.filter(e => e.source !== 'assignment');
      return [...keepNonAssignment, ...nextAssignmentEvents];
    });
  }, [assignments, courses, calendars]);

  const addAssignment = (assignment: Omit<Assignment, 'id'>) => {
    const newAssignment = { ...assignment, id: uid('a') };
    setAssignments(prev => [...prev, newAssignment]);
    toast('Assignment created');
  };

  const toggleAssignment = (id: string) => {
    setAssignments(prev => prev.map(a => a.id === id ? { ...a, completed: !a.completed } : a));
  };

  const removeAssignment = (id: string) => {
    setAssignments(prev => prev.filter(a => a.id !== id));
    toast('Assignment deleted');
  };

  const visibleEvents = useMemo(
    () =>
      events.filter(e => {
        const cal = calendars.find(c => c.id === e.calendarId);
        // If an event points to a calendar that no longer exists, still show it
        // so it doesn't disappear from the UI.
        if (!cal) return true;
        return cal.visible;
      }),
    [events, calendars]
  );

  const academicCalendarIds = useMemo(
    () => new Set(courses.map(c => c.calendarId).filter((id): id is string => Boolean(id))),
    [courses]
  );

  const scopedVisibleEvents = useMemo(() => {
    return visibleEvents.filter(event => {
      const isAcademic = Boolean(event.courseId) || academicCalendarIds.has(event.calendarId);
      if (calendarScope === 'academic') return isAcademic;
      if (calendarScope === 'personal') return !isAcademic;
      return true;
    });
  }, [visibleEvents, academicCalendarIds, calendarScope]);

  const scopedVisibleEventIds = useMemo(
    () => new Set(scopedVisibleEvents.map(e => e.id)),
    [scopedVisibleEvents]
  );

  const resolveCourseByRef = (ref?: string, courseList: Course[] = courses) => {
    if (!ref) return undefined;
    const needle = ref.trim().toLowerCase();
    return courseList.find(
      c => c.id.toLowerCase() === needle || c.code.trim().toLowerCase() === needle || c.name.trim().toLowerCase().includes(needle)
    );
  };

  const resolveCalendarByRef = (ref?: string, calendarList: UniCalendar[] = calendars) => {
    if (!ref) return undefined;
    const needle = ref.trim().toLowerCase();
    return calendarList.find(c => c.id.toLowerCase() === needle || c.name.trim().toLowerCase().includes(needle));
  };

  const resolveEventIdsByRef = (ref?: string, eventList: CalendarEvent[] = events) => {
    if (!ref) return [];
    const needle = ref.trim().toLowerCase();
    const exactById = eventList.find(e => e.id.toLowerCase() === needle);
    if (exactById) return [exactById.id];
    return eventList
      .filter(e => e.source !== 'assignment')
      .filter(e => e.title.trim().toLowerCase().includes(needle))
      .map(e => e.id);
  };

  const resolveAssignmentIdsByRef = (ref?: string, assignmentList: Assignment[] = assignments) => {
    if (!ref) return [];
    const needle = ref.trim().toLowerCase();
    const exactById = assignmentList.find(a => a.id.toLowerCase() === needle);
    if (exactById) return [exactById.id];
    return assignmentList
      .filter(a => a.title.trim().toLowerCase().includes(needle))
      .map(a => a.id);
  };

  const simulateAssistantActions = (actions: AssistantAction[]) => {
    let nextAssignments = [...assignments];
    let nextEvents = [...events];
    let nextCourses = [...courses];
    let nextCalendars = [...calendars];
    let nextNotes = [...notes];
    let nextResources = [...resources];
    let createdAssignments = 0;
    let createdEvents = 0;
    let createdCourses = 0;
    let reassignedEvents = 0;
    let deletedAssignments = 0;
    let deletedEvents = 0;
    let deletedCourses = 0;
    const deletedItems: string[] = [];

    for (const action of actions) {
      if (action.type === 'create_assignment') {
        const resolvedCourse = resolveCourseByRef(action.courseRef, nextCourses);
        const dueDate = action.dueDate?.trim() || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const priority = action.priority ?? 'medium';
        nextAssignments.push({
          id: uid('a'),
          title: action.title,
          dueDate,
          dueTime: action.dueTime?.trim() || undefined,
          courseId: resolvedCourse?.id ?? '',
          priority,
          completed: false,
          estimatedHours: 1,
          description: action.description?.trim() || undefined,
          isGraded: Boolean(action.isGraded),
        });
        createdAssignments += 1;
        continue;
      }

      if (action.type === 'create_event' || action.type === 'create_exam') {
        const start = parseAssistantDateTimeLocal(action.startTime);
        const end = parseAssistantDateTimeLocal(action.endTime);
        if (!start || !end) continue;
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) continue;
        const resolvedCourse = resolveCourseByRef(action.courseRef, nextCourses);
        const resolvedCalendar =
          resolvedCourse?.calendarId
            ? nextCalendars.find(c => c.id === resolvedCourse.calendarId)
            : resolveCalendarByRef(action.calendarRef, nextCalendars);
        const explicitExam =
          action.type === 'create_exam' ||
          ('eventType' in action && action.eventType === 'exam');
        const examKind = 'examKind' in action && action.examKind ? action.examKind : undefined;
        const examWeightPercent =
          'examWeightPercent' in action && typeof action.examWeightPercent === 'number'
            ? action.examWeightPercent
            : undefined;
        const examTotalMarks =
          'examTotalMarks' in action && typeof action.examTotalMarks === 'number'
            ? action.examTotalMarks
            : undefined;
        nextEvents.push(withExamSource({
          id: uid('evt'),
          title: action.title,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          calendarId: resolvedCalendar?.id ?? nextCalendars[0]?.id ?? 'default',
          courseId: resolvedCourse?.id,
          location: action.location?.trim() || undefined,
          notes: action.notes?.trim() || undefined,
          source: explicitExam ? 'exam' : 'ai-import',
          examKind: explicitExam ? (examKind ?? 'exam') : undefined,
          examWeightPercent: explicitExam ? examWeightPercent : undefined,
          examTotalMarks: explicitExam ? examTotalMarks : undefined,
        }));
        createdEvents += 1;
        continue;
      }

      if (action.type === 'create_course') {
        const nextName = action.name?.trim();
        if (!nextName) continue;
        const duplicate = nextCourses.find(
          c => c.name.trim().toLowerCase() === nextName.toLowerCase() || (action.code && c.code.trim().toLowerCase() === action.code.trim().toLowerCase())
        );
        if (duplicate) continue;

        const safeColor = action.color?.trim() || ASSISTANT_COLOR_POOL[createdCourses % ASSISTANT_COLOR_POOL.length];
        const nextCalendarId = uid('cal');
        const nextCourseId = uid('c');

        nextCalendars.push({
          id: nextCalendarId,
          name: action.code?.trim() ? `${action.code.trim()} calendar` : `${nextName} calendar`,
          color: safeColor,
          visible: true,
        });

        nextCourses.push({
          id: nextCourseId,
          name: nextName,
          code: action.code?.trim() || nextName.slice(0, 8).toUpperCase(),
          color: safeColor,
          instructor: action.instructor?.trim() || '',
          calendarId: nextCalendarId,
        });
        createdCourses += 1;
        continue;
      }

      if (action.type === 'reassign_event_to_course') {
        const resolvedCourse = resolveCourseByRef(action.courseRef, nextCourses);
        if (!resolvedCourse) continue;
        const targetEventIds = resolveEventIdsByRef(action.eventRef, nextEvents);
        if (targetEventIds.length === 0) continue;
        nextEvents = nextEvents.map(e => (
          targetEventIds.includes(e.id)
            ? { ...e, courseId: resolvedCourse.id, calendarId: resolvedCourse.calendarId ?? e.calendarId }
            : e
        ));
        reassignedEvents += targetEventIds.length;
        continue;
      }

      if (action.type === 'delete_assignment') {
        const targetIds = resolveAssignmentIdsByRef(action.assignmentRef, nextAssignments);
        if (targetIds.length === 0) continue;
        const toDelete = new Set<string>();
        for (const assignmentId of targetIds) {
          const target = nextAssignments.find(a => a.id === assignmentId);
          if (!target) continue;
          if (action.deleteSeries) {
            for (const item of nextAssignments) {
              if (
                item.courseId === target.courseId &&
                item.title.trim().toLowerCase() === target.title.trim().toLowerCase()
              ) {
                toDelete.add(item.id);
              }
            }
          } else {
            toDelete.add(target.id);
          }
        }
        if (toDelete.size === 0) continue;
        const removed = nextAssignments.filter(a => toDelete.has(a.id));
        nextAssignments = nextAssignments.filter(a => !toDelete.has(a.id));
        deletedAssignments += removed.length;
        for (const a of removed.slice(0, 12)) {
          deletedItems.push(`Assignment: ${a.title}`);
        }
        continue;
      }

      if (action.type === 'delete_event') {
        const targetIds = resolveEventIdsByRef(action.eventRef, nextEvents);
        if (targetIds.length === 0) continue;
        const toDelete = new Set<string>();
        for (const eventId of targetIds) {
          const target = nextEvents.find(e => e.id === eventId);
          if (!target) continue;
          if (action.deleteSeries) {
            const baseId = eventId.replace(/_\d{4}-\d{1,2}-\d{1,2}$/, '');
            for (const item of nextEvents) {
              if (item.id === baseId || item.id.startsWith(`${baseId}_`)) {
                toDelete.add(item.id);
              }
            }
          } else {
            toDelete.add(target.id);
          }
        }
        if (toDelete.size === 0) continue;
        const removed = nextEvents.filter(e => toDelete.has(e.id));
        nextEvents = nextEvents.filter(e => !toDelete.has(e.id));
        deletedEvents += removed.length;
        for (const e of removed.slice(0, 12)) {
          deletedItems.push(`Event: ${e.title} (${new Date(e.startTime).toLocaleString()})`);
        }
        continue;
      }

      if (action.type === 'delete_course') {
        const target = resolveCourseByRef(action.courseRef, nextCourses);
        if (!target) continue;

        nextCourses = nextCourses.filter(c => c.id !== target.id);
        const removedAssignments = nextAssignments.filter(a => a.courseId === target.id);
        const removedEvents = nextEvents.filter(e => e.courseId === target.id);
        nextAssignments = nextAssignments.filter(a => a.courseId !== target.id);
        nextEvents = nextEvents.filter(e => e.courseId !== target.id);
        nextNotes = nextNotes.filter(n => n.courseId !== target.id);
        nextResources = nextResources.filter(r => r.courseId !== target.id);
        deletedCourses += 1;
        deletedAssignments += removedAssignments.length;
        deletedEvents += removedEvents.length;
        deletedItems.push(`Course: ${target.code} ${target.name}`);
        if (removedAssignments.length > 0) deletedItems.push(`  includes ${removedAssignments.length} assignment${removedAssignments.length === 1 ? '' : 's'}`);
        if (removedEvents.length > 0) deletedItems.push(`  includes ${removedEvents.length} event${removedEvents.length === 1 ? '' : 's'}`);

        if (target.calendarId) {
          const stillUsed = nextCourses.some(c => c.calendarId === target.calendarId);
          if (!stillUsed) {
            nextCalendars = nextCalendars.filter(cal => cal.id !== target.calendarId);
          }
        }
      }
    }

    return {
      actions,
      nextAssignments,
      nextEvents: normalizeEvents(nextEvents),
      nextCourses,
      nextCalendars,
      nextNotes,
      nextResources,
      createdAssignments,
      createdEvents,
      createdCourses,
      reassignedEvents,
      deletedAssignments,
      deletedEvents,
      deletedCourses,
      deletedItems: deletedItems.slice(0, 20),
    };
  };

  const previewAssistantActions = async (actions: AssistantAction[]) => {
    if (!actions.length) {
      setAssistantPreview(null);
      return {
        createdAssignments: 0,
        createdEvents: 0,
        createdCourses: 0,
        reassignedEvents: 0,
        deletedAssignments: 0,
        deletedEvents: 0,
        deletedCourses: 0,
      };
    }
    const simulated = simulateAssistantActions(actions);
    setAssistantPreview(simulated);
    return {
      createdAssignments: simulated.createdAssignments,
      createdEvents: simulated.createdEvents,
      createdCourses: simulated.createdCourses,
      reassignedEvents: simulated.reassignedEvents,
      deletedAssignments: simulated.deletedAssignments,
      deletedEvents: simulated.deletedEvents,
      deletedCourses: simulated.deletedCourses,
    };
  };

  const confirmAssistantPreview = async () => {
    if (!assistantPreview) {
      return {
        createdAssignments: 0,
        createdEvents: 0,
        createdCourses: 0,
        reassignedEvents: 0,
        deletedAssignments: 0,
        deletedEvents: 0,
        deletedCourses: 0,
      };
    }
    setAssignments(assistantPreview.nextAssignments);
    setEvents(assistantPreview.nextEvents);
    setCourses(assistantPreview.nextCourses);
    setCalendars(assistantPreview.nextCalendars);
    setNotes(assistantPreview.nextNotes);
    setResources(assistantPreview.nextResources);

    if (assistantPreview.createdAssignments > 0) toast(`Created ${assistantPreview.createdAssignments} assignment${assistantPreview.createdAssignments === 1 ? '' : 's'}`);
    if (assistantPreview.createdEvents > 0) toast(`Created ${assistantPreview.createdEvents} event${assistantPreview.createdEvents === 1 ? '' : 's'}`);
    if (assistantPreview.createdCourses > 0) toast(`Created ${assistantPreview.createdCourses} course${assistantPreview.createdCourses === 1 ? '' : 's'}`);
    if (assistantPreview.reassignedEvents > 0) toast(`Assigned ${assistantPreview.reassignedEvents} event${assistantPreview.reassignedEvents === 1 ? '' : 's'} to course${assistantPreview.reassignedEvents === 1 ? '' : 's'}`);
    if (assistantPreview.deletedAssignments > 0) toast(`Deleted ${assistantPreview.deletedAssignments} assignment${assistantPreview.deletedAssignments === 1 ? '' : 's'}`);
    if (assistantPreview.deletedEvents > 0) toast(`Deleted ${assistantPreview.deletedEvents} event${assistantPreview.deletedEvents === 1 ? '' : 's'}`);
    if (assistantPreview.deletedCourses > 0) toast(`Deleted ${assistantPreview.deletedCourses} course${assistantPreview.deletedCourses === 1 ? '' : 's'}`);

    const summary = {
      createdAssignments: assistantPreview.createdAssignments,
      createdEvents: assistantPreview.createdEvents,
      createdCourses: assistantPreview.createdCourses,
      reassignedEvents: assistantPreview.reassignedEvents,
      deletedAssignments: assistantPreview.deletedAssignments,
      deletedEvents: assistantPreview.deletedEvents,
      deletedCourses: assistantPreview.deletedCourses,
    };
    setAssistantPreview(null);
    return summary;
  };

  const discardAssistantPreview = () => {
    setAssistantPreview(null);
  };

  const previewCalendars = assistantPreview?.nextCalendars ?? calendars;
  const previewCourses = assistantPreview?.nextCourses ?? courses;
  const previewEvents = assistantPreview?.nextEvents ?? events;
  const previewVisibleEvents = useMemo(
    () =>
      previewEvents.filter(e => {
        const cal = previewCalendars.find(c => c.id === e.calendarId);
        if (!cal) return true;
        return cal.visible;
      }),
    [previewEvents, previewCalendars]
  );
  const previewAcademicCalendarIds = useMemo(
    () => new Set(previewCourses.map(c => c.calendarId).filter((id): id is string => Boolean(id))),
    [previewCourses]
  );
  const previewScopedVisibleEvents = useMemo(() => {
    return previewVisibleEvents.filter(event => {
      const isAcademic = Boolean(event.courseId) || previewAcademicCalendarIds.has(event.calendarId);
      if (calendarScope === 'academic') return isAcademic;
      if (calendarScope === 'personal') return !isAcademic;
      return true;
    });
  }, [previewVisibleEvents, previewAcademicCalendarIds, calendarScope]);

  const tabTitle = useMemo(() => {
    if (activeTab === 'events') return 'Events';
    if (activeTab === 'exams') return 'Exams';
    if (activeTab === 'personal') return 'Personal';
    return activeTab.charAt(0).toUpperCase() + activeTab.slice(1);
  }, [activeTab]);

  const activityTabs: AppTab[] = ['assignments', 'events', 'exams'];
  const activityEvents = useMemo(
    () => events.filter(e => e.source !== 'assignment' && !isExamEvent(e)).sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()),
    [events]
  );
  const examEvents = useMemo(
    () => events.filter(e => e.source !== 'assignment' && isExamEvent(e)).sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()),
    [events]
  );

  return (
    <div className="flex h-screen bg-slate-50">
      <ToastHost />
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col hidden md:flex">
        <div className="p-6">
          <div className="flex items-center gap-2 text-indigo-600 font-bold text-xl mb-8">
            <Sparkles className="w-6 h-6" />
            <span>ScholarSync</span>
          </div>
          
          <nav className="space-y-1">
            <NavItem 
              icon={<CalendarIcon className="w-5 h-5" />} 
              label="Calendar" 
              active={activeTab === 'calendar'} 
              onClick={() => handleNavigate('calendar')} 
            />
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setActivitiesOpen(v => !v)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                  activityTabs.includes(activeTab)
                    ? 'bg-indigo-50 text-indigo-600 font-semibold'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
              >
                <CheckSquare className="w-5 h-5" />
                <span className="text-sm flex-1 text-left">Activities</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${activitiesOpen ? 'rotate-180' : ''}`} />
              </button>
              {activitiesOpen && (
                <div className="ml-4 pl-3 border-l border-slate-200 space-y-1">
                  <SubNavItem label="Assignments" active={activeTab === 'assignments'} onClick={() => handleNavigate('assignments')} />
                  <SubNavItem label="Events" active={activeTab === 'events'} onClick={() => handleNavigate('events')} />
                  <SubNavItem label="Exams" active={activeTab === 'exams'} onClick={() => handleNavigate('exams')} />
                </div>
              )}
            </div>
            <NavItem 
              icon={<BookOpen className="w-5 h-5" />} 
              label="Courses" 
              active={activeTab === 'courses'} 
              onClick={() => handleNavigate('courses')} 
            />
            <NavItem 
              icon={<Layers className="w-5 h-5" />} 
              label="Personal" 
              active={activeTab === 'personal'} 
              onClick={() => handleNavigate('personal')} 
            />
            <NavItem 
              icon={<Clock className="w-5 h-5" />} 
              label="Goals" 
              active={activeTab === 'goals'} 
              onClick={() => handleNavigate('goals')} 
            />
          </nav>
        </div>

        <div className="mt-auto p-6 border-t border-slate-100 space-y-2">
          <NavItem
            icon={<Settings className="w-5 h-5" />}
            label="Settings"
            active={activeTab === 'settings'}
            onClick={() => handleNavigate('settings')}
          />
          <NavItem
            icon={<UserCircle2 className="w-5 h-5" />}
            label="Account"
            active={activeTab === 'account'}
            onClick={() => handleNavigate('account')}
          />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 sticky top-0 z-10">
          <h1 className="text-xl font-semibold">{tabTitle}</h1>
          <div />
        </header>

        <div className="p-8 max-w-7xl mx-auto">
          {selectedGroupId && (() => {
            const group = calendars.find(c => c.id === selectedGroupId);
            if (!group) return null;
            return (
              <GroupDashboard
                group={group}
                events={events}
                allGroups={calendars}
                onUpdateGroups={setCalendars}
                onUpdateEvents={(next) => setEvents(normalizeEvents(next))}
                onBack={() => setSelectedGroupId(null)}
              />
            );
          })()}

          {selectedCourseId && (() => {
            const course = courses.find(c => c.id === selectedCourseId);
            if (!course) return null;
            return (
              <CourseDashboard
                course={course}
                 calendars={calendars}
                 onCourseChange={(nextCourse) => setCourses(prev => prev.map(c => (c.id === nextCourse.id ? nextCourse : c)))}
                onDeleteCourse={(courseId) => {
                  const removed = courses.find(c => c.id === courseId);
                  setCourses(prev => prev.filter(c => c.id !== courseId));
                  setAssignments(prev => prev.filter(a => a.courseId !== courseId));
                  setNotes(prev => prev.filter(n => n.courseId !== courseId));
                  setResources(prev => prev.filter(r => r.courseId !== courseId));
                  setEvents(prev => prev.filter(e => e.courseId !== courseId));
                  if (removed?.calendarId) {
                    const stillUsed = courses.some(c => c.id !== courseId && c.calendarId === removed.calendarId);
                    if (!stillUsed) {
                      setCalendars(prev => prev.filter(cal => cal.id !== removed.calendarId));
                    }
                  }
                  setSelectedCourseId(null);
                  toast('Course deleted');
                }}
                assignments={assignments}
                events={events}
                notes={notes}
                resources={resources}
                onAssignmentsChange={setAssignments}
                onEventsChange={(next) => setEvents(normalizeEvents(next))}
                onNotesChange={setNotes}
                onResourcesChange={setResources}
                onBack={() => setSelectedCourseId(null)}
              />
            );
          })()}

          {!selectedCourseId && !selectedGroupId && (
          <>
          {activeTab === 'calendar' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              {assistantPreview && (
                <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
                  AI preview mode is on. Calendar is showing proposed changes only. Confirm or discard in the assistant widget.
                </div>
              )}
              <div className="mb-5 inline-flex rounded-xl border border-slate-200 p-1 bg-slate-50">
                {([
                  { id: 'all', label: 'All' },
                  { id: 'academic', label: 'Academic' },
                  { id: 'personal', label: 'Personal' },
                ] as const).map(option => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setCalendarScope(option.id)}
                    className={`px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors ${
                      calendarScope === option.id
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <CalendarView
                assignments={assignments}
                studySessions={studySessions}
                courses={previewCourses}
                events={assistantPreview ? previewScopedVisibleEvents : scopedVisibleEvents}
                calendars={previewCalendars}
                assignmentScope={calendarScope}
                fullView
                onEventsChange={assistantPreview ? undefined : (nextScopedEvents) => {
                  setEvents(prev => {
                    const preserved = prev.filter(e => !scopedVisibleEventIds.has(e.id));
                    return normalizeEvents([...preserved, ...nextScopedEvents]);
                  });
                }}
                onAssignmentsChange={assistantPreview ? undefined : setAssignments}
                onAddAssignment={assistantPreview ? undefined : addAssignment}
              />
            </div>
          )}

          {activeTab === 'assignments' && (
            <AssignmentList 
              assignments={assignments} 
              courses={courses} 
              onAdd={addAssignment} 
              onChange={setAssignments}
              onToggle={toggleAssignment}
              onRemove={removeAssignment}
            />
          )}

          {activeTab === 'events' && (
            <ActivityEventList
              mode="events"
              events={activityEvents}
              courses={courses}
              calendars={calendars}
              onAdd={(event) => setEvents(prev => normalizeEvents([...prev, { ...event, id: uid('evt') }]))}
              onChange={(nextVisible) => {
                const visibleIds = new Set(activityEvents.map(e => e.id));
                setEvents(prev => {
                  const keep = prev.filter(e => !visibleIds.has(e.id));
                  return normalizeEvents([...keep, ...nextVisible]);
                });
              }}
            />
          )}

          {activeTab === 'exams' && (
            <ActivityEventList
              mode="exams"
              events={examEvents}
              courses={courses}
              calendars={calendars}
              onAdd={(event) => setEvents(prev => normalizeEvents([...prev, { ...event, id: uid('evt'), source: 'exam' }]))}
              onChange={(nextVisible) => {
                const visibleIds = new Set(examEvents.map(e => e.id));
                setEvents(prev => {
                  const keep = prev.filter(e => !visibleIds.has(e.id));
                  return normalizeEvents([...keep, ...nextVisible]);
                });
              }}
            />
          )}

          {activeTab === 'courses' && (
            <CourseManager courses={courses} onUpdate={setCourses} onOpenCourse={(id) => setSelectedCourseId(id)} />
          )}

          {activeTab === 'personal' && (
            <CalendarManager
              calendars={calendars}
              onUpdate={setCalendars}
              onOpenGroup={(id) => setSelectedGroupId(id)}
            />
          )}

          {activeTab === 'goals' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-800">Goals</h2>
                <p className="text-slate-500">Set weekly goals and track your progress.</p>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                <div className="text-sm text-slate-600">
                  Coming next: customizable weekly hour goal, streaks, and per-group targets.
                </div>
              </div>
            </div>
          )}

          {activeTab === 'settings' && <SettingsPage />}

          {activeTab === 'account' && (
            <AccountPage
              session={authSession}
              authConfigured={isAuthConfigured()}
              syncStatus={cloudSyncStatus}
              syncError={cloudSyncError}
              onSignIn={handleSignIn}
              onSignUp={handleSignUp}
              onSignOut={handleSignOut}
            />
          )}
          </>
          )}
        </div>
      </main>
      <AIAssistantWidget
        assignments={assignments}
        courses={courses}
        events={events}
        calendars={calendars}
        notes={notes}
        resources={resources}
        onPreviewActions={previewAssistantActions}
        onConfirmPreview={confirmAssistantPreview}
        onDiscardPreview={discardAssistantPreview}
        previewActive={Boolean(assistantPreview)}
        previewDeletedItems={assistantPreview?.deletedItems ?? []}
      />
    </div>
  );
};

const NavItem: React.FC<{ icon: React.ReactNode; label: string; active?: boolean; onClick: () => void }> = ({ icon, label, active, onClick }) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
      active 
        ? 'bg-indigo-50 text-indigo-600 font-semibold' 
        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
    }`}
  >
    {icon}
    <span className="text-sm">{label}</span>
  </button>
);

const SubNavItem: React.FC<{ label: string; active?: boolean; onClick: () => void }> = ({ label, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
      active ? 'bg-indigo-100 text-indigo-700 font-semibold' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
    }`}
  >
    {label}
  </button>
);

export default App;
