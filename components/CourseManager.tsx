import React, { useMemo, useState } from 'react';
import { Book, User, Plus } from 'lucide-react';
import { Course } from '../types';
import { uid } from '../services/id';
import DatePicker from './DatePicker';
import { toast } from '../services/toast';

interface CourseManagerProps {
  courses: Course[];
  onUpdate: (courses: Course[]) => void;
  onOpenCourse?: (courseId: string) => void;
}

const CourseManager: React.FC<CourseManagerProps> = ({ courses, onUpdate, onOpenCourse }) => {
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState({
    code: '',
    name: '',
    instructor: '',
    color: 'bg-indigo-600',
    startDate: '',
    endDate: '',
  });

  const colorOptions = useMemo(
    () => [
      'bg-indigo-600',
      'bg-emerald-600',
      'bg-rose-600',
      'bg-amber-500',
      'bg-sky-600',
      'bg-violet-600',
      'bg-teal-600',
      'bg-slate-600',
    ],
    []
  );

  const closeCreate = () => {
    setShowCreate(false);
    setDraft({ code: '', name: '', instructor: '', color: 'bg-indigo-600', startDate: '', endDate: '' });
  };

  const createCourse = () => {
    const code = draft.code.trim().toUpperCase();
    const name = draft.name.trim();
    const instructor = draft.instructor.trim();
    const startDate = draft.startDate.trim();
    const endDate = draft.endDate.trim();

    if (!code || !name) {
      alert('Please enter a course code and name.');
      return;
    }

    if (courses.some(c => c.code.trim().toUpperCase() === code)) {
      alert('A course with that code already exists.');
      return;
    }

    if (startDate && endDate) {
      const s = new Date(startDate);
      const e = new Date(endDate);
      if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime()) && s.getTime() > e.getTime()) {
        alert('Start date must be before end date.');
        return;
      }
    }

    const next: Course = {
      id: uid('crs'),
      code,
      name,
      instructor: instructor || '—',
      color: draft.color,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    };
    onUpdate([...courses, next]);
    toast('Course created');
    closeCreate();
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Your Courses</h2>
          <p className="text-slate-500">Manage your subjects and instructors</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-all"
        >
          <Plus className="w-4 h-4" />
          Add Course
        </button>
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={closeCreate}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-100">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">New course</div>
                <div className="text-lg font-bold text-slate-800">Add a course</div>
                <div className="text-xs text-slate-500 mt-1">Create your class and start adding assignments + events.</div>
              </div>
              <button
                type="button"
                onClick={closeCreate}
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
                    value={draft.code}
                    onChange={e => setDraft(prev => ({ ...prev, code: e.target.value }))}
                    placeholder="e.g. CS101"
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Instructor</label>
                  <input
                    value={draft.instructor}
                    onChange={e => setDraft(prev => ({ ...prev, instructor: e.target.value }))}
                    placeholder="e.g. Dr. Smith"
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Course name</label>
                  <input
                    value={draft.name}
                    onChange={e => setDraft(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. Computer Science 101"
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                <div>
                  <DatePicker
                    label="Start date"
                    value={draft.startDate}
                    onChange={(next) => {
                      setDraft(prev => {
                        const endTooEarly = prev.endDate && next && prev.endDate < next;
                        return { ...prev, startDate: next, endDate: endTooEarly ? '' : prev.endDate };
                      });
                    }}
                    placeholder="Select start"
                    max={draft.endDate || undefined}
                  />
                </div>
                <div>
                  <DatePicker
                    label="End date"
                    value={draft.endDate}
                    onChange={(next) => setDraft(prev => ({ ...prev, endDate: next }))}
                    placeholder="Select end"
                    min={draft.startDate || undefined}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Color</label>
                <div className="flex flex-wrap gap-2">
                  {colorOptions.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setDraft(prev => ({ ...prev, color: c }))}
                      className={`h-9 w-9 rounded-xl ${c} border transition-all ${draft.color === c ? 'ring-2 ring-indigo-500/30 border-white' : 'border-white/0 hover:ring-2 hover:ring-slate-300/40'}`}
                      title={c}
                      aria-pressed={draft.color === c}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-white flex justify-end gap-2">
              <button
                type="button"
                onClick={closeCreate}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={createCourse}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors"
              >
                Create course
              </button>
            </div>
          </div>
        </div>
      )}

      {courses.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm py-20 px-6 text-center">
          <h3 className="text-lg font-semibold text-slate-800">No courses yet</h3>
          <p className="text-sm text-slate-500 mt-2">Click "Add Course" to create your first course.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {courses.map(course => (
            <button
              key={course.id}
              type="button"
              onClick={() => onOpenCourse?.(course.id)}
              className="text-left bg-white rounded-2xl overflow-hidden border border-slate-200 group hover:border-indigo-300 transition-all shadow-sm"
            >
              <div className={`h-24 ${course.color} flex items-end p-6`}>
                <div className="bg-white/20 backdrop-blur-md rounded-lg px-3 py-1 text-white text-xs font-bold uppercase">
                  {course.code}
                </div>
              </div>
              <div className="p-6">
                <h3 className="text-lg font-bold text-slate-800 mb-4">{course.name}</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-slate-600">
                    <User className="w-4 h-4" />
                    <span className="text-sm">{course.instructor}</span>
                  </div>
                  {(course.startDate || course.endDate) && (
                    <div className="text-xs text-slate-500">
                      {course.startDate ? new Date(course.startDate).toLocaleDateString() : '—'}
                      {' – '}
                      {course.endDate ? new Date(course.endDate).toLocaleDateString() : '—'}
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-slate-600">
                    <Book className="w-4 h-4" />
                    <span className="text-sm">4 assignments pending</span>
                  </div>
                </div>
                <div className="mt-6 flex gap-2">
                  <span className="flex-1 py-2 text-sm font-medium text-slate-600 bg-slate-50 rounded-xl group-hover:bg-slate-100 text-center">Details</span>
                  <span className="flex-1 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-xl group-hover:bg-indigo-100 text-center">Dashboard</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default CourseManager;
