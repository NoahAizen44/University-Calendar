import React, { useEffect, useMemo, useState } from 'react';
import { 
  ArrowLeft, 
  MapPin, 
  User, 
  MoreVertical, 
  Calendar as CalendarIcon, 
  CheckSquare, 
  FileText,
  Plus,
  StickyNote,
  Folder,
  Upload,
  Download,
  Trash2,
  ChevronRight,
  Maximize2,
  Minimize2,
  Pencil,
  Filter
} from 'lucide-react';
import { Course, Assignment, AssignmentAttachment, CalendarEvent, CourseNote, CourseResource, CourseResourceFile, CourseResourceFolder, Priority, UniCalendar } from '../types';
import CalendarView from './CalendarView';
import AddTaskModal from './AddTaskModal';
import ConfirmDialog from './ConfirmDialog';
import DatePicker from './DatePicker';
import { uid } from '../services/id';
import { putBlob, getBlob, deleteBlob } from '../services/idb';
import { toast } from '../services/toast';
import { isExamEvent } from '../services/eventClassification';

interface CourseDashboardProps {
  course: Course;
  calendars: UniCalendar[];
  assignments: Assignment[];
  events: CalendarEvent[];
  notes: CourseNote[];
  resources: CourseResource[];
  onCourseChange: (course: Course) => void;
  onAssignmentsChange: (assignments: Assignment[]) => void;
  onEventsChange: (events: CalendarEvent[]) => void;
  onNotesChange: (notes: CourseNote[]) => void;
  onResourcesChange: (resources: CourseResource[]) => void;
  onBack: () => void;
  onEdit?: () => void;
  onDeleteCourse?: (courseId: string) => void;
}

type GoalKind = 'manual' | 'attendance' | 'assignment-grade';

type CourseGoal = {
  id: string;
  title: string;
  kind: GoalKind;
  target: number;
  manualValue?: number;
  assignmentId?: string;
  note?: string;
};

