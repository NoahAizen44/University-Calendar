
import React, { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { Assignment, Course, StudySession } from '../types';
import { generateStudyPlan } from '../services/geminiService';

interface AIPlannerProps {
  assignments: Assignment[];
  courses: Course[];
  onScheduleGenerated: (sessions: StudySession[]) => void;
}

const AIPlanner: React.FC<AIPlannerProps> = ({ assignments, courses, onScheduleGenerated }) => {
  const [loading, setLoading] = useState(false);
  const [hours, setHours] = useState(4);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const sessions = await generateStudyPlan(assignments, courses, hours);
      onScheduleGenerated(sessions);
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Something went wrong with the AI planner. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={1}
        max={12}
        value={hours}
        onChange={e => setHours(Math.max(1, Math.min(12, Number(e.target.value) || 1)))}
        className="w-16 px-2 py-2 rounded-xl border border-slate-200 text-sm"
        title="Available study hours today"
      />
      <button 
        onClick={handleGenerate}
        disabled={loading || assignments.filter(a => !a.completed).length === 0}
        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-sm ${
          loading 
            ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
            : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-indigo-200'
        }`}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Sparkles className="w-4 h-4" />
        )}
        {loading ? 'Thinking...' : 'AI Plan'}
      </button>
    </div>
  );
};

export default AIPlanner;
