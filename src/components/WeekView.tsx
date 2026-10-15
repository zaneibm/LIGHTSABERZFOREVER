import React, { useEffect, useRef } from 'react';
import { CalendarEvent } from '../types/calendar';
import {
  getWeekDays,
  formatTime12h,
  getCategoryBadge,
  timeToMinutes,
  formatDate,
  minutesSinceMidnight,
} from '../utils/dateUtils';
import { Sparkles, MapPin, Users } from 'lucide-react';

interface WeekViewProps {
  currentDate: Date;
  now: Date;
  events: CalendarEvent[];
  onSelectEvent: (event: CalendarEvent) => void;
  onSelectSlot: (dateStr: string, timeStr: string) => void;
}

const START_HOUR = 0;
const END_HOUR = 24;
const TOTAL_HOURS = END_HOUR - START_HOUR;
const HOUR_HEIGHT = 64;

export const WeekView: React.FC<WeekViewProps> = ({
  currentDate,
  now,
  events,
  onSelectEvent,
  onSelectSlot,
}) => {
  const weekDays = getWeekDays(currentDate, formatDate(now));
  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => START_HOUR + i);

  const eventsByDate = React.useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach((evt) => {
      const list = map.get(evt.startDate) || [];
      list.push(evt);
      map.set(evt.startDate, list);
    });
    return map;
  }, [events]);

  const currentMinutesFromStart = minutesSinceMidnight(now) - START_HOUR * 60;
  const currentTimeTop = (currentMinutesFromStart / 60) * HOUR_HEIGHT;

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) {
      const offset = currentTimeTop - scrollRef.current.clientHeight / 2;
      scrollRef.current.scrollTop = Math.max(0, offset);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      {/* Week header */}
      <div className="grid grid-cols-[64px_repeat(7,1fr)] border-b border-gray-200 bg-white sticky top-0 z-20">
        <div className="border-r border-gray-200" />
        {weekDays.map((d) => (
          <div
            key={d.dateStr}
            className={`py-2 px-1 text-center border-r border-gray-200 transition-colors ${
              d.isToday ? 'bg-indigo-50' : ''
            }`}
          >
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              {d.dayName}
            </div>
            <div
              className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold mt-0.5 ${
                d.isToday
                  ? 'bg-gray-900 text-white shadow-sm ring-2 ring-gray-200'
                  : 'text-gray-700'
              }`}
            >
              {d.dayNumber}
            </div>
          </div>
        ))}
      </div>

      {/* Grid body */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto relative">
        <div
          className="grid grid-cols-[64px_repeat(7,1fr)] relative"
          style={{ height: `${TOTAL_HOURS * HOUR_HEIGHT}px` }}
        >
          {/* Time gutter */}
          <div className="border-r border-gray-200 bg-gray-50 select-none relative">
            {hours.map((hour) => (
              <div
                key={hour}
                style={{ top: `${(hour - START_HOUR) * HOUR_HEIGHT}px` }}
                className="absolute right-0 pr-2.5 text-[11px] font-medium text-gray-400 -translate-y-1/2 pointer-events-none"
              >
                {hour === 0 ? '' : formatTime12h(`${String(hour).padStart(2, '0')}:00`)}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDays.map((d) => {
            const dayEvents = eventsByDate.get(d.dateStr) || [];

            return (
              <div
                key={d.dateStr}
                className={`relative border-r border-gray-200 ${
                  d.isToday ? 'bg-indigo-50/40' : 'bg-white'
                }`}
              >
                {/* Hour rows */}
                {hours.map((hour) => {
                  const hourTimeStr = `${String(hour).padStart(2, '0')}:00`;
                  return (
                    <div
                      key={hour}
                      onClick={() => onSelectSlot(d.dateStr, hourTimeStr)}
                      style={{ height: `${HOUR_HEIGHT}px` }}
                      className="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                    />
                  );
                })}

                {/* Current time marker */}
                {d.isToday && currentTimeTop >= 0 && currentTimeTop <= TOTAL_HOURS * HOUR_HEIGHT && (
                  <div
                    className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
                    style={{ top: `${currentTimeTop}px` }}
                  >
                    <div className="w-2.5 h-2.5 rounded-full bg-rose-500 -ml-1 ring-2 ring-white" />
                    <div className="h-[2px] w-full bg-rose-500" />
                  </div>
                )}

                {/* Events */}
                {dayEvents.map((evt) => {
                  const startMins = timeToMinutes(evt.startTime);
                  const endMins = timeToMinutes(evt.endTime);
                  const offsetMins = startMins - START_HOUR * 60;
                  const durationMins = Math.max(endMins - startMins, 30);

                  const top = (offsetMins / 60) * HOUR_HEIGHT;
                  const height = (durationMins / 60) * HOUR_HEIGHT - 2;

                  if (top + height < 0 || top > TOTAL_HOURS * HOUR_HEIGHT) return null;

                  const badge = getCategoryBadge(evt.category);

                  return (
                    <div
                      key={evt.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectEvent(evt);
                      }}
                      style={{
                        top: `${Math.max(top, 0)}px`,
                        height: `${Math.max(height, 28)}px`,
                      }}
                      className={`absolute left-1 right-1 p-1.5 rounded-lg border text-xs overflow-hidden cursor-pointer shadow-sm transition-all hover:scale-[1.02] hover:z-30 hover:shadow-md ${badge.bg} ${badge.border} flex flex-col justify-between`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <div className="flex items-center gap-1 font-semibold truncate text-[11px] text-gray-800">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${badge.dot}`} />
                          <span className="truncate">{evt.title}</span>
                        </div>
                        {evt.createdByAi && (
                          <Sparkles className="w-3 h-3 text-indigo-400 flex-shrink-0" />
                        )}
                      </div>

                      <div className="text-[10px] text-gray-500 font-medium truncate">
                        {formatTime12h(evt.startTime)} – {formatTime12h(evt.endTime)}
                      </div>

                      {height > 44 && (
                        <div className="flex items-center gap-2 text-[10px] text-gray-400 truncate mt-0.5">
                          {evt.location && (
                            <span className="flex items-center gap-0.5 truncate">
                              <MapPin className="w-2.5 h-2.5 flex-shrink-0" />
                              <span className="truncate">{evt.location}</span>
                            </span>
                          )}
                          {evt.attendees && evt.attendees.length > 0 && (
                            <span className="flex items-center gap-0.5 truncate">
                              <Users className="w-2.5 h-2.5 flex-shrink-0" />
                              <span className="truncate">{evt.attendees[0]}</span>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
