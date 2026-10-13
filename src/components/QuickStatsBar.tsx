import React from 'react';
import { CalendarEvent } from '../types/calendar';
import {
  formatDate,
  formatTime12h,
  minutesSinceMidnight,
  timeToMinutes,
} from '../utils/dateUtils';
import { Clock, Calendar, CheckCircle, Sparkles, AlertCircle } from 'lucide-react';

interface QuickStatsBarProps {
  events: CalendarEvent[];
  now: Date;
  onOpenAiPrompt: (prompt: string) => void;
}

export const QuickStatsBar: React.FC<QuickStatsBarProps> = ({
  events,
  now,
  onOpenAiPrompt,
}) => {
  const todayStr = formatDate(now);
  const todayEvents = events.filter((e) => e.startDate === todayStr);

  // Find next upcoming meeting after the current time
  const currentMinutes = minutesSinceMidnight(now);
  const nextMeeting = todayEvents
    .filter((e) => timeToMinutes(e.startTime) >= currentMinutes)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))[0];

  return (
    <div className="bg-slate-900/60 border-b border-slate-800/80 px-4 py-2 sm:px-6 flex flex-col md:flex-row md:items-center justify-between gap-2.5 text-xs">
      <div className="flex items-center gap-3 overflow-x-auto pb-1 md:pb-0 custom-scrollbar">
        {/* Today status badge */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 font-semibold whitespace-nowrap">
          <Calendar className="w-3.5 h-3.5 text-indigo-400" />
          <span>
            {now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}: {todayEvents.length}{' '}
            {todayEvents.length === 1 ? 'Event' : 'Events'}
          </span>
        </div>

        {/* Next meeting banner */}
        {nextMeeting ? (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700/60 text-slate-300 whitespace-nowrap">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>Next:</span>
            <strong className="text-white">{nextMeeting.title}</strong>
            <span className="text-slate-400">({formatTime12h(nextMeeting.startTime)})</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-slate-400">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span>{todayEvents.length === 0 ? 'No meetings today' : 'All meetings completed for today'}</span>
          </div>
        )}
      </div>

      {/* Fast AI Assist Action */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => onOpenAiPrompt('What meetings do I have today?')}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-indigo-300 transition"
        >
          <Sparkles className="w-3 h-3 text-indigo-400" />
          Ask "What meetings do I have today?"
        </button>
      </div>
    </div>
  );
};
