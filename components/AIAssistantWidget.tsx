import React, { useEffect, useMemo, useState } from 'react';
import { Bot, BookOpen, Calendar, Loader2, Paperclip, Send, Sparkles, Target, X } from 'lucide-react';
import type { Assignment, CalendarEvent, Course, CourseNote, CourseResource, UniCalendar } from '../types';
import { runAssistant, type AssistantAction, type AssistantChatMessage, type AssistantFile } from '../services/assistantService';

type Props = {
  courses: Course[];
  calendars: UniCalendar[];
  assignments: Assignment[];
  events: CalendarEvent[];
  notes: CourseNote[];
  resources: CourseResource[];
  onPreviewActions: (actions: AssistantAction[]) => Promise<{
    createdAssignments: number;
    createdEvents: number;
    createdCourses: number;
    reassignedEvents: number;
    deletedAssignments: number;
    deletedEvents: number;
    deletedCourses: number;
  }>;
  onConfirmPreview: () => Promise<{
    createdAssignments: number;
    createdEvents: number;
    createdCourses: number;
    reassignedEvents: number;
    deletedAssignments: number;
    deletedEvents: number;
    deletedCourses: number;
  }>;
  onDiscardPreview: () => void;
  previewActive: boolean;
  previewCreatedItems: string[];
  previewUpdatedItems: string[];
  previewDeletedItems: string[];
};

type MessageAttachment = {
  id: string;
  name: string;
  mimeType: string;
  base64Data: string;
  size: number;
};

type WidgetMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  attachments?: MessageAttachment[];
};

