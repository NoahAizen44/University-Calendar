import React, { useEffect, useMemo, useState } from 'react';
import { Bot, BookOpen, Calendar, Loader2, Paperclip, Send, Sparkles, Target, X } from 'lucide-react';
import type { Assignment, CalendarEvent, Course, CourseNote, CourseResource, UniCalendar } from '../types';
import { runAssistant, type AssistantAction, type AssistantFile } from '../services/assistantService';

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
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<Array<{ id: string; role: 'user' | 'assistant'; text: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<Array<AssistantFile & { id: string; size: number }>>([]);
  const [pendingActionCount, setPendingActionCount] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [widgetRect, setWidgetRect] = useState({ x: 0, y: 0, width: 430, height: 620 });
  const [dragState, setDragState] = useState<null | { startX: number; startY: number; originX: number; originY: number }>(null);
  const [resizeState, setResizeState] = useState<null | { startX: number; startY: number; width: number; height: number; x: number; y: number }>(null);

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
    const next: Array<AssistantFile & { id: string; size: number }> = [];
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
    setMessages(prev => [...prev, { id: `u_${Date.now()}`, role: 'user', text }]);
    setDraft('');
    setLoading(true);
    try {
      const filesForAi: AssistantFile[] = pendingFiles.map(({ name, mimeType, base64Data }) => ({ name, mimeType, base64Data }));
      const result = await runAssistant(text || 'Read attached files and help me.', { courses, calendars, assignments, events, notes, resources }, filesForAi);
      const execution = await onPreviewActions(result.actions);
      setPendingActionCount(result.actions.length);
      const statusBits: string[] = [];
      if (execution.createdAssignments > 0) statusBits.push(`${execution.createdAssignments} assignment${execution.createdAssignments === 1 ? '' : 's'}`);
      if (execution.createdEvents > 0) statusBits.push(`${execution.createdEvents} event${execution.createdEvents === 1 ? '' : 's'}`);
      if (execution.createdCourses > 0) statusBits.push(`${execution.createdCourses} course${execution.createdCourses === 1 ? '' : 's'}`);
      if (execution.reassignedEvents > 0) statusBits.push(`${execution.reassignedEvents} reassignment${execution.reassignedEvents === 1 ? '' : 's'}`);
      if (execution.deletedAssignments > 0) statusBits.push(`${execution.deletedAssignments} assignment deletion${execution.deletedAssignments === 1 ? '' : 's'}`);
      if (execution.deletedEvents > 0) statusBits.push(`${execution.deletedEvents} event deletion${execution.deletedEvents === 1 ? '' : 's'}`);
      if (execution.deletedCourses > 0) statusBits.push(`${execution.deletedCourses} course deletion${execution.deletedCourses === 1 ? '' : 's'}`);
      const status = result.actions.length > 0
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
          <div
            key={m.id}
            className={`rounded-xl px-3 py-2 text-sm ${
              m.role === 'assistant' ? 'bg-white border border-slate-200 text-slate-700' : 'bg-indigo-600 text-white ml-10'
            }`}
          >
            {m.text}
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
    </div>
  );
};

export default AIAssistantWidget;