const CourseDashboard: React.FC<CourseDashboardProps> = ({ 
  course, 
  calendars,
  assignments, 
  events, 
  notes,
  resources,
  onCourseChange,
  onAssignmentsChange,
  onEventsChange,
  onNotesChange,
  onResourcesChange,
  onBack, 
  onEdit,
  onDeleteCourse,
}) => {
  const [activeTab, setActiveTab] = useState<'assignments' | 'calendar' | 'events' | 'exams' | 'library' | 'goals'>('calendar');

  const [assignmentFilter, setAssignmentFilter] = useState<'all' | 'upcoming' | 'today' | 'week' | 'overdue' | 'completed'>('all');
  const [assignmentNextRecurringOnly, setAssignmentNextRecurringOnly] = useState(false);
  const [showAssignmentFilter, setShowAssignmentFilter] = useState(false);

  const [showAddTask, setShowAddTask] = useState(false);
  const [goals, setGoals] = useState<CourseGoal[]>([]);
  const [showGoalCreate, setShowGoalCreate] = useState(false);
  const [goalDraft, setGoalDraft] = useState<{
    title: string;
    kind: GoalKind;
    target: string;
    manualValue: string;
    assignmentId: string;
    note: string;
  }>({
    title: '',
    kind: 'manual',
    target: '',
    manualValue: '',
    assignmentId: '',
    note: '',
  });
  const [attendanceByEventId, setAttendanceByEventId] = useState<Record<string, boolean>>({});

  const [eventListFilter, setEventListFilter] = useState<'upcoming' | 'past' | 'all'>('all');
  const [eventNextRecurringOnly, setEventNextRecurringOnly] = useState(false);
  const [showEventFilter, setShowEventFilter] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [eventNotesDraft, setEventNotesDraft] = useState<string>('');


  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [pendingAssignmentDelete, setPendingAssignmentDelete] = useState<Assignment | null>(null);
  const [pendingAttachmentDelete, setPendingAttachmentDelete] = useState<{ assignmentId: string; attachment: AssignmentAttachment } | null>(null);
  const [pendingResourceDelete, setPendingResourceDelete] = useState<CourseResource | null>(null);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [folderNameDraft, setFolderNameDraft] = useState('');
  const [showCourseMenu, setShowCourseMenu] = useState(false);
  const [showEditCourseModal, setShowEditCourseModal] = useState(false);
  const [showDeleteCourseConfirm, setShowDeleteCourseConfirm] = useState(false);
  const [courseDraft, setCourseDraft] = useState({
    code: '',
    name: '',
    instructor: '',
    color: 'bg-indigo-600',
    startDate: '',
    endDate: '',
  });
  const [editingAssignment, setEditingAssignment] = useState(false);
  const [editDraft, setEditDraft] = useState<{
    title: string;
    dueDate: string;
    priority: Priority;
    description: string;
    isGraded: boolean;
    weightPercent: string;
    pointsPossible: string;
  } | null>(null);
  const selectedAssignment = useMemo(
    () => (selectedAssignmentId ? assignments.find(a => a.id === selectedAssignmentId) ?? null : null),
    [assignments, selectedAssignmentId]
  );

  React.useEffect(() => {
    if (!selectedAssignment) {
      setEditingAssignment(false);
      setEditDraft(null);
      return;
    }
    setEditingAssignment(false);
    setEditDraft({
      title: selectedAssignment.title,
      dueDate: new Date(selectedAssignment.dueDate).toISOString().slice(0, 10),
      priority: selectedAssignment.priority,
      description: selectedAssignment.description ?? '',
      isGraded: Boolean(selectedAssignment.isGraded),
      weightPercent: typeof selectedAssignment.weightPercent === 'number' ? String(selectedAssignment.weightPercent) : '',
      pointsPossible: typeof selectedAssignment.pointsPossible === 'number' ? String(selectedAssignment.pointsPossible) : '',
    });
  }, [selectedAssignmentId]);

  useEffect(() => {
    setCourseDraft({
      code: course.code ?? '',
      name: course.name ?? '',
      instructor: course.instructor === '—' ? '' : (course.instructor ?? ''),
      color: course.color ?? 'bg-indigo-600',
      startDate: course.startDate ? new Date(course.startDate).toISOString().slice(0, 10) : '',
      endDate: course.endDate ? new Date(course.endDate).toISOString().slice(0, 10) : '',
    });
  }, [course.id, course.code, course.name, course.instructor, course.color, course.startDate, course.endDate]);

  const [expandedPanel, setExpandedPanel] = useState<'notes' | 'resources' | null>(null);

  // Notes state
  const courseNotes = useMemo(() => notes.filter(n => n.courseId === course.id).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()), [notes, course.id]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const activeNote = useMemo(() => courseNotes.find(n => n.id === activeNoteId) ?? null, [courseNotes, activeNoteId]);

  // Resources state
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const courseResources = useMemo(() => resources.filter(r => r.courseId === course.id), [resources, course.id]);

  const breadcrumbs = useMemo(() => {
    const byId = new Map(courseResources.map(r => [r.id, r] as const));
    const chain: CourseResourceFolder[] = [];
    let current = activeFolderId ? (byId.get(activeFolderId) as CourseResourceFolder | undefined) : undefined;
    while (current) {
      if (current.kind !== 'folder') break;
      chain.unshift(current);
      current = current.parentId ? (byId.get(current.parentId) as CourseResourceFolder | undefined) : undefined;
    }
    return chain;
  }, [courseResources, activeFolderId]);

  const folderChildren = useMemo(() => {
    const parentId = activeFolderId;
    return courseResources
      .filter(r => r.parentId === parentId)
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [courseResources, activeFolderId]);

  // Filter for this course
  const courseAssignments = useMemo(() => 
    assignments
      .filter(a => a.courseId === course.id)
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()),
    [assignments, course.id]
  );

  const visibleCourseAssignments = useMemo(() => {
    const getDueDeadline = (a: Assignment) => {
      const base = new Date(a.dueDate);
      if (!a.dueTime) {
        base.setHours(23, 59, 59, 999);
        return base;
      }
      const [hh, mm] = a.dueTime.split(':').map(Number);
      base.setHours(Number.isFinite(hh) ? hh : 23, Number.isFinite(mm) ? mm : 59, 0, 0);
      return base;
    };
    const isSameDay = (d: Date, ref: Date) =>
      d.getFullYear() === ref.getFullYear() &&
      d.getMonth() === ref.getMonth() &&
      d.getDate() === ref.getDate();
    const now = new Date();
    const endOfWeek = new Date(now);
    endOfWeek.setDate(now.getDate() + ((7 - now.getDay()) % 7));
    endOfWeek.setHours(23, 59, 59, 999);

    let byFilter: Assignment[];
    if (assignmentFilter === 'today') byFilter = courseAssignments.filter(a => !a.completed && isSameDay(getDueDeadline(a), now));
    else if (assignmentFilter === 'week') {
      byFilter = courseAssignments.filter(a => {
        if (a.completed) return false;
        const due = getDueDeadline(a).getTime();
        return due >= now.getTime() && due <= endOfWeek.getTime();
      });
    } else if (assignmentFilter === 'overdue') byFilter = courseAssignments.filter(a => !a.completed && getDueDeadline(a).getTime() < now.getTime());
    else if (assignmentFilter === 'upcoming') byFilter = courseAssignments.filter(a => !a.completed);
    else if (assignmentFilter === 'completed') byFilter = courseAssignments.filter(a => a.completed);
    else byFilter = courseAssignments;

    if (!assignmentNextRecurringOnly) return byFilter;

    const grouped = new Map<string, Assignment[]>();
    for (const a of byFilter) {
      const key = `${a.courseId || '__independent__'}|${a.title.trim().toLowerCase()}`;
      const list = grouped.get(key);
      if (list) list.push(a);
      else grouped.set(key, [a]);
    }

    const collapsed: Assignment[] = [];
    for (const list of grouped.values()) {
      if (list.length < 2) continue;
      const sorted = list.slice().sort((a, b) => getDueDeadline(a).getTime() - getDueDeadline(b).getTime());
      const next = sorted.find(a => getDueDeadline(a).getTime() >= now.getTime());
      collapsed.push(next ?? sorted[sorted.length - 1]);
    }

    return collapsed.sort((a, b) => getDueDeadline(a).getTime() - getDueDeadline(b).getTime());
  }, [courseAssignments, assignmentFilter, assignmentNextRecurringOnly]);

  const updateAssignment = (assignmentId: string, patch: Partial<Assignment>) => {
    onAssignmentsChange(assignments.map(a => (a.id === assignmentId ? { ...a, ...patch } : a)));
  };

  const uploadAssignmentFiles = async (a: Assignment, files: FileList | null) => {
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

    updateAssignment(a.id, { attachments: [...(a.attachments ?? []), ...created] });
  };

  const openAssignmentAttachment = async (att: AssignmentAttachment) => {
    const blob = await getBlob(att.blobId);
    if (!blob) {
      toast('File attachment is missing. It may have been cleared from local storage.');
      return;
    }
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const downloadAssignmentAttachment = async (att: AssignmentAttachment) => {
    const blob = await getBlob(att.blobId);
    if (!blob) {
      toast('File attachment is missing. It may have been cleared from local storage.');
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = att.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5_000);
  };

  const deleteAssignmentAttachment = (assignmentId: string, att: AssignmentAttachment) => {
    setPendingAttachmentDelete({ assignmentId, attachment: att });
  };

  const upcomingEvents = useMemo(() => {
    // Simple filter for next event (not expanding recurrence perfectly here for simplicity, 
    // but in a real app we'd use the recurrence logic from CalendarView)
    return events
      .filter(e => e.courseId === course.id)
      // For now just manual check if it's in future based on start time or recurrence
      // This is a placeholder for better "Next Class" logic
      .slice(0, 3); 
  }, [events, course.id]);

  const stats = {
    pendingAssignments: courseAssignments.filter(a => !a.completed).length,
    completedAssignments: courseAssignments.filter(a => a.completed).length,
    nextProp: courseAssignments.find(a => !a.completed),
  };
  const goalsStorageKey = `course_custom_goals_${course.id}`;
  const attendanceStorageKey = `course_attendance_${course.id}`;
  const courseColorOptions = [
    'bg-indigo-600',
    'bg-emerald-600',
    'bg-rose-600',
    'bg-amber-500',
    'bg-sky-600',
    'bg-violet-600',
    'bg-teal-600',
    'bg-slate-600',
  ];

  useEffect(() => {
    try {
      const rawGoals = localStorage.getItem(goalsStorageKey);
      if (rawGoals) {
        const parsed = JSON.parse(rawGoals) as CourseGoal[];
        if (Array.isArray(parsed)) setGoals(parsed);
      }
      const rawAttendance = localStorage.getItem(attendanceStorageKey);
      if (rawAttendance) {
        const parsed = JSON.parse(rawAttendance) as Record<string, boolean>;
        if (parsed && typeof parsed === 'object') setAttendanceByEventId(parsed);
      }
    } catch {
      // ignore
    }
  }, [goalsStorageKey, attendanceStorageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(goalsStorageKey, JSON.stringify(goals));
    } catch {
      // ignore
    }
  }, [goalsStorageKey, goals]);

  useEffect(() => {
    try {
      localStorage.setItem(attendanceStorageKey, JSON.stringify(attendanceByEventId));
    } catch {
      // ignore
    }
  }, [attendanceStorageKey, attendanceByEventId]);

  const courseOnlyEvents = useMemo(
    () => events.filter(e => e.courseId === course.id && e.source !== 'assignment'),
    [events, course.id]
  );
  const courseExamEvents = useMemo(
    () => courseOnlyEvents.filter(e => isExamEvent(e)),
    [courseOnlyEvents]
  );
  const courseNonExamEvents = useMemo(
    () => courseOnlyEvents.filter(e => !isExamEvent(e)),
    [courseOnlyEvents]
  );

  const attendanceStats = useMemo(() => {
    const total = courseOnlyEvents.length;
    const attended = courseOnlyEvents.reduce((sum, ev) => sum + (attendanceByEventId[ev.id] ? 1 : 0), 0);
    return {
      total,
      attended,
      percent: total > 0 ? Math.round((attended / total) * 100) : 0,
    };
  }, [courseOnlyEvents, attendanceByEventId]);

  const goalProgress = useMemo(() => {
    return goals.map(goal => {
      let current = 0;
      let subtitle = '';
      if (goal.kind === 'manual') {
        current = Number(goal.manualValue ?? 0);
        subtitle = `Manual: ${current}`;
      } else if (goal.kind === 'attendance') {
        current = attendanceStats.percent;
        subtitle = `${attendanceStats.attended}/${attendanceStats.total} events attended`;
      } else {
        const assignment = courseAssignments.find(a => a.id === goal.assignmentId);
        if (
          assignment &&
          typeof assignment.pointsEarned === 'number' &&
          typeof assignment.pointsPossible === 'number' &&
          assignment.pointsPossible > 0
        ) {
          current = Math.round((assignment.pointsEarned / assignment.pointsPossible) * 100);
          subtitle = `${assignment.pointsEarned}/${assignment.pointsPossible} (${current}%)`;
        } else {
          current = 0;
          subtitle = 'No grade entered yet';
        }
      }
      const pct = goal.target > 0 ? Math.min(100, Math.round((current / goal.target) * 100)) : 0;
      return { ...goal, current, pct, subtitle };
    });
  }, [goals, attendanceStats, courseAssignments]);

  useEffect(() => {
    if (course.calendarId) return;
    if (!calendars[0]) return;
    onCourseChange({ ...course, calendarId: calendars[0].id });
  }, [course, calendars, onCourseChange]);

  const selectedEvent = useMemo(
    () => (selectedEventId ? courseOnlyEvents.find(e => e.id === selectedEventId) ?? null : null),
    [courseOnlyEvents, selectedEventId]
  );
  useEffect(() => {
    if (!selectedEvent) return;
    setEventNotesDraft(selectedEvent.notes ?? '');
  }, [selectedEvent]);

  React.useEffect(() => {
    if (!selectedEvent) {
      setEventNotesDraft('');
      return;
    }
    setEventNotesDraft(selectedEvent.notes ?? '');
  }, [selectedEventId]);

  const saveEventNotes = () => {
    if (!selectedEvent) return;
    const next = events.map(e => (e.id === selectedEvent.id ? { ...e, notes: eventNotesDraft.trim() || undefined } : e));
    onEventsChange(next);
    setSelectedEventId(null);
    toast('Event updated');
  };

  const visibleCourseEvents = useMemo(() => {
    const now = Date.now();
    const filtered = courseNonExamEvents.filter(ev => {
      const end = new Date(ev.endTime).getTime();
      if (eventListFilter === 'all') return true;
      if (eventListFilter === 'upcoming') return end >= now;
      return end < now;
    });

    let sorted = filtered
      .slice()
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    if (eventNextRecurringOnly) {
      const groups = new Map<string, CalendarEvent[]>();
      const getRecurringBaseId = (id: string) => id.replace(/_\d{4}-\d{1,2}-\d{1,2}$/, '');

      for (const ev of sorted) {
        const isRecurring = ev.recurrence?.frequency && ev.recurrence.frequency !== 'none';
        if (!isRecurring) continue;
        const key = getRecurringBaseId(ev.id);
        const list = groups.get(key);
        if (list) list.push(ev);
        else groups.set(key, [ev]);
      }

      const collapsedRecurring: CalendarEvent[] = [];
      for (const list of groups.values()) {
        const next = list.find(ev => new Date(ev.endTime).getTime() >= now);
        collapsedRecurring.push(next ?? list[list.length - 1]);
      }

      sorted = collapsedRecurring.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    }

    return eventListFilter === 'past' ? sorted.reverse() : sorted;
  }, [courseNonExamEvents, eventListFilter, eventNextRecurringOnly]);

  const visibleCourseExamEvents = useMemo(() => {
    const now = Date.now();
    const filtered = courseExamEvents.filter(ev => {
      const end = new Date(ev.endTime).getTime();
      if (eventListFilter === 'all') return true;
      if (eventListFilter === 'upcoming') return end >= now;
      return end < now;
    });

    const sorted = filtered
      .slice()
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    return eventListFilter === 'past' ? sorted.reverse() : sorted;
  }, [courseExamEvents, eventListFilter]);

  const createNote = () => {
    const now = new Date().toISOString();
    const note: CourseNote = {
      id: uid('note'),
      courseId: course.id,
      title: `New note`,
      content: '',
      createdAt: now,
      updatedAt: now,
    };
    onNotesChange([note, ...notes]);
    setActiveNoteId(note.id);
  };

  const updateNote = (patch: Partial<CourseNote>) => {
    if (!activeNote) return;
    const next = notes.map(n => n.id === activeNote.id ? { ...n, ...patch, updatedAt: new Date().toISOString() } : n);
    onNotesChange(next);
  };

  const deleteNote = (id: string) => {
    const next = notes.filter(n => n.id !== id);
    onNotesChange(next);
    if (activeNoteId === id) setActiveNoteId(null);
  };

  const createFolder = () => {
    setFolderNameDraft('');
    setShowCreateFolderModal(true);
  };

  const submitCreateFolder = () => {
    const name = folderNameDraft.trim();
    if (!name) {
      toast('Please enter a folder name.');
      return;
    }
    const now = new Date().toISOString();
    const folder: CourseResourceFolder = {
      id: uid('fld'),
      courseId: course.id,
      kind: 'folder',
      parentId: activeFolderId,
      name,
      createdAt: now,
      updatedAt: now,
    };
    onResourcesChange([...resources, folder]);
    setShowCreateFolderModal(false);
    setFolderNameDraft('');
    toast('Folder created');
  };

  const openCourseEditor = () => {
    setShowCourseMenu(false);
    setShowEditCourseModal(true);
    onEdit?.();
  };

  const saveCourseDetails = () => {
    const code = courseDraft.code.trim().toUpperCase();
    const name = courseDraft.name.trim();
    const instructor = courseDraft.instructor.trim();
    if (!code || !name) {
      toast('Please enter a course code and name.');
      return;
    }
    if (courseDraft.startDate && courseDraft.endDate) {
      const s = new Date(courseDraft.startDate);
      const e = new Date(courseDraft.endDate);
      if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime()) && s.getTime() > e.getTime()) {
        toast('Start date must be before end date.');
        return;
      }
    }

    onCourseChange({
      ...course,
      code,
      name,
      instructor: instructor || '—',
      color: courseDraft.color,
      startDate: courseDraft.startDate || undefined,
      endDate: courseDraft.endDate || undefined,
    });
    setShowEditCourseModal(false);
    toast('Course updated');
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const now = new Date().toISOString();
    const created: CourseResourceFile[] = [];

    for (const file of Array.from(files)) {
      const blobId = uid('blob');
      await putBlob(blobId, file);

      created.push({
        id: uid('res'),
        courseId: course.id,
        kind: 'file',
        parentId: activeFolderId,
        name: file.name,
        createdAt: now,
        updatedAt: now,
        blobId,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
      });
    }

    onResourcesChange([...resources, ...created]);
  };

  const openFile = async (file: CourseResourceFile) => {
    const blob = await getBlob(file.blobId);
    if (!blob) {
      toast('File is missing. It may have been cleared from local storage.');
      return;
    }
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    // Let the new tab load first; revoke after a bit.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const downloadFile = async (file: CourseResourceFile) => {
    const blob = await getBlob(file.blobId);
    if (!blob) {
      toast('File is missing. It may have been cleared from local storage.');
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5_000);
  };

  const deleteResource = (res: CourseResource) => {
    setPendingResourceDelete(res);
  };

  const performDeleteResource = async (res: CourseResource) => {
    // delete subtree for folders
    const byParent = new Map<string | null, CourseResource[]>();
    for (const r of courseResources) {
      const list = byParent.get(r.parentId) ?? [];
      list.push(r);
      byParent.set(r.parentId, list);
    }

    const toDelete: CourseResource[] = [];
    const stack: CourseResource[] = [res];
    while (stack.length) {
      const current = stack.pop()!;
      toDelete.push(current);
      if (current.kind === 'folder') {
        const kids = byParent.get(current.id) ?? [];
        kids.forEach(k => stack.push(k));
      }
    }

    for (const d of toDelete) {
      if (d.kind === 'file') {
        await deleteBlob(d.blobId);
      }
    }

    const ids = new Set(toDelete.map(d => d.id));
    onResourcesChange(resources.filter(r => !ids.has(r.id)));
    if (activeFolderId && ids.has(activeFolderId)) setActiveFolderId(null);
    toast(res.kind === 'folder' ? 'Folder deleted' : 'File deleted');
  };

  return (
    <div className="space-y-6">
      {/* Header / Nav */}
      <div className="flex items-center gap-4">
        <button 
          onClick={onBack}
          className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold text-slate-800">{course.code}</h1>
      </div>

      {/* Hero Banner */}
      <div className={`relative overflow-visible rounded-2xl p-8 text-white shadow-lg ${course.color}`}>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div>
            <div className="inline-block px-3 py-1 rounded-lg bg-white/20 backdrop-blur-sm text-xs font-bold uppercase tracking-wider mb-3">
              {course.code}
            </div>
            <h2 className="text-3xl font-bold mb-2">{course.name}</h2>
            <div className="flex items-center gap-4 text-white/90">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4" />
                <span className="text-sm font-medium">{course.instructor}</span>
              </div>
              {upcomingEvents[0] && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  <span className="text-sm font-medium">{upcomingEvents[0].location || 'Location TBD'}</span>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex gap-3 relative">
            <button 
              onClick={openCourseEditor}
              className="px-4 py-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-xl text-sm font-medium transition-colors"
            >
              Edit Course
            </button>
            <button
              type="button"
              onClick={() => setShowCourseMenu(v => !v)}
              className="p-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-xl transition-colors"
            >
              <MoreVertical className="w-5 h-5" />
            </button>
            {showCourseMenu && (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-10 cursor-default"
                  onClick={() => setShowCourseMenu(false)}
                  aria-label="Close course menu"
                />
                <div className="absolute right-0 top-12 z-20 w-44 bg-white border border-slate-200 rounded-2xl shadow-lg p-2">
                  <button
                    type="button"
                    onClick={openCourseEditor}
                    className="w-full text-left px-3 py-2 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Course info
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCourseMenu(false);
                      setShowDeleteCourseConfirm(true);
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl text-sm font-medium text-rose-700 hover:bg-rose-50"
                  >
                    Delete course
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        
        {/* Abstract shapes decoration */}
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-40 h-40 bg-black/5 rounded-full blur-2xl"></div>
      </div>

      {/* Class Tabs */}
      <div className="bg-white border border-slate-200 rounded-2xl p-2 shadow-sm sticky top-16 z-[5]">
        <div className="flex items-center gap-2 overflow-x-auto">
          <TabButton
            label="Calendar"
            active={activeTab === 'calendar'}
            onClick={() => setActiveTab('calendar')}
          />
          <TabButton
            label="Assignments"
            active={activeTab === 'assignments'}
            onClick={() => setActiveTab('assignments')}
            badge={stats.pendingAssignments}
          />
          <TabButton
            label="Events"
            active={activeTab === 'events'}
            onClick={() => setActiveTab('events')}
          />
          <TabButton
            label="Exams"
            active={activeTab === 'exams'}
            onClick={() => setActiveTab('exams')}
          />
          <TabButton
            label="Library"
            active={activeTab === 'library'}
            onClick={() => setActiveTab('library')}
          />
          <TabButton
            label="Goals"
            active={activeTab === 'goals'}
            onClick={() => setActiveTab('goals')}
          />
        </div>
      </div>


      {activeTab === 'assignments' && (
        <div className="space-y-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-emerald-600" />
                Assignments
              </h3>
              <div className="relative flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAssignmentFilter(v => !v)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <Filter className="w-4 h-4" />
                  Filter
                </button>

                {showAssignmentFilter && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowAssignmentFilter(false)}
                      aria-hidden="true"
                    />
                    <div className="absolute right-0 top-10 z-50 w-48 bg-white border border-slate-200 rounded-2xl shadow-lg p-2">
                      <button
                        type="button"
                        onClick={() => setAssignmentNextRecurringOnly(v => !v)}
                        className={`w-full text-left px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                          assignmentNextRecurringOnly ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        Next recurring only
                      </button>
                      <div className="my-1 border-t border-slate-100" />
                      {(
                        [
                          { key: 'all', label: 'All' },
                          { key: 'upcoming', label: 'Upcoming' },
                          { key: 'today', label: 'Due today' },
                          { key: 'week', label: 'This week' },
                          { key: 'overdue', label: 'Overdue' },
                          { key: 'completed', label: 'Completed' },
                        ] as const
                      ).map(opt => (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => {
                            setAssignmentFilter(opt.key);
                            setShowAssignmentFilter(false);
                          }}
                          className={`w-full text-left px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                            assignmentFilter === opt.key
                              ? 'bg-indigo-50 text-indigo-700'
                              : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => setShowAddTask(true)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  Add Assignment
                </button>
              </div>
            </div>

            <AddTaskModal
              open={showAddTask}
              courses={[course]}
              initialCourseId={course.id}
              onClose={() => setShowAddTask(false)}
              onCreate={a => {
                const created: Assignment = {
                  id: uid('asg'),
                  ...a,
                };
                onAssignmentsChange([...assignments, created]);
                toast('Assignment created');
              }}
            />

            <div className="space-y-3">
              {visibleCourseAssignments.length > 0 ? (
                visibleCourseAssignments.map(assignment => (
                  <button
                    key={assignment.id}
                    type="button"
                    onClick={() => setSelectedAssignmentId(assignment.id)}
                    className="w-full text-left group bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex items-center gap-4"
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        updateAssignment(assignment.id, { completed: !assignment.completed });
                      }}
                      className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${assignment.completed ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 hover:border-indigo-500'}`}
                      title={assignment.completed ? 'Mark incomplete' : 'Mark complete'}
                    >
                      {assignment.completed && <CheckSquare className="w-3.5 h-3.5" />}
                    </button>
                    <div className="flex-1">
                      <h4 className={`font-medium ${assignment.completed ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                        {assignment.title}
                      </h4>
                      <div className="flex items-center gap-3 mt-1 text-xs">
                        {assignment.isGraded && (
                          <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-semibold">
                            Graded{typeof assignment.weightPercent === 'number' ? ` • ${assignment.weightPercent}%` : ''}
                          </span>
                        )}
                        <span className={`px-2 py-0.5 rounded-md ${
                          assignment.priority === 'high' ? 'bg-rose-50 text-rose-600' :
                          assignment.priority === 'medium' ? 'bg-amber-50 text-amber-600' :
                          'bg-slate-100 text-slate-500'
                        } capitalize font-medium`}>
                          {assignment.priority === 'high' ? 'High' : assignment.priority === 'medium' ? 'Med' : 'Low'}
                        </span>
                        {(() => {
                          const due = new Date(assignment.dueDate);
                          const now = new Date();
                          const isPastDue = !assignment.completed && due.getTime() < now.getTime();
                          return (
                            <span className={`${assignment.completed ? 'text-slate-400' : isPastDue ? 'text-rose-600 font-semibold' : 'text-slate-500'}`}>
                              {isPastDue
                                ? `Passed deadline • ${due.toLocaleDateString()}`
                                : `Upcoming • ${due.toLocaleDateString()}`}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingAssignmentDelete(assignment);
                      }}
                      className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:text-rose-600 transition-colors opacity-0 group-hover:opacity-100"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-semibold text-slate-400 group-hover:text-indigo-600 transition-colors">
                      Details &rarr;
                    </span>
                  </button>
                ))
              ) : (
                <div className="text-center py-10 bg-white border border-slate-200 rounded-2xl shadow-sm">
                  <p className="text-slate-500">
                    {courseAssignments.length === 0 ? 'No tasks yet for this class.' : 'No assignments match this filter.'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {courseAssignments.length === 0
                      ? 'Add your first assignment to start tracking workload.'
                      : assignmentFilter === 'today'
                        ? 'Nothing due today.'
                        : assignmentFilter === 'week'
                          ? 'Nothing due this week.'
                          : assignmentFilter === 'overdue'
                            ? 'No overdue assignments.'
                            : 'Try another filter.'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {selectedAssignment && editDraft && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div
                  className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                  onClick={() => setSelectedAssignmentId(null)}
                  aria-hidden="true"
                />
                <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
                  <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-100">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        Assignment details
                      </div>
                      <div className="text-lg font-bold text-slate-800 truncate">{selectedAssignment.title}</div>
                      <div className="text-xs text-slate-500 mt-1">
                        Due {new Date(selectedAssignment.dueDate).toLocaleDateString()}
                        {selectedAssignment.isGraded && typeof selectedAssignment.weightPercent === 'number'
                          ? ` • ${selectedAssignment.weightPercent}% of final`
                          : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingAssignment(v => !v)}
                        className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
                        title="Edit details"
                      >
                        <Pencil className="w-4 h-4" />
                        Edit details
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedAssignmentId(null)}
                        className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors"
                        title="Close"
                      >
                        <span className="text-lg leading-none">×</span>
                      </button>
                    </div>
                  </div>

                  <div className="px-6 py-5 space-y-5">
                    {editingAssignment ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
                          <input
                            value={editDraft.title}
                            onChange={e => setEditDraft({ ...editDraft, title: e.target.value })}
                            className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Due date</label>
                          <input
                            type="date"
                            value={editDraft.dueDate}
                            onChange={e => setEditDraft({ ...editDraft, dueDate: e.target.value })}
                            className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
                          <div className="flex items-center gap-2">
                            {(['low', 'medium', 'high'] as Priority[]).map(p => (
                              <button
                                key={p}
                                type="button"
                                onClick={() => setEditDraft({ ...editDraft, priority: p })}
                                className={`flex-1 px-3 py-2 rounded-xl border text-xs font-bold uppercase tracking-wider transition-colors ${
                                  p === 'low'
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                    : p === 'medium'
                                      ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                                      : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                                } ${editDraft.priority === p ? 'ring-2 ring-indigo-500/20 border-indigo-300' : ''}`}
                              >
                                {p === 'low' ? 'Low' : p === 'medium' ? 'Med' : 'High'}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                          <textarea
                            value={editDraft.description}
                            onChange={e => setEditDraft({ ...editDraft, description: e.target.value })}
                            className="w-full min-h-[140px] px-4 py-3 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm"
                            placeholder="Add requirements, notes, links..."
                          />
                        </div>

                        <div className="md:col-span-2 border border-slate-200 rounded-2xl p-4">
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <div className="text-sm font-semibold text-slate-800">Counts toward grade?</div>
                              <div className="text-xs text-slate-500 mt-0.5">Toggle if this assignment affects your final mark.</div>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setEditDraft(prev =>
                                  prev
                                    ? {
                                        ...prev,
                                        isGraded: !prev.isGraded,
                                      }
                                    : prev
                                )
                              }
                              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${editDraft.isGraded ? 'bg-indigo-600' : 'bg-slate-200'}`}
                              aria-pressed={editDraft.isGraded}
                              aria-label="Toggle graded assignment"
                            >
                              <span
                                className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${editDraft.isGraded ? 'translate-x-5' : 'translate-x-1'}`}
                              />
                            </button>
                          </div>

                          {editDraft.isGraded && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                              <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Weight (%)</label>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  placeholder="e.g. 10"
                                  value={editDraft.weightPercent}
                                  onChange={e =>
                                    setEditDraft({
                                      ...editDraft,
                                      weightPercent: e.target.value.replace(/[^0-9.]/g, ''),
                                    })
                                  }
                                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Out of (optional)</label>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  placeholder="e.g. 20"
                                  value={editDraft.pointsPossible}
                                  onChange={e =>
                                    setEditDraft({
                                      ...editDraft,
                                      pointsPossible: e.target.value.replace(/[^0-9.]/g, ''),
                                    })
                                  }
                                  className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                />
                              </div>
                              <div className="md:col-span-2 text-xs text-slate-500">
                                You can enter the grade below once it’s returned.
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="md:col-span-2 flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingAssignment(false);
                              setEditDraft({
                                title: selectedAssignment.title,
                                dueDate: new Date(selectedAssignment.dueDate).toISOString().slice(0, 10),
                                priority: selectedAssignment.priority,
                                description: selectedAssignment.description ?? '',
                                isGraded: Boolean(selectedAssignment.isGraded),
                                weightPercent: typeof selectedAssignment.weightPercent === 'number' ? String(selectedAssignment.weightPercent) : '',
                                pointsPossible: typeof selectedAssignment.pointsPossible === 'number' ? String(selectedAssignment.pointsPossible) : '',
                              });
                            }}
                            className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const dueIso = new Date(editDraft.dueDate).toISOString();
                              const isGraded = editDraft.isGraded;
                              const weightPercent = isGraded && editDraft.weightPercent.trim() !== '' ? Number(editDraft.weightPercent) : undefined;
                              const pointsPossible = isGraded && editDraft.pointsPossible.trim() !== '' ? Number(editDraft.pointsPossible) : undefined;
                              updateAssignment(selectedAssignment.id, {
                                title: editDraft.title.trim() || selectedAssignment.title,
                                dueDate: dueIso,
                                priority: editDraft.priority,
                                description: editDraft.description.trim() ? editDraft.description.trim() : undefined,
                                isGraded,
                                weightPercent,
                                pointsPossible,
                              });
                              setEditingAssignment(false);
                              toast('Assignment updated');
                            }}
                            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="text-sm font-semibold text-slate-800 mb-2">Description</div>
                        <div className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-2xl p-4 min-h-[90px] whitespace-pre-wrap">
                          {(selectedAssignment.description ?? '').trim() || 'No description yet.'}
                        </div>
                      </div>
                    )}

                    {selectedAssignment.isGraded && (
                      <div>
                        <div className="text-sm font-semibold text-slate-800 mb-2">Grade</div>
                        <div className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-2xl p-4">
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="-"
                            value={typeof selectedAssignment.pointsEarned === 'number' ? String(selectedAssignment.pointsEarned) : ''}
                            onChange={(e) => {
                              const raw = e.target.value;
                              const cleaned = raw.replace(/[^0-9.]/g, '');
                              updateAssignment(selectedAssignment.id, { pointsEarned: cleaned === '' ? undefined : Number(cleaned) });
                            }}
                            className="w-24 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                          />
                          <div className="text-sm text-slate-400">/</div>
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="10"
                            value={typeof selectedAssignment.pointsPossible === 'number' ? String(selectedAssignment.pointsPossible) : ''}
                            onChange={(e) => {
                              const raw = e.target.value;
                              const cleaned = raw.replace(/[^0-9.]/g, '');
                              updateAssignment(selectedAssignment.id, { pointsPossible: cleaned === '' ? undefined : Number(cleaned) });
                            }}
                            className="w-24 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                          />
                          {typeof selectedAssignment.pointsEarned === 'number' && typeof selectedAssignment.pointsPossible === 'number' && (selectedAssignment.pointsPossible ?? 0) > 0 && (
                            <div className="ml-auto text-sm font-semibold text-slate-800">
                              {Math.round((selectedAssignment.pointsEarned / selectedAssignment.pointsPossible) * 100)}%
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div>
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <div className="text-sm font-semibold text-slate-800">Relevant resources</div>
                        <label className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-xl hover:bg-indigo-100 transition-colors cursor-pointer">
                          <Upload className="w-4 h-4" />
                          Upload
                          <input
                            type="file"
                            className="hidden"
                            multiple
                            onChange={e => uploadAssignmentFiles(selectedAssignment, e.target.files)}
                          />
                        </label>
                      </div>

                      {(selectedAssignment.attachments ?? []).length === 0 ? (
                        <div className="text-sm text-slate-500 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                          No files yet.
                          <div className="text-xs text-slate-400 mt-1">Upload PDFs, screenshots, rubrics, or reference docs.</div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {(selectedAssignment.attachments ?? [])
                            .slice()
                            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                            .map(att => (
                              <div
                                key={att.id}
                                className="flex items-center justify-between gap-3 p-3 bg-white border border-slate-200 rounded-2xl"
                              >
                                <button
                                  type="button"
                                  onClick={() => openAssignmentAttachment(att)}
                                  className="min-w-0 text-left"
                                  title="Open"
                                >
                                  <div className="text-sm font-semibold text-slate-800 truncate">{att.name}</div>
                                  <div className="text-xs text-slate-400">
                                    {(att.size / 1024).toFixed(0)} KB • {new Date(att.createdAt).toLocaleDateString()}
                                  </div>
                                </button>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => downloadAssignmentAttachment(att)}
                                    className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors"
                                    title="Download"
                                  >
                                    <Download className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => deleteAssignmentAttachment(selectedAssignment.id, att)}
                                    className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                    title="Delete"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="px-6 py-4 border-t border-slate-100 bg-white flex justify-end">
                    <button
                      type="button"
                      onClick={() => setSelectedAssignmentId(null)}
                      className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors"
                    >
                      Done
                    </button>
                  </div>
                </div>
              </div>
            )}
        </div>
      )}

      {activeTab === 'calendar' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-indigo-600" />
              Class Calendar
            </h3>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <CalendarView
              assignments={courseAssignments}
              studySessions={[]}
              courses={[course]}
              events={courseOnlyEvents}
              calendars={calendars}
              initialAssignmentCourseId={course.id}
              initialEventCourseId={course.id}
              lockEventCourse
              fullView
              onEventsChange={(nextCourseEvents) => {
                const keep = events.filter(e => e.source === 'assignment' || e.courseId !== course.id);
                onEventsChange([...keep, ...nextCourseEvents]);
              }}
              onAssignmentsChange={onAssignmentsChange}
              onAddAssignment={(a) => {
                onAssignmentsChange([...assignments, { ...a, id: uid('a'), courseId: course.id }]);
                toast('Assignment created');
              }}
            />
          </div>

          <div className="text-xs text-slate-500">
            Tip: this view will show recurring lecture/tutorial/lab blocks once we add the event editor.
          </div>
        </div>
      )}

      {activeTab === 'events' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-indigo-600" />
              Events
            </h3>
            <div className="flex items-center gap-2">
              <div className="relative flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowEventFilter(v => !v)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <Filter className="w-4 h-4" />
                  Filter
                </button>

                {showEventFilter && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowEventFilter(false)}
                      aria-hidden="true"
                    />
                    <div className="absolute right-0 top-10 z-50 w-52 bg-white border border-slate-200 rounded-2xl shadow-lg p-2">
                      <button
                        type="button"
                        onClick={() => setEventNextRecurringOnly(v => !v)}
                        className={`w-full text-left px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                          eventNextRecurringOnly ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        Next recurring only
                      </button>
                      <div className="my-1 border-t border-slate-100" />
                      {(
                        [
                          { key: 'upcoming', label: 'Upcoming' },
                          { key: 'past', label: 'Past' },
                          { key: 'all', label: 'All' },
                        ] as const
                      ).map(opt => (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => {
                            setEventListFilter(opt.key);
                            setShowEventFilter(false);
                          }}
                          className={`w-full text-left px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                            eventListFilter === opt.key
                              ? 'bg-indigo-50 text-indigo-700'
                              : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={() => setActiveTab('calendar')}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-all"
              >
                <Plus className="w-4 h-4" />
                Add Event
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
            {visibleCourseEvents.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                {eventListFilter === 'upcoming'
                  ? 'No upcoming events yet.'
                  : eventListFilter === 'past'
                    ? 'No past events yet.'
                    : 'No events yet.'}
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {visibleCourseEvents.slice(0, 60).map((ev) => {
                  const start = new Date(ev.startTime);
                  const end = new Date(ev.endTime);
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => setSelectedEventId(ev.id)}
                      className="w-full text-left p-4 flex items-start justify-between gap-4 hover:bg-slate-50 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 truncate">{ev.title}</div>
                        <div className="text-xs text-slate-500 mt-1">
                          {start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}{' '}
                          •{' '}
                          {start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}–
                          {end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                          {ev.location ? ` • ${ev.location}` : ''}
                        </div>
                        {ev.recurrence?.frequency && ev.recurrence.frequency !== 'none' ? (
                          <div className="mt-2 inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                            Repeats
                          </div>
                        ) : null}
                        {ev.notes ? (
                          <div className="mt-2 text-[11px] text-slate-500 line-clamp-2">
                            {ev.notes}
                          </div>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAttendanceByEventId(prev => ({ ...prev, [ev.id]: !prev[ev.id] }));
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                            attendanceByEventId[ev.id]
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                          title="Mark attendance"
                        >
                          {attendanceByEventId[ev.id] ? 'Went' : 'Missed'}
                        </button>
                        <div className="text-xs font-semibold text-slate-400">Details →</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="text-xs text-slate-500">
            This list shows the base events saved for the course. Recurrence expansion will be reflected in the calendar view.
          </div>
        </div>
      )}

      {activeTab === 'exams' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-indigo-600" />
              Exams
            </h3>
            <div className="flex items-center gap-2">
              <div className="relative flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowEventFilter(v => !v)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <Filter className="w-4 h-4" />
                  Filter
                </button>

                {showEventFilter && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowEventFilter(false)} aria-hidden="true" />
                    <div className="absolute right-0 top-10 z-50 w-52 bg-white border border-slate-200 rounded-2xl shadow-lg p-2">
                      {(
                        [
                          { key: 'upcoming', label: 'Upcoming' },
                          { key: 'past', label: 'Past' },
                          { key: 'all', label: 'All' },
                        ] as const
                      ).map(opt => (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => {
                            setEventListFilter(opt.key);
                            setShowEventFilter(false);
                          }}
                          className={`w-full text-left px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                            eventListFilter === opt.key
                              ? 'bg-indigo-50 text-indigo-700'
                              : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('calendar')}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-all"
              >
                <Plus className="w-4 h-4" />
                Add Exam
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
            {visibleCourseExamEvents.length === 0 ? (
              <div className="p-8 text-center text-slate-500">
                {eventListFilter === 'upcoming'
                  ? 'No upcoming exams yet.'
                  : eventListFilter === 'past'
                    ? 'No past exams yet.'
                    : 'No exams yet.'}
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {visibleCourseExamEvents.slice(0, 60).map((ev) => {
                  const start = new Date(ev.startTime);
                  const end = new Date(ev.endTime);
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => setSelectedEventId(ev.id)}
                      className="w-full text-left p-4 flex items-start justify-between gap-4 hover:bg-slate-50 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900 truncate">{ev.title}</div>
                        <div className="text-xs text-slate-500 mt-1">
                          {start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}{' '}
                          •{' '}
                          {start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}–
                          {end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                          {ev.location ? ` • ${ev.location}` : ''}
                        </div>
                      </div>
                      <div className="text-xs font-semibold text-slate-400">Details →</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {selectedEvent && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]"
            onClick={() => setSelectedEventId(null)}
            aria-hidden="true"
          />

          <div className="relative w-full max-w-2xl rounded-3xl bg-white border border-slate-200 shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Event</div>
                <div className="text-lg font-bold text-slate-900 truncate">{selectedEvent.title}</div>
                <div className="text-xs text-slate-500 mt-1">
                  {new Date(selectedEvent.startTime).toLocaleString()} – {new Date(selectedEvent.endTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEventId(null)}
                className="text-sm text-slate-500 hover:text-slate-700"
              >
                Close
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="text-xs font-semibold text-slate-600">Location</div>
                  <div className="mt-1 text-sm text-slate-800">{selectedEvent.location ?? '—'}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="text-xs font-semibold text-slate-600">Repeats</div>
                  <div className="mt-1 text-sm text-slate-800">
                    {selectedEvent.recurrence?.frequency && selectedEvent.recurrence.frequency !== 'none'
                      ? (selectedEvent.recurrence.frequency === 'daily'
                        ? `Daily${selectedEvent.recurrence.intervalDays && selectedEvent.recurrence.intervalDays > 1 ? ` (every ${selectedEvent.recurrence.intervalDays} days)` : ''}`
                        : `Weekly${selectedEvent.recurrence.intervalWeeks && selectedEvent.recurrence.intervalWeeks > 1 ? ` (every ${selectedEvent.recurrence.intervalWeeks} weeks)` : ''}`)
                      : 'No'}
                  </div>
                </div>
              </div>

              <label className="space-y-1 block">
                <div className="text-sm font-semibold text-slate-800">Notes</div>
                <div className="text-xs text-slate-500">Track details (e.g., gym weights) and look back later.</div>
                <textarea
                  value={eventNotesDraft}
                  onChange={(e) => setEventNotesDraft(e.target.value)}
                  className="w-full min-h-[160px] rounded-2xl bg-white border border-slate-200 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  placeholder="What happened? How did it go? Sets/reps/weight, etc…"
                />
              </label>

              <div className="pt-1 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedEventId(null)}
                  className="px-4 py-2 rounded-xl text-sm border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveEventNotes}
                  className="px-4 py-2 rounded-xl text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  Save notes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'goals' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-800">Goals</h3>
            <button
              type="button"
              onClick={() => setShowGoalCreate(v => !v)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-all"
            >
              <Plus className="w-4 h-4" />
              Add Goal
            </button>
          </div>

          {showGoalCreate && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Goal title</label>
                  <input
                    value={goalDraft.title}
                    onChange={e => setGoalDraft(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="e.g. Hit 120kg deadlift, 90% attendance, score 85 on Midterm 1"
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                  <select
                    value={goalDraft.kind}
                    onChange={e => setGoalDraft(prev => ({ ...prev, kind: e.target.value as GoalKind, assignmentId: '' }))}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    <option value="manual">Manual</option>
                    <option value="attendance">Attendance</option>
                    <option value="assignment-grade">Assignment mark</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Target</label>
                  <input
                    type="number"
                    min={0}
                    value={goalDraft.target}
                    onChange={e => setGoalDraft(prev => ({ ...prev, target: e.target.value }))}
                    placeholder={goalDraft.kind === 'attendance' || goalDraft.kind === 'assignment-grade' ? 'Percent (e.g. 85)' : 'Any number'}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                {goalDraft.kind === 'manual' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Current value (optional)</label>
                    <input
                      type="number"
                      min={0}
                      value={goalDraft.manualValue}
                      onChange={e => setGoalDraft(prev => ({ ...prev, manualValue: e.target.value }))}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                )}

                {goalDraft.kind === 'assignment-grade' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Assignment</label>
                    <select
                      value={goalDraft.assignmentId}
                      onChange={e => setGoalDraft(prev => ({ ...prev, assignmentId: e.target.value }))}
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    >
                      <option value="">Select assignment</option>
                      {courseAssignments.map(a => (
                        <option key={a.id} value={a.id}>{a.title}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Notes (optional)</label>
                  <input
                    value={goalDraft.note}
                    onChange={e => setGoalDraft(prev => ({ ...prev, note: e.target.value }))}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowGoalCreate(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const title = goalDraft.title.trim();
                    const target = Number(goalDraft.target);
                    if (!title || Number.isNaN(target) || target <= 0) return;
                    if (goalDraft.kind === 'assignment-grade' && !goalDraft.assignmentId) return;
                    const nextGoal: CourseGoal = {
                      id: uid('goal'),
                      title,
                      kind: goalDraft.kind,
                      target,
                      manualValue: goalDraft.kind === 'manual' && goalDraft.manualValue !== '' ? Number(goalDraft.manualValue) : undefined,
                      assignmentId: goalDraft.kind === 'assignment-grade' ? goalDraft.assignmentId : undefined,
                      note: goalDraft.note.trim() || undefined,
                    };
                    setGoals(prev => [...prev, nextGoal]);
                    setGoalDraft({
                      title: '',
                      kind: 'manual',
                      target: '',
                      manualValue: '',
                      assignmentId: '',
                      note: '',
                    });
                    setShowGoalCreate(false);
                    toast('Goal created');
                  }}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors"
                >
                  Save goal
                </button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
            {goalProgress.length === 0 ? (
              <div className="p-10 text-center">
                <div className="text-slate-700 font-semibold">No goals yet</div>
                <div className="text-sm text-slate-500 mt-1">Create any goal you want: attendance, assignment mark, gym metric, anything manual.</div>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {goalProgress.map(goal => (
                  <div key={goal.id} className="p-5 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{goal.title}</div>
                        <div className="text-xs text-slate-500 mt-1 capitalize">{goal.kind.replace('-', ' ')}</div>
                        {goal.note && <div className="text-xs text-slate-500 mt-1">{goal.note}</div>}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setGoals(prev => prev.filter(g => g.id !== goal.id));
                          toast('Goal deleted');
                        }}
                        className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        title="Delete goal"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">{goal.subtitle}</span>
                      <span className="font-semibold text-slate-800">{goal.current}/{goal.target}</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2">
                      <div className={`h-2 rounded-full ${course.color}`} style={{ width: `${goal.pct}%` }} />
                    </div>
                    {goal.kind === 'manual' && (
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-slate-500">Update current</label>
                        <input
                          type="number"
                          min={0}
                          value={goal.manualValue ?? ''}
                          onChange={(e) => {
                            const nextVal = e.target.value === '' ? undefined : Number(e.target.value);
                            setGoals(prev => prev.map(g => g.id === goal.id ? { ...g, manualValue: nextVal } : g));
                          }}
                          className="w-28 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'library' && (
        <div className="relative">
          {/* Backdrop for modal-style expansion */}
          {expandedPanel !== null && (
            <div
              className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-[2px] transition-opacity"
              onClick={() => setExpandedPanel(null)}
              aria-hidden="true"
            />
          )}

          <div className={`grid grid-cols-1 gap-8 ${expandedPanel ? 'lg:grid-cols-1' : 'lg:grid-cols-2'}`}>
          {(expandedPanel === null || expandedPanel === 'notes') && (
          <div
            className={`space-y-4 ${expandedPanel === 'notes' ? 'fixed left-1/2 top-16 -translate-x-1/2 z-50 w-[min(1100px,calc(100vw-2rem))] max-h-[calc(100vh-3.5rem)] overflow-auto rounded-3xl p-1' : ''}`}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <StickyNote className="w-5 h-5 text-indigo-600" />
                Notes
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setExpandedPanel(prev => (prev === 'notes' ? null : 'notes'))}
                  className="p-2 rounded-xl bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 shadow-sm transition-all"
                  title={expandedPanel === 'notes' ? 'Exit fullscreen' : 'Fullscreen'}
                >
                  {expandedPanel === 'notes' ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
                <button onClick={createNote} className="text-sm font-medium text-indigo-600 hover:bg-indigo-50 px-3 py-1 rounded-lg transition-colors">
                  New note
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-3 min-h-[360px]">
                {/* Note list */}
                <div className="md:col-span-1 border-b md:border-b-0 md:border-r border-slate-200 p-4">
                  <div className="space-y-2">
                    {courseNotes.length === 0 ? (
                      <div className="text-sm text-slate-500 p-3 bg-slate-50 rounded-xl border border-slate-200">
                        No notes yet.
                        <div className="text-xs text-slate-400 mt-1">Create one to start capturing lecture stuff.</div>
                      </div>
                    ) : (
                      courseNotes.map(n => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => setActiveNoteId(n.id)}
                          className={`w-full text-left p-3 rounded-xl border transition-colors ${
                            n.id === activeNoteId ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 hover:border-indigo-200 hover:bg-slate-50'
                          }`}
                        >
                          <div className="text-sm font-semibold text-slate-800 truncate">{n.title}</div>
                          <div className="text-xs text-slate-500 mt-1 line-clamp-2">{n.content || 'Empty note…'}</div>
                          <div className="text-[10px] text-slate-400 mt-2">Updated {new Date(n.updatedAt).toLocaleString()}</div>
                        </button>
                      ))
                    )}
                  </div>
                </div>

                {/* Editor */}
                <div className="md:col-span-2 p-4">
                  {activeNote ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <input
                          value={activeNote.title}
                          onChange={e => updateNote({ title: e.target.value })}
                          className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-semibold"
                        />
                        <button
                          onClick={() => deleteNote(activeNote.id)}
                          className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          title="Delete note"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <textarea
                        value={activeNote.content}
                        onChange={e => updateNote({ content: e.target.value })}
                        placeholder="Write anything… (later we can add markdown + AI summarizer)"
                        className="w-full min-h-[260px] px-4 py-3 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm"
                      />
                      <div className="text-xs text-slate-400">Autosaves locally.</div>
                    </div>
                  ) : (
                    <div className="py-16 text-center">
                      <StickyNote className="w-8 h-8 text-indigo-300 mx-auto mb-2" />
                      <div className="text-slate-600 font-medium">Select a note</div>
                      <div className="text-xs text-slate-400 mt-1">Or create a new one.</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          )}

          {(expandedPanel === null || expandedPanel === 'resources') && (
          <div
            className={`space-y-4 ${expandedPanel === 'resources' ? 'fixed left-1/2 top-16 -translate-x-1/2 z-50 w-[min(1100px,calc(100vw-2rem))] max-h-[calc(100vh-3.5rem)] overflow-auto rounded-3xl p-1' : ''}`}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Folder className="w-5 h-5 text-emerald-600" />
                Resources
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setExpandedPanel(prev => (prev === 'resources' ? null : 'resources'))}
                  className="p-2 rounded-xl bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 shadow-sm transition-all"
                  title={expandedPanel === 'resources' ? 'Exit fullscreen' : 'Fullscreen'}
                >
                  {expandedPanel === 'resources' ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
                <button onClick={createFolder} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm transition-all">
                  <Folder className="w-4 h-4" />
                  New folder
                </button>
                <label className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-all cursor-pointer">
                  <Upload className="w-4 h-4" />
                  Upload
                  <input
                    type="file"
                    className="hidden"
                    multiple
                    onChange={e => uploadFiles(e.target.files)}
                  />
                </label>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 min-h-[360px]">
              <div className="flex items-center justify-between mb-4">
                <div className="text-xs text-slate-500 flex items-center gap-2">
                  <button onClick={() => setActiveFolderId(null)} className="hover:text-indigo-600">Root</button>
                  {breadcrumbs.map(b => (
                    <span key={b.id} className="flex items-center gap-2">
                      <ChevronRight className="w-3 h-3 text-slate-300" />
                      <button onClick={() => setActiveFolderId(b.id)} className="hover:text-indigo-600">{b.name}</button>
                    </span>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                {folderChildren.length === 0 ? (
                  <div className="text-sm text-slate-500 p-4 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-center">
                    Empty folder.
                    <div className="text-xs text-slate-400 mt-1">Upload files or create subfolders.</div>
                  </div>
                ) : (
                  folderChildren.map(item => (
                    <div key={item.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all">
                      <button
                        type="button"
                        onClick={() => {
                          if (item.kind === 'folder') setActiveFolderId(item.id);
                          else openFile(item as CourseResourceFile);
                        }}
                        className="flex items-center gap-3 text-left flex-1"
                      >
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${item.kind === 'folder' ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'}`}>
                          {item.kind === 'folder' ? <Folder className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-800 truncate">{item.name}</div>
                          <div className="text-xs text-slate-400">
                            {item.kind === 'folder'
                              ? 'Folder'
                              : `${Math.round((item as CourseResourceFile).size / 1024)} KB`}
                          </div>
                        </div>
                      </button>

                      <div className="flex items-center gap-1 text-slate-400">
                        {item.kind === 'file' && (
                          <button
                            onClick={() => downloadFile(item as CourseResourceFile)}
                            className="p-2 rounded-xl hover:bg-white hover:text-indigo-600 transition-colors"
                            title="Download"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => deleteResource(item)}
                          className="p-2 rounded-xl hover:bg-white hover:text-rose-600 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-5">
                <label className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-slate-300 rounded-xl text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-indigo-600 transition-colors cursor-pointer">
                  <Upload className="w-4 h-4" />
                  Drop / click to upload any files
                  <input
                    type="file"
                    className="hidden"
                    multiple
                    onChange={e => uploadFiles(e.target.files)}
                  />
                </label>
              </div>
            </div>
          </div>
          )}
          </div>
        </div>
      )}

      {showCreateFolderModal && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
            onClick={() => setShowCreateFolderModal(false)}
            aria-label="Close folder dialog"
          />
          <div className="relative w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl">
            <div className="px-6 py-5 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">New folder</h3>
              <p className="mt-1 text-sm text-slate-500">Create a folder in the current location.</p>
            </div>
            <div className="px-6 py-5">
              <label className="block text-sm font-medium text-slate-700 mb-1">Folder name</label>
              <input
                autoFocus
                value={folderNameDraft}
                onChange={(e) => setFolderNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submitCreateFolder();
                  }
                }}
                className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                placeholder="e.g. Week 3"
              />
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreateFolderModal(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitCreateFolder}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors"
              >
                Create folder
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditCourseModal && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
            onClick={() => setShowEditCourseModal(false)}
            aria-label="Close course editor"
          />
          <div className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-100">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Course info</div>
                <div className="text-lg font-bold text-slate-800">Edit course</div>
                <div className="text-xs text-slate-500 mt-1">Update class details shown across calendar, activities, and goals.</div>
              </div>
              <button
                type="button"
                onClick={() => setShowEditCourseModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors"
                title="Close"
              >
                <span className="text-lg leading-none">×</span>
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Course code</label>
                  <input
                    value={courseDraft.code}
                    onChange={e => setCourseDraft(prev => ({ ...prev, code: e.target.value }))}
                    placeholder="e.g. CS101"
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Instructor</label>
                  <input
                    value={courseDraft.instructor}
                    onChange={e => setCourseDraft(prev => ({ ...prev, instructor: e.target.value }))}
                    placeholder="e.g. Dr. Smith"
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Course name</label>
                  <input
                    value={courseDraft.name}
                    onChange={e => setCourseDraft(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. Computer Science 101"
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <DatePicker
                    label="Start date"
                    value={courseDraft.startDate}
                    onChange={(next) => {
                      setCourseDraft(prev => {
                        const endTooEarly = prev.endDate && next && prev.endDate < next;
                        return { ...prev, startDate: next, endDate: endTooEarly ? '' : prev.endDate };
                      });
                    }}
                    placeholder="Select start"
                    max={courseDraft.endDate || undefined}
                  />
                </div>
                <div>
                  <DatePicker
                    label="End date"
                    value={courseDraft.endDate}
                    onChange={(next) => setCourseDraft(prev => ({ ...prev, endDate: next }))}
                    placeholder="Select end"
                    min={courseDraft.startDate || undefined}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Color</label>
                <div className="flex flex-wrap gap-2">
                  {courseColorOptions.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCourseDraft(prev => ({ ...prev, color: c }))}
                      className={`h-9 w-9 rounded-xl ${c} border transition-all ${courseDraft.color === c ? 'ring-2 ring-indigo-500/30 border-white' : 'border-white/0 hover:ring-2 hover:ring-slate-300/40'}`}
                      title={c}
                      aria-pressed={courseDraft.color === c}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-white flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowEditCourseModal(false)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveCourseDetails}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors"
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showDeleteCourseConfirm}
        title="Delete course?"
        message={`"${course.code} ${course.name}" will be deleted from your planner.`}
        confirmLabel="Delete course"
        onCancel={() => setShowDeleteCourseConfirm(false)}
        onConfirm={() => {
          if (!onDeleteCourse) return;
          onDeleteCourse(course.id);
          setShowDeleteCourseConfirm(false);
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingAssignmentDelete)}
        title="Delete assignment?"
        message={
          pendingAssignmentDelete
            ? (() => {
                const seriesCount = assignments.filter(a =>
                  a.courseId === pendingAssignmentDelete.courseId &&
                  a.title.trim().toLowerCase() === pendingAssignmentDelete.title.trim().toLowerCase()
                ).length;
                return seriesCount > 1
                  ? `"${pendingAssignmentDelete.title}" is part of a recurring series (${seriesCount} items).`
                  : `"${pendingAssignmentDelete.title}" will be removed from this course.`;
              })()
            : ''
        }
        confirmLabel={
          pendingAssignmentDelete && assignments.filter(a =>
            a.courseId === pendingAssignmentDelete.courseId &&
            a.title.trim().toLowerCase() === pendingAssignmentDelete.title.trim().toLowerCase()
          ).length > 1
            ? 'Delete all'
            : 'Delete assignment'
        }
        secondaryLabel={
          pendingAssignmentDelete && assignments.filter(a =>
            a.courseId === pendingAssignmentDelete.courseId &&
            a.title.trim().toLowerCase() === pendingAssignmentDelete.title.trim().toLowerCase()
          ).length > 1
            ? 'Delete this one'
            : undefined
        }
        onCancel={() => setPendingAssignmentDelete(null)}
        onSecondary={() => {
          if (!pendingAssignmentDelete) return;
          onAssignmentsChange(assignments.filter(a => a.id !== pendingAssignmentDelete.id));
          if (selectedAssignmentId === pendingAssignmentDelete.id) setSelectedAssignmentId(null);
          setPendingAssignmentDelete(null);
          toast('Assignment deleted');
        }}
        onConfirm={() => {
          if (!pendingAssignmentDelete) return;
          const series = assignments.filter(a =>
            a.id !== pendingAssignmentDelete.id &&
            a.courseId === pendingAssignmentDelete.courseId &&
            a.title.trim().toLowerCase() === pendingAssignmentDelete.title.trim().toLowerCase()
          );
          if (series.length > 0) {
            onAssignmentsChange(
              assignments.filter(a => !(
                a.courseId === pendingAssignmentDelete.courseId &&
                a.title.trim().toLowerCase() === pendingAssignmentDelete.title.trim().toLowerCase()
              ))
            );
            if (selectedAssignmentId === pendingAssignmentDelete.id) setSelectedAssignmentId(null);
            setPendingAssignmentDelete(null);
            toast('Recurring assignments deleted');
            return;
          }
          onAssignmentsChange(assignments.filter(a => a.id !== pendingAssignmentDelete.id));
          if (selectedAssignmentId === pendingAssignmentDelete.id) setSelectedAssignmentId(null);
          setPendingAssignmentDelete(null);
          toast('Assignment deleted');
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingAttachmentDelete)}
        title="Delete attachment?"
        message={
          pendingAttachmentDelete
            ? `"${pendingAttachmentDelete.attachment.name}" will be removed from this assignment.`
            : ''
        }
        confirmLabel="Delete file"
        onCancel={() => setPendingAttachmentDelete(null)}
        onConfirm={async () => {
          if (!pendingAttachmentDelete) return;
          const { assignmentId, attachment } = pendingAttachmentDelete;
          await deleteBlob(attachment.blobId);
          const current = assignments.find(x => x.id === assignmentId);
          const next = (current?.attachments ?? []).filter(x => x.id !== attachment.id);
          updateAssignment(assignmentId, { attachments: next });
          setPendingAttachmentDelete(null);
          toast('Attachment deleted');
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingResourceDelete)}
        title={pendingResourceDelete?.kind === 'folder' ? 'Delete folder?' : 'Delete file?'}
        message={
          pendingResourceDelete
            ? pendingResourceDelete.kind === 'folder'
              ? `"${pendingResourceDelete.name}" and all its contents will be removed.`
              : `"${pendingResourceDelete.name}" will be removed from resources.`
            : ''
        }
        confirmLabel={pendingResourceDelete?.kind === 'folder' ? 'Delete folder' : 'Delete file'}
        onCancel={() => setPendingResourceDelete(null)}
        onConfirm={async () => {
          if (!pendingResourceDelete) return;
          await performDeleteResource(pendingResourceDelete);
          setPendingResourceDelete(null);
        }}
      />
    </div>
  );
};

const TabButton: React.FC<{ label: string; active: boolean; onClick: () => void; badge?: number }> = ({
  label,
  active,
  onClick,
  badge,
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
      active
        ? 'bg-indigo-50 text-indigo-700'
        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
    }`}
  >
    <span>{label}</span>
    {typeof badge === 'number' && badge > 0 && (
      <span className={`text-xs px-2 py-0.5 rounded-full ${active ? 'bg-indigo-200 text-indigo-800' : 'bg-slate-100 text-slate-600'}`}>
        {badge}
      </span>
    )}
  </button>
);

export default CourseDashboard;
