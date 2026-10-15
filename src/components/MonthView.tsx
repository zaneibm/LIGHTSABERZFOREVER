import React from 'react';
import { CalendarEvent } from '../types/calendar';
import {
  getMonthDays,
  formatTime12h,
  getCategoryBadge,
  formatDate,
} from '../utils/dateUtils';
import { Sparkles, Plus } from 'lucide-react';

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

  const eventsByDate = React.useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach((evt) => {
      const list = map.get(evt.startDate) || [];
      list.push(evt);
      map.set(evt.startDate, list);
    });
    map.forEach((list) => list.sort((a, b) => a.startTime.localeCompare(b.startTime)));
    return map;
  }, [events]);

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      {/* Day-of-week header */}
      <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50 text-xs font-semibold text-gray-500 text-center py-2.5">
        {weekDayNames.map((dayName, idx) => (
          <div key={dayName} className={idx === 0 || idx === 6 ? 'text-gray-400' : ''}>
            {dayName}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 flex-1 auto-rows-fr bg-white divide-x divide-y divide-gray-100 overflow-y-auto">
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
                    ? 'bg-indigo-50/60 hover:bg-indigo-50'
                    : 'bg-white hover:bg-gray-50'
                  : 'bg-gray-50/60 hover:bg-gray-50'
              }`}
            >
              {/* Day number */}
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`text-xs font-semibold rounded-full w-6 h-6 flex items-center justify-center transition ${
                    isToday
                      ? 'bg-gray-900 text-white font-bold ring-2 ring-gray-200'
                      : dayItem.isCurrentMonth
                      ? 'text-gray-700 group-hover:text-gray-900'
                      : 'text-gray-300'
                  }`}
                >
                  {dayItem.dayNumber}
                </span>

                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onQuickAdd(dayItem.dateStr); }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition"
                  title={`Add event on ${dayItem.dateStr}`}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Events */}
              <div className="flex-1 space-y-1 overflow-y-auto max-h-[110px] pr-0.5 custom-scrollbar">
                {dayEvents.slice(0, 4).map((evt) => {
                  const badge = getCategoryBadge(evt.category);
                  return (
                    <div
                      key={evt.id}
                      onClick={(e) => { e.stopPropagation(); onSelectEvent(evt); }}
                      className={`text-[11px] leading-tight px-1.5 py-1 rounded-md border flex items-center gap-1.5 transition truncate ${badge.bg} ${badge.border} hover:shadow-sm cursor-pointer`}
                      title={`${evt.title} (${formatTime12h(evt.startTime)} - ${formatTime12h(evt.endTime)})`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${badge.dot}`} />
                      <span className="font-semibold text-gray-500 text-[10px] flex-shrink-0">
                        {formatTime12h(evt.startTime)}
                      </span>
                      <span className={`truncate font-medium ${badge.text}`}>
                        {evt.title}
                      </span>
                      {evt.createdByAi && (
                        <Sparkles className="w-2.5 h-2.5 text-indigo-400 ml-auto flex-shrink-0" />
                      )}
                    </div>
                  );
                })}

                {dayEvents.length > 4 && (
                  <div className="text-[10px] font-semibold text-gray-400 hover:text-indigo-500 px-1 py-0.5">
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
