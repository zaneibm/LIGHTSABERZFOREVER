import React from 'react';
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

const START_HOUR = 8; // 8:00 AM
const END_HOUR = 20; // 8:00 PM
const TOTAL_HOURS = END_HOUR - START_HOUR;
const HOUR_HEIGHT = 64; // px per hour

export const WeekView: React.FC<WeekViewProps> = ({
  currentDate,
  now,
  events,
  onSelectEvent,
  onSelectSlot,
}) => {
  const weekDays = getWeekDays(currentDate, formatDate(now));
  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => START_HOUR + i);

  // Group events by date
  const eventsByDate = React.useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    events.forEach((evt) => {
      const list = map.get(evt.startDate) || [];
      list.push(evt);
      map.set(evt.startDate, list);
    });
    return map;
  }, [events]);

  // Current time marker (real clock)
  const currentMinutesFromStart = minutesSinceMidnight(now) - START_HOUR * 60;
  const currentTimeTop = (currentMinutesFromStart / 60) * HOUR_HEIGHT;

  return (
    <div className="flex flex-col h-full bg-slate-900 overflow-hidden">
      {/* Week header: 7 columns */}
      <div className="grid grid-cols-[64px_repeat(7,1fr)] border-b border-slate-800 bg-slate-900/90 sticky top-0 z-20">
        <div className="border-r border-slate-800 py-3 text-center text-xs font-semibold text-slate-500">
          Time
        </div>
        {weekDays.map((d) => (
          <div
            key={d.dateStr}
            className={`py-2 px-1 text-center border-r border-slate-800/80 transition-colors ${
              d.isToday ? 'bg-indigo-950/30' : ''
            }`}
          >
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {d.dayName}
            </div>
            <div
              className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold mt-0.5 ${
                d.isToday
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 ring-2 ring-indigo-400'
                  : 'text-slate-200'
              }`}
            >
              {d.dayNumber}
            </div>
          </div>
        ))}
      </div>

      {/* Week grid body */}
      <div className="flex-1 overflow-y-auto relative">
        <div
          className="grid grid-cols-[64px_repeat(7,1fr)] relative"
          style={{ height: `${TOTAL_HOURS * HOUR_HEIGHT}px` }}
        >
          {/* Time gutter */}
          <div className="border-r border-slate-800 bg-slate-950/40 select-none">
            {hours.map((hour) => (
              <div
                key={hour}
                style={{ height: `${HOUR_HEIGHT}px` }}
                className="text-[11px] font-medium text-slate-500 text-right pr-2.5 -mt-2.5"
              >
                {formatTime12h(`${String(hour).padStart(2, '0')}:00`)}
              </div>
            ))}
          </div>

          {/* 7 Day Columns */}
          {weekDays.map((d) => {
            const dayEvents = eventsByDate.get(d.dateStr) || [];

            return (
              <div
                key={d.dateStr}
                className={`relative border-r border-slate-800/70 ${
                  d.isToday ? 'bg-indigo-950/10' : ''
                }`}
              >
                {/* Horizontal hour divider lines */}
                {hours.map((hour) => {
                  const hourTimeStr = `${String(hour).padStart(2, '0')}:00`;
                  return (
                    <div
                      key={hour}
                      onClick={() => onSelectSlot(d.dateStr, hourTimeStr)}
                      style={{ height: `${HOUR_HEIGHT}px` }}
                      className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors cursor-pointer group"
                    >
                      <span className="opacity-0 group-hover:opacity-100 text-[10px] text-slate-500 pl-1 pt-1 inline-block">
                        + {formatTime12h(hourTimeStr)}
                      </span>
                    </div>
                  );
                })}

                {/* Current time red/purple indicator for Today */}
                {d.isToday && currentTimeTop >= 0 && currentTimeTop <= TOTAL_HOURS * HOUR_HEIGHT && (
                  <div
                    className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
                    style={{ top: `${currentTimeTop}px` }}
                  >
                    <div className="w-2.5 h-2.5 rounded-full bg-rose-500 -ml-1 ring-2 ring-slate-900" />
                    <div className="h-[2px] w-full bg-rose-500 shadow-sm shadow-rose-500/50" />
                  </div>
                )}

                {/* Day events positioned absolutely */}
                {dayEvents.map((evt) => {
                  const startMins = timeToMinutes(evt.startTime);
                  const endMins = timeToMinutes(evt.endTime);
                  const offsetMins = startMins - START_HOUR * 60;
                  const durationMins = Math.max(endMins - startMins, 30);

                  const top = (offsetMins / 60) * HOUR_HEIGHT;
                  const height = (durationMins / 60) * HOUR_HEIGHT - 2;

                  if (top + height < 0 || top > TOTAL_HOURS * HOUR_HEIGHT) {
                    return null; // outside visible view
                  }

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
                      className={`absolute left-1 right-1 p-1.5 rounded-lg border text-xs overflow-hidden cursor-pointer shadow-md transition-all hover:scale-[1.02] hover:z-30 ${badge.bg} ${badge.border} flex flex-col justify-between`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <div className="flex items-center gap-1 font-semibold truncate text-[11px] text-slate-100">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${badge.dot}`} />
                          <span className="truncate">{evt.title}</span>
                        </div>
                        {evt.createdByAi && (
                          <Sparkles className="w-3 h-3 text-indigo-400 flex-shrink-0 animate-pulse" />
                        )}
                      </div>

                      <div className="text-[10px] text-slate-300 font-medium truncate">
                        {formatTime12h(evt.startTime)} – {formatTime12h(evt.endTime)}
                      </div>

                      {height > 44 && (
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 truncate mt-0.5">
                          {evt.location && (
                            <span className="flex items-center gap-0.5 truncate">
                              <MapPin className="w-2.5 h-2.5 text-slate-400 flex-shrink-0" />
                              <span className="truncate">{evt.location}</span>
                            </span>
                          )}
                          {evt.attendees && evt.attendees.length > 0 && (
                            <span className="flex items-center gap-0.5 truncate">
                              <Users className="w-2.5 h-2.5 text-slate-400 flex-shrink-0" />
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
