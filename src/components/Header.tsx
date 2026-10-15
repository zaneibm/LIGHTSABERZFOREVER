import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Bot,
  RotateCcw,
} from 'lucide-react';
import { ChronosLogo } from './ChronosLogo';
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
}) => {
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const currentMonthStr = `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;

  return (
    <header className="border-b border-gray-200 bg-white sticky top-0 z-30 px-4 py-3 sm:px-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        {/* Brand & Date Navigation */}
        <div className="flex items-center justify-between md:justify-start gap-4">
          <div className="flex items-center gap-2.5">
            <ChronosLogo size={40} />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-lg tracking-tight text-gray-900">Daylie</span>
              </div>
            </div>
          </div>

          <div className="h-6 w-px bg-gray-200 hidden md:block" />

          {/* Date Picker Controls */}
          <div className="flex items-center gap-1.5 bg-gray-50 p-1 rounded-xl border border-gray-200">
            <button
              onClick={onToday}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg text-gray-600 hover:text-gray-900 hover:bg-white transition"
              title="Jump to today"
            >
              Today
            </button>
            <div className="flex items-center">
              <button
                onClick={onPrev}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white transition"
                aria-label="Previous"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={onNext}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white transition"
                aria-label="Next"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <span className="text-sm font-semibold text-gray-700 px-2 min-w-[130px] text-center">
              {currentMonthStr}
            </span>
          </div>
        </div>

        {/* View Mode & Actions */}
        <div className="flex items-center justify-between md:justify-end gap-2.5">
          {/* View Mode Segmented Controls */}
          <div className="flex items-center bg-gray-50 p-1 rounded-xl border border-gray-200 text-xs font-medium">
            {(['month', 'week', 'day', 'agenda'] as CalendarViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => onViewModeChange(mode)}
                className={`px-3 py-1.5 rounded-lg capitalize transition-all ${
                  viewMode === mode
                    ? 'bg-white text-gray-900 shadow-sm border border-gray-200 font-semibold'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-white/60'
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
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 hover:text-gray-900 border border-gray-200 transition"
            >
              <Plus className="w-4 h-4 text-indigo-500" />
              <span className="hidden sm:inline">Event</span>
            </button>

            {/* Toggle AI Chat */}
            <button
              onClick={onToggleAi}
              className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-xl transition shadow-sm ${
                isAiOpen
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
              }`}
            >
              <Bot className="w-4 h-4" />
              <span>AI Assistant</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
            </button>

            {/* Reset */}
            <button
              onClick={onResetData}
              title="Reset schedule"
              className="p-1.5 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 border border-gray-200 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
