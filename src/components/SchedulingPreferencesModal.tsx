import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { SchedulingPreferences } from '../types/calendar';

interface SchedulingPreferencesModalProps {
  isOpen: boolean;
  preferences: SchedulingPreferences;
  onClose: () => void;
  onSave: (preferences: SchedulingPreferences) => void;
}

const weekdays = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' },
];

export const SchedulingPreferencesModal: React.FC<SchedulingPreferencesModalProps> = ({
  isOpen,
  preferences,
  onClose,
  onSave,
}) => {
  const [draft, setDraft] = useState(preferences);

  useEffect(() => {
    setDraft(preferences);
  }, [preferences, isOpen]);

  if (!isOpen) return null;

  const toggleWorkday = (day: number) => {
    setDraft((current) => ({
      ...current,
      workDays: current.workDays.includes(day)
        ? current.workDays.filter((value) => value !== day)
        : [...current.workDays, day].sort((a, b) => a - b),
    }));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (draft.workDays.length === 0 || draft.workdayStart >= draft.workdayEnd) return;
    onSave(draft);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-800 p-4">
          <div>
            <h2 className="text-sm font-bold text-white">Scheduling preferences</h2>
            <p className="mt-1 text-xs text-slate-400">Used when Chronos suggests open times.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close preferences" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <fieldset>
            <legend className="mb-2 text-xs font-semibold text-slate-300">Working days</legend>
            <div className="flex flex-wrap gap-2">
              {weekdays.map((day) => (
                <label key={day.value} className="cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.workDays.includes(day.value)}
                    onChange={() => toggleWorkday(day.value)}
                    className="peer sr-only"
                  />
                  <span className="block rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 peer-checked:border-indigo-400 peer-checked:bg-indigo-500/20 peer-checked:text-indigo-200">
                    {day.label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <span className="mb-2 block text-xs font-semibold text-slate-300">Working hours</span>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-[11px] text-slate-400">
                Start
                <input
                  type="time"
                  value={draft.workdayStart}
                  onChange={(event) => setDraft((current) => ({ ...current, workdayStart: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-sm text-white"
                />
              </label>
              <label className="text-[11px] text-slate-400">
                End
                <input
                  type="time"
                  value={draft.workdayEnd}
                  onChange={(event) => setDraft((current) => ({ ...current, workdayEnd: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-2 text-sm text-white"
                />
              </label>
            </div>
            {(draft.workDays.length === 0 || draft.workdayStart >= draft.workdayEnd) && (
              <p className="mt-2 text-xs text-rose-300">Choose at least one workday and a valid working-hours range.</p>
            )}
          </div>

          <label className="block text-xs font-semibold text-slate-300">
            Preferred time of day
            <select
              value={draft.preferredTimeOfDay}
              onChange={(event) => setDraft((current) => ({ ...current, preferredTimeOfDay: event.target.value as SchedulingPreferences['preferredTimeOfDay'] }))}
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
            >
              <option value="any">Any time</option>
              <option value="morning">Morning (before noon)</option>
              <option value="afternoon">Afternoon (noon or later)</option>
            </select>
          </label>

          <label className="block text-xs font-semibold text-slate-300">
            Buffer between meetings
            <select
              value={draft.bufferMinutes}
              onChange={(event) => setDraft((current) => ({ ...current, bufferMinutes: Number(event.target.value) }))}
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
            >
              <option value="0">No extra buffer</option>
              <option value="10">10 minutes</option>
              <option value="15">15 minutes</option>
              <option value="30">30 minutes (travel or break)</option>
              <option value="45">45 minutes (travel or break)</option>
            </select>
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-800 p-4">
          <button type="button" onClick={onClose} className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700">Cancel</button>
          <button
            type="submit"
            disabled={draft.workDays.length === 0 || draft.workdayStart >= draft.workdayEnd}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save preferences
          </button>
        </div>
      </form>
    </div>
  );
};
