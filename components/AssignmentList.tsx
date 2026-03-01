import React, { useMemo, useState } from 'react';
import { Filter, Plus, Search } from 'lucide-react';
import type { Assignment, Course, RecurringTask } from '../types';
import AddTaskModal from './AddTaskModal';
import AssignmentEditModal from './AssignmentEditModal';

interface AssignmentListProps {
  assignments: Assignment[];
  courses: Course[];
  onAdd: (a: Omit<Assignment, 'id'>) => void;
  onAddRecurring?: (t: Omit<RecurringTask, 'id'>) => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onChange?: (next: Assignment[]) => void;
}

const AssignmentList: React.FC<AssignmentListProps> = ({ assignments, courses, onAdd, onChange }) => {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'today' | 'week' | 'overdue' | 'completed'>('all');
  const [nextRecurringOnly, setNextRecurringOnly] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const selectedAssignment = useMemo(
    () => (selectedAssignmentId ? assignments.find(a => a.id === selectedAssignmentId) ?? null : null),
    [assignments, selectedAssignmentId]
  );

  const filtered = useMemo(() => {
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

    const q = query.trim().toLowerCase();
    const byQuery = !q
      ? assignments
      : assignments.filter(a => {
          const course = courses.find(c => c.id === a.courseId);
          return (
            a.title.toLowerCase().includes(q) ||
            (course?.code ?? '').toLowerCase().includes(q) ||
            (course?.name ?? '').toLowerCase().includes(q)
          );
        });

    const now = new Date();
    const endOfWeek = new Date(now);
    endOfWeek.setDate(now.getDate() + ((7 - now.getDay()) % 7));
    endOfWeek.setHours(23, 59, 59, 999);

    let byFilter: Assignment[];
    if (filter === 'completed') byFilter = byQuery.filter(a => a.completed);
    else if (filter === 'overdue') byFilter = byQuery.filter(a => !a.completed && getDueDeadline(a).getTime() < now.getTime());
    else if (filter === 'today') byFilter = byQuery.filter(a => !a.completed && isSameDay(getDueDeadline(a), now));
    else if (filter === 'week') {
      byFilter = byQuery.filter(a => {
        if (a.completed) return false;
        const due = getDueDeadline(a).getTime();
        return due >= now.getTime() && due <= endOfWeek.getTime();
      });
    } else if (filter === 'upcoming') byFilter = byQuery.filter(a => !a.completed);
    else byFilter = byQuery;

    if (!nextRecurringOnly) return byFilter;

    const grouped = new Map<string, Assignment[]>();
    for (const a of byFilter) {
      const key = `${a.courseId || '__independent__'}|${a.title.trim().toLowerCase()}`;
      const list = grouped.get(key);
      if (list) list.push(a);
      else grouped.set(key, [a]);
    }

    const collapsed: Assignment[] = [];
    for (const list of grouped.values()) {
      if (list.length === 1) {
        collapsed.push(list[0]);
        continue;
      }
      const sorted = list.slice().sort((a, b) => getDueDeadline(a).getTime() - getDueDeadline(b).getTime());
      const next = sorted.find(a => getDueDeadline(a).getTime() >= now.getTime());
      collapsed.push(next ?? sorted[sorted.length - 1]);
    }
    return collapsed.sort((a, b) => getDueDeadline(a).getTime() - getDueDeadline(b).getTime());
  }, [assignments, courses, query, filter, nextRecurringOnly]);

  const savePatch = (id: string, patch: Partial<Assignment>) => {
    if (!onChange) return;
    onChange(assignments.map(a => (a.id === id ? { ...a, ...patch } : a)));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search assignments..."
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              type="button"
              onClick={() => setFilterOpen(v => !v)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
            >
              <Filter className="w-4 h-4" />
              Filter
            </button>

            {filterOpen && (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setFilterOpen(false)}
                  aria-label="Close filter"
                />
                    <div className="absolute right-0 mt-2 w-44 z-50 bg-white border border-slate-200 rounded-2xl shadow-lg overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setNextRecurringOnly(v => !v)}
                        className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors ${
                          nextRecurringOnly ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        Next recurring only
                      </button>
                      <div className="border-t border-slate-100" />
                      {(
                        [
                          { id: 'all' as const, label: 'All' },
                      { id: 'upcoming' as const, label: 'Upcoming' },
                      { id: 'today' as const, label: 'Due today' },
                      { id: 'week' as const, label: 'This week' },
                      { id: 'overdue' as const, label: 'Overdue' },
                      { id: 'completed' as const, label: 'Completed' },
                    ]
                  ).map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setFilter(opt.id);
                        setFilterOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors ${
                        filter === opt.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50'
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
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-all"
          >
            <Plus className="w-4 h-4" />
            Add Assignment
          </button>
        </div>
      </div>

      <AddTaskModal open={showAddModal} courses={courses} onClose={() => setShowAddModal(false)} onCreate={onAdd} />

      {assignments.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm py-20 px-6 text-center">
          <h3 className="text-lg font-semibold text-slate-800">No assignments yet</h3>
          <p className="text-sm text-slate-500 mt-2">Click "Add Assignment" to create your first assignment.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm py-16 px-6 text-center">
          <h3 className="text-lg font-semibold text-slate-800">No matching assignments</h3>
          <p className="text-sm text-slate-500 mt-2">
            {filter === 'today'
              ? 'Nothing due today.'
              : filter === 'week'
                ? 'Nothing due this week.'
                : filter === 'overdue'
                  ? 'No overdue assignments.'
                  : 'Try adjusting your search or filter.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(a => {
            const course = courses.find(c => c.id === a.courseId);
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => setSelectedAssignmentId(a.id)}
                className="text-left bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${course?.color || 'bg-slate-400'}`} />
                      <span className="text-xs font-medium text-slate-500">{course?.code ?? 'No course'}</span>
                    </div>
                    <div className="font-bold text-slate-800 mt-1 truncate">{a.title}</div>
                    <div className="text-xs text-slate-500 mt-2">
                      Due {new Date(a.dueDate).toLocaleDateString()}
                      {a.dueTime ? ` • ${a.dueTime}` : ''}
                    </div>
                  </div>
                  <div className="shrink-0 text-xs font-bold px-2 py-1 rounded-lg bg-slate-100 text-slate-700">
                    {a.priority === 'high' ? 'High' : a.priority === 'medium' ? 'Med' : 'Low'}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <AssignmentEditModal
        open={Boolean(selectedAssignment)}
        assignment={selectedAssignment}
        courses={courses}
        onClose={() => setSelectedAssignmentId(null)}
        onDelete={(assignmentId) => {
          if (!onChange) return;
          onChange(assignments.filter(a => a.id !== assignmentId));
          setSelectedAssignmentId(null);
        }}
        onSave={patch => {
          if (!selectedAssignment) return;
          savePatch(selectedAssignment.id, patch);
        }}
      />
    </div>
  );
};

export default AssignmentList;
