import React from 'react';
import { CalendarEvent } from '../types/calendar';
import {
  formatDate,
  formatTime12h,
  getCategoryBadge,
  parseDate,
  timeToMinutes,
} from '../utils/dateUtils';
import {
  Clock,
  MapPin,
  Users,
  Sparkles,
  Plus,
  CalendarCheck,
  Coffee,
} from 'lucide-react';

interface DayViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  onSelectEvent: (event: CalendarEvent) => void;
  onQuickAdd: (dateStr: string, timeStr?: string) => void;
}

export const DayView: React.FC<DayViewProps> = ({
  currentDate,
  events,
  onSelectEvent,
  onQuickAdd,
}) => {
  const dateStr = formatDate(currentDate);

  const dayEvents = React.useMemo(() => {
    return events
      .filter((e) => e.startDate === dateStr)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [events, dateStr]);

  const dayOfWeekName = currentDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="flex flex-col h-full bg-slate-900 overflow-y-auto p-4 sm:p-6 max-w-4xl mx-auto w-full">
      {/* Day summary header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 mb-5 border-b border-slate-800 gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            {dayOfWeekName}
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 flex items-center gap-2">
            <span>{dayEvents.length} scheduled {dayEvents.length === 1 ? 'event' : 'events'}</span>
            <span className="w-1 h-1 rounded-full bg-slate-600" />
            <span className="text-emerald-400 font-medium">Free slots available</span>
          </p>
        </div>

        <button
          onClick={() => onQuickAdd(dateStr)}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-lg shadow-indigo-600/25 transition self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Add Event for Today
        </button>
      </div>

      {/* Events timeline list */}
      {dayEvents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/40">
          <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-400 mb-3">
            <Coffee className="w-6 h-6 text-amber-400" />
          </div>
          <h3 className="text-base font-semibold text-slate-200">No events scheduled for this day</h3>
          <p className="text-xs text-slate-400 max-w-sm mt-1">
            Your schedule is clear! You can add an event manually or ask the AI assistant: "Schedule a call with Rob at 4:30".
          </p>
          <button
            onClick={() => onQuickAdd(dateStr, '09:00')}
            className="mt-4 px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-400 text-xs font-semibold border border-slate-700 transition"
          >
            + Create Morning Event
          </button>
        </div>
      ) : (
        <div className="space-y-3.5">
          {dayEvents.map((evt, idx) => {
            const badge = getCategoryBadge(evt.category);
            const prevEvt = dayEvents[idx - 1];

            // Calculate free gap between previous and current event
            let gapMinutes = 0;
            if (prevEvt) {
              gapMinutes = timeToMinutes(evt.startTime) - timeToMinutes(prevEvt.endTime);
            }

            return (
              <React.Fragment key={evt.id}>
                {/* Gap banner if > 30 mins free */}
                {gapMinutes >= 30 && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/40 border border-dashed border-slate-800 text-[11px] text-slate-400">
                    <Coffee className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                    <span>
                      {Math.floor(gapMinutes / 60) > 0 ? `${Math.floor(gapMinutes / 60)}h ` : ''}
                      {gapMinutes % 60 > 0 ? `${gapMinutes % 60}m ` : ''}free block ({formatTime12h(prevEvt.endTime)} – {formatTime12h(evt.startTime)})
                    </span>
                    <button
                      onClick={() => onQuickAdd(dateStr, prevEvt.endTime)}
                      className="ml-auto text-indigo-400 hover:text-indigo-300 font-semibold"
                    >
                      + Book slot
                    </button>
                  </div>
                )}

                {/* Event Card */}
                <div
                  onClick={() => onSelectEvent(evt)}
                  className={`group relative p-4 rounded-2xl border transition-all hover:scale-[1.01] hover:shadow-xl cursor-pointer ${badge.bg} ${badge.border}`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${badge.bg} ${badge.text} border ${badge.border}`}>
                          {badge.label}
                        </span>
                        {evt.createdByAi && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            <Sparkles className="w-3 h-3 text-indigo-400" />
                            Added via AI
                          </span>
                        )}
                        <span className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          {formatTime12h(evt.startTime)} – {formatTime12h(evt.endTime)}
                        </span>
                      </div>

                      <h3 className="text-base font-bold text-white group-hover:text-indigo-200 transition">
                        {evt.title}
                      </h3>

                      {evt.description && (
                        <p className="text-xs text-slate-300 line-clamp-2">
                          {evt.description}
                        </p>
                      )}

                      <div className="flex items-center gap-3 pt-1 text-xs text-slate-400 flex-wrap">
                        {evt.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-slate-400" />
                            {evt.location}
                          </span>
                        )}
                        {evt.attendees && evt.attendees.length > 0 && (
                          <span className="flex items-center gap-1">
                            <Users className="w-3.5 h-3.5 text-slate-400" />
                            {evt.attendees.join(', ')}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 sm:self-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectEvent(evt);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-xs font-semibold text-slate-200 hover:text-white border border-slate-700 transition"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
};
