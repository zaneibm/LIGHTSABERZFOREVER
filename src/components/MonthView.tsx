import React from 'react';
import { CalendarEvent } from '../types/calendar';
import {
  getMonthDays,
  formatTime12h,
  getCategoryBadge,
  formatDate,
} from '../utils/dateUtils';
import { Sparkles, Plus, Clock } from 'lucide-react';

interface MonthViewProps {
  currentDate: Date;
  now: Date;
  events: CalendarEvent[];
  onSelectEvent: (event: CalendarEvent) => void;
  onSelectDate: (dateStr: string) => void;
  onQuickAdd: (dateStr: string) => void;
}

export const MonthView: React.FC<MonthViewProps> = ({
  currentDate,
  now,
  events,
  onSelectEvent,
  onSelectDate,
  onQuickAdd,
}) => {
  const todayStr = formatDate(now);
  const days = getMonthDays(currentDate.getFullYear(), currentDate.getMonth());
  const weekDayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Map events by dateStr
  const eventsByDate = React.useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach((evt) => {
      const list = map.get(evt.startDate) || [];
      list.push(evt);
      map.set(evt.startDate, list);
    });
    // Sort events in each date by startTime
    map.forEach((list) => {
      list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    });
    return map;
  }, [events]);

  return (
    <div className="flex flex-col h-full bg-slate-900 overflow-hidden">
      {/* Days of week header */}
      <div className="grid grid-cols-7 border-b border-slate-800 bg-slate-900/90 text-xs font-semibold text-slate-400 text-center py-2.5">
        {weekDayNames.map((dayName, idx) => (
          <div
            key={dayName}
            className={`${idx === 0 || idx === 6 ? 'text-slate-500' : 'text-slate-300'}`}
          >
            {dayName}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 flex-1 auto-rows-fr bg-slate-900 divide-x divide-y divide-slate-800/80 overflow-y-auto">
        {days.map((dayItem) => {
          const isToday = dayItem.dateStr === todayStr;
          const dayEvents = eventsByDate.get(dayItem.dateStr) || [];

          return (
            <div
              key={dayItem.dateStr}
              onClick={() => onSelectDate(dayItem.dateStr)}
              className={`group relative min-h-[110px] p-2 flex flex-col transition-colors cursor-pointer ${
                dayItem.isCurrentMonth
                  ? isToday
                    ? 'bg-indigo-950/20 hover:bg-indigo-950/30'
                    : 'bg-slate-900/60 hover:bg-slate-800/40'
                  : 'bg-slate-950/40 text-slate-600 hover:bg-slate-900/40'
              }`}
            >
              {/* Day header row */}
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`text-xs font-semibold rounded-full w-6 h-6 flex items-center justify-center transition ${
                    isToday
                      ? 'bg-indigo-600 text-white font-bold ring-2 ring-indigo-400 shadow-md shadow-indigo-600/30'
                      : dayItem.isCurrentMonth
                      ? 'text-slate-200 group-hover:text-white'
                      : 'text-slate-500'
                  }`}
                >
                  {dayItem.dayNumber}
                </span>

                {/* Quick Add button on hover */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onQuickAdd(dayItem.dateStr);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-700/80 transition"
                  title={`Add event on ${dayItem.dateStr}`}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Events list */}
              <div className="flex-1 space-y-1 overflow-y-auto max-h-[110px] pr-0.5 custom-scrollbar">
                {dayEvents.slice(0, 4).map((evt) => {
                  const badge = getCategoryBadge(evt.category);
                  return (
                    <div
                      key={evt.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectEvent(evt);
                      }}
                      className={`text-[11px] leading-tight px-1.5 py-1 rounded-md border flex items-center gap-1.5 transition truncate shadow-xs ${badge.bg} ${badge.border} hover:scale-[1.02] hover:shadow-md cursor-pointer`}
                      title={`${evt.title} (${formatTime12h(evt.startTime)} - ${formatTime12h(evt.endTime)})`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${badge.dot}`} />
                      <span className="font-semibold text-slate-300 text-[10px] flex-shrink-0">
                        {formatTime12h(evt.startTime)}
                      </span>
                      <span className={`truncate font-medium ${badge.text}`}>
                        {evt.title}
                      </span>
                      {evt.createdByAi && (
                        <Sparkles className="w-2.5 h-2.5 text-indigo-400 ml-auto flex-shrink-0 animate-pulse" />
                      )}
                    </div>
                  );
                })}

                {dayEvents.length > 4 && (
                  <div className="text-[10px] font-semibold text-slate-400 hover:text-indigo-300 px-1 py-0.5">
                    +{dayEvents.length - 4} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
