import React from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  Sparkles,
  Bot,
  RotateCcw,
  CheckCircle2
} from 'lucide-react';
import { CalendarViewMode } from '../types/calendar';

interface HeaderProps {
  currentDate: Date;
  viewMode: CalendarViewMode;
  onViewModeChange: (mode: CalendarViewMode) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onNewEvent: () => void;
  isAiOpen: boolean;
  onToggleAi: () => void;
  onResetData: () => void;
  totalEventsCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  currentDate,
  viewMode,
  onViewModeChange,
  onPrev,
  onNext,
  onToday,
  onNewEvent,
  isAiOpen,
  onToggleAi,
  onResetData,
  totalEventsCount,
}) => {
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const currentMonthStr = `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;

  return (
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-30 px-4 py-3 sm:px-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        {/* Brand & Date Navigation */}
        <div className="flex items-center justify-between md:justify-start gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white font-bold ring-1 ring-white/20">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-lg tracking-tight text-white">Chronos</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-gradient-to-r from-indigo-500/20 to-purple-500/20 text-indigo-300 border border-indigo-500/30 font-medium flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-indigo-400 animate-pulse" />
                  Gemini AI
                </span>
              </div>
              <p className="text-xs text-slate-400">Intelligent Scheduling Prototype</p>
            </div>
          </div>

          <div className="h-6 w-px bg-slate-800 hidden md:block" />

          {/* Date Picker Controls */}
          <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60 shadow-inner">
            <button
              onClick={onToday}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg text-slate-200 hover:text-white hover:bg-slate-700 transition"
              title="Jump to today (Oct 13, 2026)"
            >
              Today
            </button>
            <div className="flex items-center">
              <button
                onClick={onPrev}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/80 transition"
                aria-label="Previous"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={onNext}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/80 transition"
                aria-label="Next"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <span className="text-sm font-semibold text-slate-200 px-2 min-w-[130px] text-center">
              {currentMonthStr}
            </span>
          </div>
        </div>

        {/* View Mode & Actions */}
        <div className="flex items-center justify-between md:justify-end gap-2.5">
          {/* View Mode Segmented Controls */}
          <div className="flex items-center bg-slate-800/80 p-1 rounded-xl border border-slate-700/60 text-xs font-medium">
            {(['month', 'week', 'day', 'agenda'] as CalendarViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => onViewModeChange(mode)}
                className={`px-3 py-1.5 rounded-lg capitalize transition-all ${
                  viewMode === mode
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {/* New Event Button */}
            <button
              onClick={onNewEvent}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 transition shadow-sm"
            >
              <Plus className="w-4 h-4 text-indigo-400" />
              <span className="hidden sm:inline">Event</span>
            </button>

            {/* Toggle AI Chat Assistant Button */}
            <button
              onClick={onToggleAi}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-xl transition shadow-md ${
                isAiOpen
                  ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-indigo-500/25 ring-2 ring-indigo-400/30'
                  : 'bg-slate-800 text-indigo-300 hover:text-white hover:bg-slate-700 border border-indigo-500/30'
              }`}
            >
              <Bot className="w-4 h-4 text-indigo-300" />
              <span>AI Assistant</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </button>

            {/* Reset data helper */}
            <button
              onClick={onResetData}
              title="Reset to default prototype schedule"
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