const AIAssistantWidget: React.FC<Props> = ({
  courses,
  calendars,
  assignments,
  events,
  notes,
  resources,
  onPreviewActions,
  onConfirmPreview,
  onDiscardPreview,
  previewActive,
  previewCreatedItems,
  previewUpdatedItems,
  previewDeletedItems,
}) => {
  const monthFromToken = (token: string) => {
    const t = token.toLowerCase().slice(0, 3);
    const idx = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(t);
    return idx >= 0 ? idx + 1 : null;
  };

  const pad2 = (n: number) => String(n).padStart(2, '0');

  const extractExplicitExcludeYmd = (text: string) => {
    const out = new Set<string>();
    const hasExcludeIntent = /\b(except|exclude|excluding|skip|without)\b/i.test(text);
    if (!hasExcludeIntent) return { hasExcludeIntent: false, dates: out };

    const yearMatches = [...text.matchAll(/\b(20\d{2})\b/g)].map(m => Number(m[1]));
    const fallbackYear = yearMatches.length > 0 ? yearMatches[0] : new Date().getFullYear();

    for (const m of text.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) {
      out.add(`${m[1]}-${m[2]}-${m[3]}`);
    }

    for (const m of text.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2}|\d{2})\b/g)) {
      const d = Number(m[1]);
      const mo = Number(m[2]);
      const yRaw = Number(m[3]);
      const y = yRaw < 100 ? 2000 + yRaw : yRaw;
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) out.add(`${y}-${pad2(mo)}-${pad2(d)}`);
    }

    const rangeRegex = /\b(?:week\s+)?(?:of\s+)?([A-Za-z]{3,9})\s+(\d{1,2})\s*(?:-|to|–)\s*(\d{1,2})(?:\s*,?\s*(20\d{2}))?\b/gi;
    for (const m of text.matchAll(rangeRegex)) {
      const month = monthFromToken(m[1]);
      if (!month) continue;
      const dayStart = Number(m[2]);
      const dayEnd = Number(m[3]);
      const y = m[4] ? Number(m[4]) : fallbackYear;
      if (dayStart < 1 || dayStart > 31 || dayEnd < 1 || dayEnd > 31 || dayEnd < dayStart) continue;
      for (let d = dayStart; d <= dayEnd; d += 1) {
        out.add(`${y}-${pad2(month)}-${pad2(d)}`);
      }
    }

    return { hasExcludeIntent: true, dates: out };
  };

  const sanitizeRecurringExclusions = (actions: AssistantAction[], userText: string): AssistantAction[] => {
    const parsed = extractExplicitExcludeYmd(userText);
    if (!parsed.hasExcludeIntent) return actions;
    const explicit = parsed.dates;
    return actions.map(action => {
      if (action.type !== 'create_event' && action.type !== 'create_exam') return action;
      const next: AssistantAction = { ...action };
      if (explicit.size === 0) {
        if ('recurrenceExcludeYmd' in next) delete next.recurrenceExcludeYmd;
        return next;
      }
      if (Array.isArray(next.recurrenceExcludeYmd) && next.recurrenceExcludeYmd.length > 0) {
        next.recurrenceExcludeYmd = next.recurrenceExcludeYmd.filter(d => explicit.has(d));
      } else {
        next.recurrenceExcludeYmd = Array.from(explicit);
      }
      return next;
    });
  };

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<WidgetMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<MessageAttachment[]>([]);
  const [pendingActionCount, setPendingActionCount] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [widgetRect, setWidgetRect] = useState({ x: 0, y: 0, width: 430, height: 620 });
  const [dragState, setDragState] = useState<null | { startX: number; startY: number; originX: number; originY: number }>(null);
  const [resizeState, setResizeState] = useState<null | { startX: number; startY: number; width: number; height: number; x: number; y: number }>(null);
  const [previewAttachment, setPreviewAttachment] = useState<MessageAttachment | null>(null);

  const clampRect = (next: { x: number; y: number; width: number; height: number }) => {
    const padding = 8;
    const minWidth = 320;
    const minHeight = 420;
    const maxWidth = Math.max(minWidth, window.innerWidth - padding * 2);
    const maxHeight = Math.max(minHeight, window.innerHeight - padding * 2);
    const width = Math.min(Math.max(next.width, minWidth), maxWidth);
    const height = Math.min(Math.max(next.height, minHeight), maxHeight);
    const x = Math.min(Math.max(next.x, padding), window.innerWidth - width - padding);
    const y = Math.min(Math.max(next.y, padding), window.innerHeight - height - padding);
    return { x, y, width, height };
  };

  useEffect(() => {
    if (!open) return;
    setWidgetRect(prev => {
      if (prev.x !== 0 || prev.y !== 0) return clampRect(prev);
      const width = Math.min(430, window.innerWidth - 16);
      const height = Math.min(620, window.innerHeight - 16);
      return clampRect({
        x: window.innerWidth - width - 20,
        y: window.innerHeight - height - 20,
        width,
        height,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => setWidgetRect(prev => clampRect(prev));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!dragState && !resizeState) return;

    const onPointerMove = (e: PointerEvent) => {
      if (dragState) {
        const dx = e.clientX - dragState.startX;
        const dy = e.clientY - dragState.startY;
        setWidgetRect(prev => clampRect({ ...prev, x: dragState.originX + dx, y: dragState.originY + dy }));
        return;
      }
      if (resizeState) {
        const dw = e.clientX - resizeState.startX;
        const dh = e.clientY - resizeState.startY;
        setWidgetRect(prev =>
          clampRect({
            ...prev,
            x: resizeState.x,
            y: resizeState.y,
            width: resizeState.width + dw,
            height: resizeState.height + dh,
          })
        );
      }
    };

    const onPointerUp = () => {
      setDragState(null);
      setResizeState(null);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragState, resizeState]);

  const contextRows = useMemo(
    () => [
      { icon: <BookOpen className="w-3.5 h-3.5" />, label: `Courses ${courses.length}` },
      { icon: <Target className="w-3.5 h-3.5" />, label: `Assignments ${assignments.length}` },
      { icon: <Calendar className="w-3.5 h-3.5" />, label: `Events ${events.length}` },
      { icon: <Bot className="w-3.5 h-3.5" />, label: `Notes ${notes.length}` },
      { icon: <Paperclip className="w-3.5 h-3.5" />, label: `Resources ${resources.length}` },
    ],
    [courses.length, assignments.length, events.length, notes.length, resources.length]
  );

  const readFileAsBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const raw = String(reader.result ?? '');
        const commaIdx = raw.indexOf(',');
        resolve(commaIdx >= 0 ? raw.slice(commaIdx + 1) : raw);
      };
      reader.onerror = () => reject(reader.error ?? new Error('Failed reading file'));
      reader.readAsDataURL(file);
    });

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const next: MessageAttachment[] = [];
    for (const file of Array.from(files)) {
      if (file.size > 8 * 1024 * 1024) continue;
      const base64Data = await readFileAsBase64(file);
      next.push({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        base64Data,
        size: file.size,
      });
    }
    setPendingFiles(prev => [...prev, ...next].slice(-5));
  };

  const send = async () => {
    const text = draft.trim();
    if (!text && pendingFiles.length === 0) return;
    const outgoingAttachments = [...pendingFiles];
    const outgoingText = text || 'Read attached files and help me.';
    const nextMessages: WidgetMessage[] = [
      ...messages,
      { id: `u_${Date.now()}`, role: 'user', text: text || '(attachment)', attachments: outgoingAttachments },
    ];
    setMessages(nextMessages);
    setDraft('');
    setLoading(true);
    try {
      const filesForAi: AssistantFile[] = outgoingAttachments.map(({ name, mimeType, base64Data }) => ({ name, mimeType, base64Data }));
      const historyForAi: AssistantChatMessage[] = nextMessages
        .map(m => ({ role: m.role, text: m.text.trim() }))
        .filter(m => m.text.length > 0)
        .slice(-16);
      const result = await runAssistant(outgoingText, { courses, calendars, assignments, events, notes, resources }, filesForAi, historyForAi);
      const sanitizedActions = sanitizeRecurringExclusions(result.actions, outgoingText);
      const execution = await onPreviewActions(sanitizedActions);
      setPendingActionCount(sanitizedActions.length);
      const statusBits: string[] = [];
      if (execution.createdAssignments > 0) statusBits.push(`${execution.createdAssignments} assignment${execution.createdAssignments === 1 ? '' : 's'}`);
      if (execution.createdEvents > 0) statusBits.push(`${execution.createdEvents} event${execution.createdEvents === 1 ? '' : 's'}`);
      if (execution.createdCourses > 0) statusBits.push(`${execution.createdCourses} course${execution.createdCourses === 1 ? '' : 's'}`);
      if (execution.reassignedEvents > 0) statusBits.push(`${execution.reassignedEvents} reassignment${execution.reassignedEvents === 1 ? '' : 's'}`);
      if (execution.deletedAssignments > 0) statusBits.push(`${execution.deletedAssignments} assignment deletion${execution.deletedAssignments === 1 ? '' : 's'}`);
      if (execution.deletedEvents > 0) statusBits.push(`${execution.deletedEvents} event deletion${execution.deletedEvents === 1 ? '' : 's'}`);
      if (execution.deletedCourses > 0) statusBits.push(`${execution.deletedCourses} course deletion${execution.deletedCourses === 1 ? '' : 's'}`);
      const status = sanitizedActions.length > 0
        ? `\n\nPreview ready${statusBits.length ? `: ${statusBits.join(', ')}` : ''}. Confirm to apply.`
        : '';
      setMessages(prev => [
        ...prev,
        { id: `a_${Date.now()}`, role: 'assistant', text: `${result.reply}${status}`.trim() },
      ]);
      setPendingFiles([]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Assistant failed.';
      setMessages(prev => [...prev, { id: `a_err_${Date.now()}`, role: 'assistant', text: message }]);
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-[80] inline-flex items-center gap-2 px-4 py-3 rounded-2xl bg-indigo-600 text-white shadow-xl shadow-indigo-300/40 hover:bg-indigo-700 transition-colors"
      >
        <Sparkles className="w-4 h-4" />
        Assistant
      </button>
    );
  }

  return (
    <div
      className="fixed z-[80] rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden flex flex-col"
      style={{ left: widgetRect.x, top: widgetRect.y, width: widgetRect.width, height: widgetRect.height }}
    >
      <div
        className="px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-indigo-600 to-blue-600 text-white flex items-center justify-between cursor-move select-none"
        onPointerDown={e => {
          const target = e.target as HTMLElement;
          if (target.closest('button')) return;
          setDragState({ startX: e.clientX, startY: e.clientY, originX: widgetRect.x, originY: widgetRect.y });
        }}
      >
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide opacity-90 font-semibold">AI Assistant</div>
          <div className="text-sm font-semibold truncate">Free-command workspace agent</div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="p-1.5 rounded-lg bg-white/15 hover:bg-white/25 transition-colors"
          title="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap gap-2">
        {contextRows.map(item => (
          <div key={item.label} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-medium">
            {item.icon}
            {item.label}
          </div>
        ))}
      </div>

      {previewActive && (
        <div className="mx-4 mt-3 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-800 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span>
              Preview mode: {pendingActionCount > 0 ? `${pendingActionCount} planned action${pendingActionCount === 1 ? '' : 's'}` : 'planned changes'}.
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onDiscardPreview();
                  setPendingActionCount(0);
                  setMessages(prev => [...prev, { id: `a_discard_${Date.now()}`, role: 'assistant', text: 'Preview discarded.' }]);
                }}
                className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={async () => {
                  const result = await onConfirmPreview();
                  const bits: string[] = [];
                  if (result.createdAssignments > 0) bits.push(`${result.createdAssignments} assignment${result.createdAssignments === 1 ? '' : 's'}`);
                  if (result.createdEvents > 0) bits.push(`${result.createdEvents} event${result.createdEvents === 1 ? '' : 's'}`);
                  if (result.createdCourses > 0) bits.push(`${result.createdCourses} course${result.createdCourses === 1 ? '' : 's'}`);
                  if (result.reassignedEvents > 0) bits.push(`${result.reassignedEvents} reassignment${result.reassignedEvents === 1 ? '' : 's'}`);
                  if (result.deletedAssignments > 0) bits.push(`${result.deletedAssignments} assignment deletion${result.deletedAssignments === 1 ? '' : 's'}`);
                  if (result.deletedEvents > 0) bits.push(`${result.deletedEvents} event deletion${result.deletedEvents === 1 ? '' : 's'}`);
                  if (result.deletedCourses > 0) bits.push(`${result.deletedCourses} course deletion${result.deletedCourses === 1 ? '' : 's'}`);
                  setPendingActionCount(0);
                  setMessages(prev => [...prev, { id: `a_apply_${Date.now()}`, role: 'assistant', text: bits.length ? `Applied: ${bits.join(', ')}.` : 'No changes to apply.' }]);
                }}
                className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
              >
                Confirm
              </button>
            </div>
          </div>
          {previewDeletedItems.length > 0 && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-2 text-rose-800">
              <div className="font-semibold mb-1">Will be deleted:</div>
              <div className="space-y-0.5 max-h-24 overflow-auto">
                {previewDeletedItems.map((item, idx) => (
                  <div key={`${item}_${idx}`}>• {item}</div>
                ))}
              </div>
            </div>
          )}
          {previewCreatedItems.length > 0 && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-2 text-emerald-800">
              <div className="font-semibold mb-1">Will be created:</div>
              <div className="space-y-0.5 max-h-24 overflow-auto">
                {previewCreatedItems.map((item, idx) => (
                  <div key={`${item}_${idx}`}>• {item}</div>
                ))}
              </div>
            </div>
          )}
          {previewUpdatedItems.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-2 text-amber-800">
              <div className="font-semibold mb-1">Will be updated:</div>
              <div className="space-y-0.5 max-h-24 overflow-auto">
                {previewUpdatedItems.map((item, idx) => (
                  <div key={`${item}_${idx}`}>• {item}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2 bg-slate-50/40">
        {messages.length === 0 && (
          <div className="rounded-xl px-3 py-2 text-sm bg-white border border-slate-200 text-slate-600">
            Ask me anything about your planner. I can create assignments/events and build study schedules.
          </div>
        )}
        {messages.map(m => (
          <div key={m.id} className="space-y-2">
            <div
              className={`rounded-xl px-3 py-2 text-sm ${
                m.role === 'assistant' ? 'bg-white border border-slate-200 text-slate-700' : 'bg-indigo-600 text-white ml-10'
              }`}
            >
              {m.text}
            </div>
            {m.role === 'user' && m.attachments && m.attachments.length > 0 && (
              <div className="ml-10 flex flex-wrap gap-2">
                {m.attachments.map(file => {
                  const isImage = file.mimeType.startsWith('image/');
                  const src = isImage ? `data:${file.mimeType};base64,${file.base64Data}` : '';
                  return (
                    <button
                      key={file.id}
                      type="button"
                      onClick={() => setPreviewAttachment(file)}
                      className="rounded-lg border border-slate-200 bg-white p-1.5 text-left hover:bg-slate-50"
                      title="Open attachment"
                    >
                      {isImage ? (
                        <img src={src} alt={file.name} className="h-16 w-24 object-cover rounded-md mb-1" />
                      ) : (
                        <div className="inline-flex items-center gap-1 text-xs text-slate-600 mb-1">
                          <Paperclip className="w-3 h-3" />
                          File
                        </div>
                      )}
                      <div className="max-w-[160px] truncate text-xs text-slate-600">{file.name}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="rounded-xl px-3 py-2 text-sm bg-white border border-slate-200 text-slate-600 inline-flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Thinking...
          </div>
        )}
      </div>

      <div className="px-4 py-3 border-t border-slate-100 space-y-2">
        <div
          className={`rounded-xl border-2 border-dashed px-3 py-2 text-xs transition-colors ${
            dragOver ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-slate-50 text-slate-500'
          }`}
          onDragOver={e => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={e => {
            e.preventDefault();
            setDragOver(false);
          }}
          onDrop={e => {
            e.preventDefault();
            setDragOver(false);
            void addFiles(e.dataTransfer.files);
          }}
        >
          {dragOver ? 'Drop files to attach' : 'Drag and drop files here'}
        </div>
        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {pendingFiles.map(file => (
              <div key={file.id} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-slate-200 bg-white text-xs text-slate-600">
                <Paperclip className="w-3 h-3" />
                <span className="max-w-[160px] truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={() => setPendingFiles(prev => prev.filter(f => f.id !== file.id))}
                  className="text-slate-400 hover:text-rose-600"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <label
            className="inline-flex items-center justify-center w-10 h-10 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 cursor-pointer"
            title="Attach files"
          >
            <Paperclip className="w-4 h-4" />
            <input
              type="file"
              multiple
              className="hidden"
              onChange={e => {
                void addFiles(e.target.files);
                e.currentTarget.value = '';
              }}
            />
          </label>
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Tell AI what to do in the app..."
            className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={loading}
            className={`inline-flex items-center justify-center w-10 h-10 rounded-xl text-white ${loading ? 'bg-slate-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}
            title="Send"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div
        className="absolute right-0 bottom-0 w-4 h-4 cursor-nwse-resize"
        onPointerDown={e => {
          e.preventDefault();
          e.stopPropagation();
          setResizeState({
            startX: e.clientX,
            startY: e.clientY,
            width: widgetRect.width,
            height: widgetRect.height,
            x: widgetRect.x,
            y: widgetRect.y,
          });
        }}
        aria-label="Resize assistant widget"
        title="Drag to resize"
      >
        <div className="absolute right-1 bottom-1 w-2.5 h-2.5 border-r-2 border-b-2 border-slate-300 rounded-br-sm" />
      </div>
      {previewAttachment && (
        <div
          className="fixed inset-0 z-[120] bg-slate-900/70 flex items-center justify-center p-4"
          onClick={() => setPreviewAttachment(null)}
        >
          <div
            className="max-w-[90vw] max-h-[90vh] bg-white rounded-xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-slate-700 truncate">{previewAttachment.name}</div>
              <button
                type="button"
                onClick={() => setPreviewAttachment(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
                title="Close preview"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {previewAttachment.mimeType.startsWith('image/') ? (
              <img
                src={`data:${previewAttachment.mimeType};base64,${previewAttachment.base64Data}`}
                alt={previewAttachment.name}
                className="max-w-[90vw] max-h-[80vh] object-contain bg-slate-50"
              />
            ) : (
              <div className="p-4 text-sm text-slate-600">
                Preview is only available for images right now.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AIAssistantWidget;
