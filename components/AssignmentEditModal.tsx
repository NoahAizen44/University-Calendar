import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Download, Pencil, Trash2, Upload, X } from 'lucide-react';
import { Assignment, AssignmentAttachment, Course, Priority } from '../types';
import { putBlob, getBlob, deleteBlob } from '../services/idb';
import { uid } from '../services/id';
import DatePicker from './DatePicker';
import ConfirmDialog from './ConfirmDialog';
import { toast } from '../services/toast';

interface AssignmentEditModalProps {
  open: boolean;
  assignment: Assignment | null;
  courses: Course[];
  onClose: () => void;
  onSave: (patch: Partial<Assignment>) => void;
  onDelete?: (assignmentId: string) => void;
}

const AssignmentEditModal: React.FC<AssignmentEditModalProps> = ({ open, assignment, courses, onClose, onSave, onDelete }) => {
  const [editing, setEditing] = useState(false);
  const [editTab, setEditTab] = useState<'main' | 'notes'>('main');
  const [courseMenuOpen, setCourseMenuOpen] = useState(false);
  const [courseMenuPos, setCourseMenuPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [attachmentToDelete, setAttachmentToDelete] = useState<AssignmentAttachment | null>(null);
  const courseButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const courseMenuRef = React.useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState<{
    title: string;
    courseId: string;
    dueDate: string;
    dueTime: string;
    priority: Priority;
    description: string;
    isGraded: boolean;
    weightPercent: string;
    pointsPossible: string;
    pointsEarned: string;
  } | null>(null);

  useEffect(() => {
    if (!open || !assignment) return;
    setEditing(false);
    setEditTab('main');
    setCourseMenuOpen(false);
    setCourseMenuPos(null);
    setDraft({
      title: assignment.title,
      courseId: assignment.courseId ?? '',
      dueDate: new Date(assignment.dueDate).toISOString().slice(0, 10),
      dueTime: assignment.dueTime ?? '',
      priority: assignment.priority,
      description: assignment.description ?? '',
      isGraded: Boolean(assignment.isGraded),
      weightPercent: typeof assignment.weightPercent === 'number' ? String(assignment.weightPercent) : '',
      pointsPossible: typeof assignment.pointsPossible === 'number' ? String(assignment.pointsPossible) : '',
      pointsEarned: typeof assignment.pointsEarned === 'number' ? String(assignment.pointsEarned) : '',
    });
  }, [open, assignment?.id]);

  useEffect(() => {
    if (!open || !courseMenuOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (courseButtonRef.current?.contains(t)) return;
      if (courseMenuRef.current?.contains(t)) return;
      setCourseMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open, courseMenuOpen]);

  useEffect(() => {
    if (!open || !courseMenuOpen) return;
    const el = courseButtonRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setCourseMenuPos({ left: r.left, top: r.bottom + 8, width: r.width });
  }, [open, courseMenuOpen]);

  const courseName = useMemo(() => {
    if (!assignment?.courseId) return 'No course';
    return courses.find(c => c.id === assignment.courseId)?.name ?? 'Unknown course';
  }, [assignment?.courseId, courses]);

  const uploadFiles = async (files: FileList | null) => {
    if (!assignment || !files || files.length === 0) return;
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

    onSave({ attachments: [...(assignment.attachments ?? []), ...created] });
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

  const downloadAttachment = async (att: AssignmentAttachment) => {
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

  const deleteAttachment = async (att: AssignmentAttachment) => {
    if (!assignment) return;
    await deleteBlob(att.blobId);
    const next = (assignment.attachments ?? []).filter(x => x.id !== att.id);
    onSave({ attachments: next });
    toast('Attachment deleted');
  };

  if (!open || !assignment || !draft) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />

      {editing && courseMenuOpen && courseMenuPos && (
        <div
          ref={courseMenuRef}
          className="fixed z-[70] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          style={{ left: courseMenuPos.left, top: courseMenuPos.top, width: courseMenuPos.width }}
          role="listbox"
        >
          <div className="p-1">
            <button
              type="button"
              role="option"
              aria-selected={draft.courseId === ''}
              onClick={() => {
                setDraft(prev => ({ ...prev, courseId: '' }));
                setCourseMenuOpen(false);
              }}
              className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-colors ${
                draft.courseId === '' ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              No course
            </button>
            {courses.map(c => {
              const active = draft.courseId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    setDraft(prev => ({ ...prev, courseId: c.id }));
                    setCourseMenuOpen(false);
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

      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-100">
          <div className="min-w-0">
            <div className="inline-flex items-center px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-[11px] font-semibold uppercase tracking-wide">Assignment</div>
            <div className="text-xl font-bold text-slate-900 truncate mt-2">{assignment.title}</div>
            <div className="text-sm text-slate-500 mt-1">
              Due {new Date(assignment.dueDate).toLocaleDateString()}
              {assignment.dueTime ? ` • ${assignment.dueTime}` : ''}
              {assignment.isGraded && typeof assignment.weightPercent === 'number' ? ` • ${assignment.weightPercent}% of final` : ''}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!editing && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(v => {
                      const next = !v;
                      if (next) setEditTab('main');
                      return next;
                    });
                  }}
                  className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
                  title="Edit details"
                >
                  <Pencil className="w-4 h-4" />
                  Edit details
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!onDelete) return;
                    setShowDeleteConfirm(true);
                  }}
                  disabled={!onDelete}
                  className={`inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-xl transition-colors ${
                    onDelete
                      ? 'text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100'
                      : 'text-slate-300 bg-slate-100 cursor-not-allowed'
                  }`}
                  title="Delete assignment"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[72vh] overflow-y-auto">
          {/* Read-only view */}
          {!editing ? (
            <>
              <div className="flex items-start justify-between gap-6">
                <div className="min-w-0 bg-slate-50 border border-slate-200 rounded-2xl p-4 flex-1">
                  <div className="text-xs font-semibold text-slate-600 mb-1">Course</div>
                  <div className="text-sm text-slate-700 truncate">{courseName}</div>
                </div>

                <div className="text-right shrink-0 bg-slate-50 border border-slate-200 rounded-2xl p-4">
                  <div className="text-xs font-semibold text-slate-600 mb-1">Due</div>
                  <div className="text-sm text-slate-700">
                    {new Date(assignment.dueDate).toLocaleDateString()}
                    {assignment.dueTime ? ` • ${assignment.dueTime}` : ''}
                  </div>
                  {assignment.isGraded && typeof assignment.weightPercent === 'number' && (
                    <div className="text-xs text-slate-500 mt-0.5">{assignment.weightPercent}% of final</div>
                  )}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-600 mb-1">Description</div>
                <div className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-2xl p-4">
                  {assignment.description?.trim() ? assignment.description : 'No description yet.'}
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-all"
                >
                  Done
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
                  <button
                    type="button"
                    onClick={() => setEditTab('main')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                      editTab === 'main' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Main
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditTab('notes')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                      editTab === 'notes' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Notes & resources
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {editTab === 'main' ? (
                  <>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
                      <input
                        value={draft.title}
                        onChange={e => setDraft({ ...draft, title: e.target.value })}
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1">Course</label>
                      <button
                        ref={courseButtonRef}
                        type="button"
                        onClick={() => setCourseMenuOpen(v => !v)}
                        className="w-full flex items-center justify-between gap-3 px-4 py-2 border border-slate-200 rounded-xl bg-white text-sm text-slate-800 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                      >
                        <span className="min-w-0 flex items-center gap-2 truncate">
                          {draft.courseId ? (
                            <>
                              <span className={`w-2.5 h-2.5 rounded-full ${courses.find(c => c.id === draft.courseId)?.color || 'bg-slate-300'}`} />
                              <span className="truncate">
                                {(() => {
                                  const c = courses.find(x => x.id === draft.courseId);
                                  if (!c) return 'No course';
                                  return `${c.code ? `${c.code} — ` : ''}${c.name}`;
                                })()}
                              </span>
                            </>
                          ) : (
                            <span className="truncate">No course</span>
                          )}
                        </span>
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      </button>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Due date</label>
                      <DatePicker value={draft.dueDate} onChange={(next) => setDraft({ ...draft, dueDate: next })} placeholder="Select date" />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Due time (optional)</label>
                      <input
                        type="time"
                        value={draft.dueTime}
                        onChange={e => setDraft({ ...draft, dueTime: e.target.value })}
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
                      <div className="flex items-center gap-2">
                        {(['low', 'medium', 'high'] as Priority[]).map(p => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setDraft({ ...draft, priority: p })}
                            className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-colors ${
                              p === 'low'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : p === 'medium'
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-rose-50 text-rose-700 border-rose-200'
                            } ${draft.priority === p ? 'ring-2 ring-indigo-500/20 border-indigo-300' : ''}`}
                          >
                            {p === 'low' ? 'LOW' : p === 'medium' ? 'MED' : 'HIGH'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="md:col-span-2 bg-slate-50 border border-slate-200 rounded-2xl p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <div className="text-sm font-semibold text-slate-800">Grading</div>
                          <div className="text-xs text-slate-500">Counts toward grade, plus weight and score.</div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setDraft(prev => {
                              const next = { ...prev, isGraded: !prev.isGraded };
                              if (!next.isGraded) {
                                next.weightPercent = '';
                                next.pointsPossible = '';
                                next.pointsEarned = '';
                              }
                              return next;
                            })
                          }
                          className={`w-11 h-6 rounded-full transition-colors ${draft.isGraded ? 'bg-indigo-600' : 'bg-slate-300'}`}
                          aria-label="Counts toward grade"
                        >
                          <div
                            className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${
                              draft.isGraded ? 'translate-x-5' : 'translate-x-1'
                            }`}
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
                              step={0.1}
                              value={draft.weightPercent}
                              onChange={e => setDraft({ ...draft, weightPercent: e.target.value })}
                              className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none bg-white border-slate-200"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Out of</label>
                            <input
                              type="number"
                              min={0}
                              step={0.1}
                              value={draft.pointsPossible}
                              onChange={e => setDraft({ ...draft, pointsPossible: e.target.value })}
                              className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none bg-white border-slate-200"
                            />
                          </div>

                          <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-slate-700 mb-1">Grade</label>
                            <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                              <input
                                type="number"
                                min={0}
                                step={0.1}
                                value={draft.pointsEarned}
                                onChange={e => setDraft({ ...draft, pointsEarned: e.target.value })}
                                placeholder="-"
                                className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none bg-white border-slate-200"
                              />
                              <div className="flex items-center justify-center text-slate-500">/</div>
                              <input
                                type="number"
                                min={0}
                                step={0.1}
                                value={draft.pointsPossible}
                                onChange={e => setDraft({ ...draft, pointsPossible: e.target.value })}
                                placeholder="100"
                                className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none bg-white border-slate-200"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                      <textarea
                        value={draft.description}
                        onChange={e => setDraft({ ...draft, description: e.target.value })}
                        placeholder="Add requirements, notes, links..."
                        rows={7}
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold text-slate-800">Relevant resources</div>
                          <div className="text-xs text-slate-400 mt-1">Upload PDFs, screenshots, rubrics, or reference docs.</div>
                        </div>
                        <label className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-xl hover:bg-indigo-100 transition-colors cursor-pointer">
                          <Upload className="w-4 h-4" />
                          Upload
                          <input type="file" multiple className="hidden" onChange={e => uploadFiles(e.target.files)} />
                        </label>
                      </div>

                      <div className="mt-3 space-y-2">
                        {(assignment.attachments ?? []).length === 0 ? (
                          <div className="text-sm text-slate-500 bg-white border border-slate-200 rounded-2xl p-4">No files yet.</div>
                        ) : (
                          (assignment.attachments ?? []).map(att => (
                            <div key={att.id} className="flex items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl p-3">
                              <button
                                type="button"
                                onClick={() => openAttachment(att)}
                                className="flex-1 min-w-0 text-left"
                                title="Open"
                              >
                                <div className="text-sm font-medium text-slate-800 truncate">{att.name}</div>
                                <div className="text-xs text-slate-400">{Math.round((att.size ?? 0) / 1024)} KB</div>
                              </button>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => downloadAttachment(att)}
                                  className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                                  title="Download"
                                >
                                  <Download className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setAttachmentToDelete(att)}
                                  className="px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl hover:bg-rose-100"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setDraft({
                      title: assignment.title,
                      courseId: assignment.courseId ?? '',
                      dueDate: new Date(assignment.dueDate).toISOString().slice(0, 10),
                      dueTime: assignment.dueTime ?? '',
                      priority: assignment.priority,
                      description: assignment.description ?? '',
                      isGraded: Boolean(assignment.isGraded),
                      weightPercent: typeof assignment.weightPercent === 'number' ? String(assignment.weightPercent) : '',
                      pointsPossible: typeof assignment.pointsPossible === 'number' ? String(assignment.pointsPossible) : '',
                      pointsEarned: typeof assignment.pointsEarned === 'number' ? String(assignment.pointsEarned) : '',
                    });
                  }}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const weight = draft.weightPercent.trim() === '' ? undefined : Number(draft.weightPercent);
                    const ptsPossible = draft.pointsPossible.trim() === '' ? undefined : Number(draft.pointsPossible);
                    const ptsEarned = draft.pointsEarned.trim() === '' ? undefined : Number(draft.pointsEarned);

                    onSave({
                      title: draft.title.trim() || assignment.title,
                      courseId: draft.courseId || null,
                      dueDate: draft.dueDate,
                      dueTime: draft.dueTime || undefined,
                      priority: draft.priority,
                      description: draft.description,
                      isGraded: draft.isGraded,
                      weightPercent: draft.isGraded ? weight : undefined,
                      pointsPossible: draft.isGraded ? ptsPossible : undefined,
                      pointsEarned: draft.isGraded ? ptsEarned : undefined,
                    });
                    setEditing(false);
                    toast('Assignment updated');
                  }}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-all"
                >
                  Save
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete assignment?"
        message={`This will permanently delete "${assignment.title}".`}
        confirmLabel="Delete assignment"
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={() => {
          if (!onDelete) return;
          onDelete(assignment.id);
          toast('Assignment deleted');
          setShowDeleteConfirm(false);
          onClose();
        }}
      />

      <ConfirmDialog
        open={Boolean(attachmentToDelete)}
        title="Delete attachment?"
        message={attachmentToDelete ? `This will permanently delete "${attachmentToDelete.name}".` : ''}
        confirmLabel="Delete file"
        onCancel={() => setAttachmentToDelete(null)}
        onConfirm={async () => {
          if (!attachmentToDelete) return;
          await deleteAttachment(attachmentToDelete);
          setAttachmentToDelete(null);
        }}
      />
    </div>
  );
};

export default AssignmentEditModal;
