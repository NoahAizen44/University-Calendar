import type { CalendarEvent } from '../types';

const EXAM_TITLE_PATTERNS = ['exam', 'midterm', 'final', 'quiz', 'test'];

export function isExamTitle(title: string) {
  const t = title.trim().toLowerCase();
  return EXAM_TITLE_PATTERNS.some(pattern => t.includes(pattern));
}

export function isExamEvent(event: CalendarEvent) {
  return event.source === 'exam' || isExamTitle(event.title);
}

export function withExamSource(event: CalendarEvent): CalendarEvent {
  if (event.source === 'assignment') return event;
  if (isExamEvent(event)) return { ...event, source: 'exam' };
  return event.source === 'exam' ? { ...event, source: 'manual' } : event;
}
