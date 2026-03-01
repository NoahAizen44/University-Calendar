import React, { useState } from 'react';
import { Bell, Save, Shield, SlidersHorizontal } from 'lucide-react';

const SettingsPage: React.FC = () => {
  const [autoSave, setAutoSave] = useState(true);
  const [calendarWeekStartsMonday, setCalendarWeekStartsMonday] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [reminderMinutes, setReminderMinutes] = useState('30');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Settings</h2>
        <p className="text-slate-500">Customize how your planner behaves.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
        <div className="flex items-center gap-2 text-slate-800 font-semibold">
          <SlidersHorizontal className="w-4 h-4" />
          App preferences
        </div>

        <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
          <div>
            <div className="text-sm font-medium text-slate-800">Auto-save changes</div>
            <div className="text-xs text-slate-500">Keep planner data saved as you edit.</div>
          </div>
          <button
            type="button"
            onClick={() => setAutoSave(v => !v)}
            className={`w-12 h-7 rounded-full transition-colors ${autoSave ? 'bg-indigo-600' : 'bg-slate-300'}`}
          >
            <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${autoSave ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
          <div>
            <div className="text-sm font-medium text-slate-800">Week starts on Monday</div>
            <div className="text-xs text-slate-500">Use Monday as the first day in calendar views.</div>
          </div>
          <button
            type="button"
            onClick={() => setCalendarWeekStartsMonday(v => !v)}
            className={`w-12 h-7 rounded-full transition-colors ${calendarWeekStartsMonday ? 'bg-indigo-600' : 'bg-slate-300'}`}
          >
            <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${calendarWeekStartsMonday ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
        <div className="flex items-center gap-2 text-slate-800 font-semibold">
          <Bell className="w-4 h-4" />
          Reminders
        </div>

        <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
          <div>
            <div className="text-sm font-medium text-slate-800">Notifications</div>
            <div className="text-xs text-slate-500">Allow assignment and event reminders.</div>
          </div>
          <button
            type="button"
            onClick={() => setNotificationsEnabled(v => !v)}
            className={`w-12 h-7 rounded-full transition-colors ${notificationsEnabled ? 'bg-indigo-600' : 'bg-slate-300'}`}
          >
            <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${notificationsEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Default reminder</label>
          <select
            value={reminderMinutes}
            onChange={e => setReminderMinutes(e.target.value)}
            className="w-full max-w-xs px-4 py-2 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          >
            <option value="5">5 minutes before</option>
            <option value="15">15 minutes before</option>
            <option value="30">30 minutes before</option>
            <option value="60">1 hour before</option>
            <option value="1440">1 day before</option>
          </select>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-700 text-sm">
          <Shield className="w-4 h-4" />
          Local privacy mode: your data stays in browser storage for now.
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-all"
        >
          <Save className="w-4 h-4" />
          Save settings
        </button>
      </div>
    </div>
  );
};

export default SettingsPage;
