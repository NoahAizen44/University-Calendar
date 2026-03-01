import { GoogleGenAI } from '@google/genai';
import type { Assignment, CalendarEvent, Course, CourseNote, CourseResource, UniCalendar } from '../types';

export type AssistantAction =
  | {
      type: 'create_assignment';
      title: string;
      courseRef?: string;
      dueDate?: string; // YYYY-MM-DD
      dueTime?: string; // HH:mm
      priority?: 'low' | 'medium' | 'high';
      description?: string;
      isGraded?: boolean;
    }
  | {
      type: 'create_event';
      title: string;
      startTime: string; // ISO
      endTime: string; // ISO
      courseRef?: string;
      calendarRef?: string;
      location?: string;
      notes?: string;
    }
  | {
      type: 'create_course';
      name: string;
      code?: string;
      instructor?: string;
      color?: string; // Tailwind class, e.g. bg-indigo-500
    }
  | {
      type: 'reassign_event_to_course';
      eventRef: string; // event id or part of title
      courseRef: string; // course id/code/name
    };

export type AssistantRunResult = {
  reply: string;
  actions: AssistantAction[];
};

export type AssistantFile = {
  name: string;
  mimeType: string;
  base64Data: string;
};

type AssistantContext = {
  courses: Course[];
  calendars: UniCalendar[];
  assignments: Assignment[];
  events: CalendarEvent[];
  notes: CourseNote[];
  resources: CourseResource[];
};

function getApiKey() {
  const env = import.meta.env as Record<string, string | undefined>;
  return env.VITE_GEMINI_API_KEY || '';
}

function extractJsonObject(text: string) {
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s < 0 || e <= s) return null;
  return text.slice(s, e + 1);
}

export async function runAssistant(
  message: string,
  context: AssistantContext,
  files: AssistantFile[] = []
): Promise<AssistantRunResult> {
  const apiKey = getApiKey();
  if (!apiKey || apiKey === 'PLACEHOLDER_API_KEY') {
    throw new Error('Missing Gemini API key. Add VITE_GEMINI_API_KEY to .env.local');
  }

  const ai = new GoogleGenAI({ apiKey });
  const model = 'gemini-2.5-flash';

  const contextPayload = {
    nowIso: new Date().toISOString(),
    courses: context.courses.map(c => ({ id: c.id, code: c.code, name: c.name, calendarId: c.calendarId })),
    calendars: context.calendars.map(c => ({ id: c.id, name: c.name })),
    assignments: context.assignments.slice(0, 200).map(a => ({
      id: a.id,
      title: a.title,
      dueDate: a.dueDate,
      dueTime: a.dueTime,
      courseId: a.courseId,
      priority: a.priority,
      completed: a.completed,
      isGraded: Boolean(a.isGraded),
      pointsEarned: a.pointsEarned,
      pointsPossible: a.pointsPossible,
    })),
    events: context.events.slice(0, 200).map(e => ({
      id: e.id,
      title: e.title,
      startTime: e.startTime,
      endTime: e.endTime,
      courseId: e.courseId,
      calendarId: e.calendarId,
    })),
    notes: context.notes.slice(0, 80).map(n => ({
      id: n.id,
      courseId: n.courseId,
      title: n.title,
      preview: n.content.slice(0, 240),
    })),
    resourcesCount: context.resources.length,
  };

  const prompt = `
You are an app assistant for a student planner.
You can read planner context and optionally produce actions.

USER MESSAGE:
${message}

PLANNER CONTEXT JSON:
${JSON.stringify(contextPayload)}

Return strict JSON only with this shape:
{
  "reply": "short helpful answer",
  "actions": [
    {
      "type": "create_assignment",
      "title": "string",
      "courseRef": "optional course code/name/id",
      "dueDate": "YYYY-MM-DD optional",
      "dueTime": "HH:mm optional",
      "priority": "low|medium|high optional",
      "description": "optional",
      "isGraded": true
    },
    {
      "type": "create_event",
      "title": "string",
      "startTime": "ISO string",
      "endTime": "ISO string",
      "courseRef": "optional course code/name/id",
      "calendarRef": "optional calendar name/id",
      "location": "optional",
      "notes": "optional"
    },
    {
      "type": "create_course",
      "name": "string",
      "code": "optional short code like COMP2521",
      "instructor": "optional",
      "color": "optional tailwind bg color class like bg-indigo-500"
    },
    {
      "type": "reassign_event_to_course",
      "eventRef": "event id or unique title snippet",
      "courseRef": "course code/name/id"
    }
  ]
}

Rules:
- Only include actions if user clearly asked to create something.
- If user asked for a study schedule, create one or more create_event actions.
- If user asks to create classes/courses, emit create_course actions.
- If user asks to assign existing events to classes, emit reassign_event_to_course actions.
- If date/time missing, infer reasonable defaults.
- Keep reply concise and confirm what actions were planned.
`;

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [{ text: prompt }];
  if (files.length > 0) {
    for (const file of files) {
      parts.push({
        inlineData: {
          mimeType: file.mimeType || 'application/octet-stream',
          data: file.base64Data,
        },
      });
    }
  }

  const response = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts }],
  });

  const raw = response.text || '';
  const jsonText = extractJsonObject(raw);
  if (!jsonText) {
    return { reply: raw.trim() || 'Done.', actions: [] };
  }

  try {
    const parsed = JSON.parse(jsonText) as Partial<AssistantRunResult>;
    return {
      reply: typeof parsed.reply === 'string' ? parsed.reply : 'Done.',
      actions: Array.isArray(parsed.actions) ? (parsed.actions as AssistantAction[]) : [],
    };
  } catch {
    return { reply: raw.trim() || 'Done.', actions: [] };
  }
}
