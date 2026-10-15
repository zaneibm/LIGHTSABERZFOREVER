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
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  return (
    <div className="flex flex-col h-full bg-white overflow-y-auto p-4 sm:p-6 max-w-4xl mx-auto w-full">
      {/* Day header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 mb-5 border-b border-gray-200 gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
            {dayOfWeekName}
          </h2>
          <p className="text-xs sm:text-sm text-gray-400 mt-1 flex items-center gap-2">
            <span>{dayEvents.length} scheduled {dayEvents.length === 1 ? 'event' : 'events'}</span>
            <span className="w-1 h-1 rounded-full bg-gray-300" />
            <span className="text-emerald-500 font-medium">Free slots available</span>
          </p>
        </div>

        <button
          onClick={() => onQuickAdd(dateStr)}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gray-900 hover:bg-gray-700 text-white font-semibold text-xs shadow-sm transition self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Add Event
        </button>
      </div>

      {dayEvents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-gray-200 rounded-2xl bg-gray-50">
          <div className="w-12 h-12 rounded-2xl bg-white border border-gray-200 flex items-center justify-center mb-3">
            <Coffee className="w-6 h-6 text-amber-400" />
          </div>
          <h3 className="text-base font-semibold text-gray-700">Nothing scheduled</h3>
          <p className="text-xs text-gray-400 max-w-sm mt-1">
            Your day is clear. Add an event or ask the AI assistant.
          </p>
          <button
            onClick={() => onQuickAdd(dateStr, '09:00')}
            className="mt-4 px-4 py-1.5 rounded-xl bg-white hover:bg-gray-50 text-indigo-500 text-xs font-semibold border border-gray-200 transition"
          >
            + Create Morning Event
          </button>
        </div>
      ) : (
        <div className="space-y-3.5">
          {dayEvents.map((evt, idx) => {
            const badge = getCategoryBadge(evt.category);
            const prevEvt = dayEvents[idx - 1];
            let gapMinutes = 0;
            if (prevEvt) {
              gapMinutes = timeToMinutes(evt.startTime) - timeToMinutes(prevEvt.endTime);
            }

            return (
              <React.Fragment key={evt.id}>
                {gapMinutes >= 30 && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 border border-dashed border-gray-200 text-[11px] text-gray-400">
                    <Coffee className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                    <span>
                      {Math.floor(gapMinutes / 60) > 0 ? `${Math.floor(gapMinutes / 60)}h ` : ''}
                      {gapMinutes % 60 > 0 ? `${gapMinutes % 60}m ` : ''}free ({formatTime12h(prevEvt.endTime)} – {formatTime12h(evt.startTime)})
                    </span>
                    <button
                      onClick={() => onQuickAdd(dateStr, prevEvt.endTime)}
                      className="ml-auto text-indigo-500 hover:text-indigo-700 font-semibold"
                    >
                      + Book
                    </button>
                  </div>
                )}

                <div
                  onClick={() => onSelectEvent(evt)}
                  className={`group relative p-4 rounded-2xl transition-all hover:shadow-md cursor-pointer ${badge.bg}`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${badge.bg} ${badge.text} border ${badge.border}`}>
                          {badge.label}
                        </span>
                        {evt.createdByAi && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-500 border border-indigo-200">
                            <Sparkles className="w-3 h-3" />
                            AI
                          </span>
                        )}
                        <span className="text-xs font-semibold text-gray-500 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-gray-400" />
                          {formatTime12h(evt.startTime)} – {formatTime12h(evt.endTime)}
                        </span>
                      </div>

                      <h3 className="text-base font-bold text-gray-900">
                        {evt.title}
                      </h3>

                      {evt.description && (
                        <p className="text-xs text-gray-500 line-clamp-2">
                          {evt.description}
                        </p>
                      )}

                      <div className="flex items-center gap-3 pt-1 text-xs text-gray-400 flex-wrap">
                        {evt.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5" />
                            {evt.location}
                          </span>
                        )}
                        {evt.attendees && evt.attendees.length > 0 && (
                          <span className="flex items-center gap-1">
                            <Users className="w-3.5 h-3.5" />
                            {evt.attendees.join(', ')}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={(e) => { e.stopPropagation(); onSelectEvent(evt); }}
                      className="px-3 py-1.5 rounded-lg bg-white hover:bg-gray-50 text-xs font-semibold text-gray-600 hover:text-gray-900 border border-gray-200 transition"
                    >
                      Edit
                    </button>
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
