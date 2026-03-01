
export type Priority = 'low' | 'medium' | 'high';

export type EventSource = 'manual' | 'ai-import' | 'assignment' | 'study-plan';

export type RecurrenceFrequency = 'none' | 'weekly' | 'daily';

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  /** Repeat every N days (default 1). Used when frequency='daily'. */
  intervalDays?: number;
  /** 1=Mon ... 7=Sun (ISO-8601) */
  byWeekday?: number[];
  /** Repeat every N weeks (default 1). Used when frequency='weekly'. */
  intervalWeeks?: number;
  /** ISO string; if omitted, recurrence continues indefinitely */
  until?: string;
}

export interface UniCalendar {
  id: string;
  name: string;
  color: string; // tailwind class e.g. bg-indigo-500
  visible: boolean;
}

export interface Course {
  id: string;
  name: string;
  code: string;
  color: string;
  instructor: string;
  calendarId?: string;
  /** ISO date string (YYYY-MM-DD or full ISO). Optional. */
  startDate?: string;
  /** ISO date string (YYYY-MM-DD or full ISO). Optional. */
  endDate?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: string; // ISO string
  endTime: string; // ISO string
  calendarId: string;
  courseId?: string;
  location?: string;
  notes?: string;
  source: EventSource;
  recurrence?: RecurrenceRule;
}

export interface CourseNote {
  id: string;
  courseId: string;
  title: string;
  content: string;
  updatedAt: string; // ISO
  createdAt: string; // ISO
}

export type ResourceKind = 'folder' | 'file';

export interface CourseResourceBase {
  id: string;
  courseId: string;
  kind: ResourceKind;
  parentId: string | null; // null = course root
  name: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export interface CourseResourceFolder extends CourseResourceBase {
  kind: 'folder';
}

export interface CourseResourceFile extends CourseResourceBase {
  kind: 'file';
  blobId: string; // key in IndexedDB
  mimeType: string;
  size: number;
}

export type CourseResource = CourseResourceFolder | CourseResourceFile;

export interface Assignment {
  id: string;
  title: string;
  dueDate: string; // ISO string (date)
  /** Optional local time (HH:MM). If omitted, treat as all-day / no specific time. */
  dueTime?: string;
  courseId: string;
  priority: Priority;
  completed: boolean;
  estimatedHours: number;

  /** Optional free-form details shown in the assignment details modal. */
  description?: string;

  /** Optional per-assignment attachments (metadata); blobs stored in IndexedDB. */
  attachments?: AssignmentAttachment[];

  /** If true, this assignment contributes to the final course grade. */
  isGraded?: boolean;
  /** Percentage contribution to final grade (0-100). Required when isGraded=true. */
  weightPercent?: number;
  /** Points possible (e.g., 20). Optional, but enables nicer score entry + % calc. */
  pointsPossible?: number;
  /** Points earned (e.g., 18). Set when the grade is returned. */
  pointsEarned?: number;
}

export interface AssignmentAttachment {
  id: string;
  name: string;
  createdAt: string; // ISO
  blobId: string; // key in IndexedDB
  mimeType: string;
  size: number;
}

export interface StudySession {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  assignmentId?: string;
}

export interface PlannerState {
  calendars?: UniCalendar[];
  courses: Course[];
  assignments: Assignment[];
  recurringTasks?: RecurringTask[];
  events?: CalendarEvent[];
  studySessions: StudySession[];
  notes?: CourseNote[];
  resources?: CourseResource[];
}

export type RecurringTaskFrequency = 'weekly' | 'daily';

export interface RecurringTaskRule {
  frequency: RecurringTaskFrequency;
  /** Repeat every N days (default 1). Used when frequency='daily'. */
  intervalDays?: number;

  /** Optional local time (HH:MM). If omitted, treat as all-day / no specific time. */
  timeOfDay?: string;
  /** @deprecated use timeOfDay */
  dueTime?: string;

  /** 1=Mon ... 7=Sun (ISO-8601). Used when frequency='weekly'. */
  byWeekday?: number[];
  /** Repeat every N weeks (default 1). Used when frequency='weekly'. */
  intervalWeeks?: number;

  /** Start date (YYYY-MM-DD). */
  startYmd: string;
  /** Optional end date (YYYY-MM-DD). If omitted, series continues indefinitely. */
  untilYmd?: string;
}

/**
 * A recurring task is stored once, but renders as tickable occurrences by date.
 * Completion is tracked per occurrence (YYYY-MM-DD) to avoid cluttering the assignment list.
 */
export interface RecurringTask {
  id: string;
  title: string;
  courseId: string; // '' means independent
  priority: Priority;
  description?: string;
  attachments?: AssignmentAttachment[];

  isGraded?: boolean;
  weightPercent?: number;
  pointsPossible?: number;

  rule: RecurringTaskRule;

  /** Map of occurrence date (YYYY-MM-DD) -> completed */
  completed?: Record<string, boolean>;

  createdAt: string; // ISO
  updatedAt: string; // ISO
}
