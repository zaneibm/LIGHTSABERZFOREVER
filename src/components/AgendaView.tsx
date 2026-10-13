import React, { useState } from 'react';
import { CalendarEvent, EventCategory } from '../types/calendar';
import {
  formatDate,
  formatTime12h,
  getCategoryBadge,
  parseDate,
} from '../utils/dateUtils';
import { Search, Filter, Clock, MapPin, Users, Sparkles } from 'lucide-react';

interface AgendaViewProps {
  now: Date;
  events: CalendarEvent[];
  onSelectEvent: (event: CalendarEvent) => void;
  onNewEvent: () => void;
}

export const AgendaView: React.FC<AgendaViewProps> = ({
  now,
  events,
  onSelectEvent,
  onNewEvent,
}) => {
  const todayStr = formatDate(now);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const filteredEvents = React.useMemo(() => {
    return events.filter((evt) => {
      const matchesSearch =
        evt.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (evt.description && evt.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (evt.attendees && evt.attendees.some(a => a.toLowerCase().includes(searchTerm.toLowerCase())));

      const matchesCat =
        selectedCategory === 'all' || evt.category === selectedCategory;

      return matchesSearch && matchesCat;
    });
  }, [events, searchTerm, selectedCategory]);

  // Group by date
  const grouped = React.useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    filteredEvents.forEach((evt) => {
      const list = map.get(evt.startDate) || [];
      list.push(evt);
      map.set(evt.startDate, list);
    });
    // Sort dates
    const sortedDates = Array.from(map.keys()).sort();
    return sortedDates.map((dateStr) => ({
      dateStr,
      events: map.get(dateStr)!.sort((a, b) => a.startTime.localeCompare(b.startTime)),
    }));
  }, [filteredEvents]);

  const categories: Array<{ id: string; label: string }> = [
    { id: 'all', label: 'All Events' },
    { id: 'meeting', label: 'Meetings' },
    { id: 'call', label: 'Calls' },
    { id: 'focus', label: 'Focus' },
    { id: 'personal', label: 'Personal' },
  ];

  return (
    <div className="flex flex-col h-full bg-slate-900 overflow-y-auto p-4 sm:p-6 max-w-4xl mx-auto w-full">
      {/* Controls: Search and Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 mb-5 border-b border-slate-800">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search meetings, attendees, keywords..."
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-800/80 border border-slate-700/80 text-xs sm:text-sm text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          />
        </div>

        {/* Categories */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 custom-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                selectedCategory === cat.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Events Grouped by Date */}
      {grouped.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-800 rounded-2xl bg-slate-900/40">
          <p className="text-sm text-slate-400 font-medium">No events matching your filter</p>
          <button
            onClick={() => {
              setSearchTerm('');
              setSelectedCategory('all');
            }}
            className="mt-2 text-xs text-indigo-400 hover:underline"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ dateStr, events }) => {
            const dateObj = parseDate(dateStr);
            const isToday = dateStr === todayStr;
            const heading = dateObj.toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            });

            return (
              <div key={dateStr} className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <h3 className={`text-xs font-bold uppercase tracking-wider ${isToday ? 'text-indigo-400' : 'text-slate-400'}`}>
                    {heading} {isToday && '(Today)'}
                  </h3>
                  <div className="h-px flex-1 bg-slate-800" />
                  <span className="text-[11px] text-slate-500 font-medium">{events.length} items</span>
                </div>

                <div className="space-y-2">
                  {events.map((evt) => {
                    const badge = getCategoryBadge(evt.category);
                    return (
                      <div
                        key={evt.id}
                        onClick={() => onSelectEvent(evt)}
                        className={`p-3 sm:p-3.5 rounded-xl border transition-all hover:scale-[1.01] hover:shadow-lg cursor-pointer ${badge.bg} ${badge.border}`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${badge.dot}`} />
                              <span className="font-bold text-sm text-white">{evt.title}</span>
                              {evt.createdByAi && (
                                <Sparkles className="w-3 h-3 text-indigo-400 animate-pulse" />
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-slate-300">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3 text-slate-400" />
                                {formatTime12h(evt.startTime)} – {formatTime12h(evt.endTime)}
                              </span>
                              {evt.location && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="w-3 h-3 text-slate-400" />
                                  {evt.location}
                                </span>
                              )}
                              {evt.attendees && evt.attendees.length > 0 && (
                                <span className="flex items-center gap-1">
                                  <Users className="w-3 h-3 text-slate-400" />
                                  {evt.attendees.join(', ')}
                                </span>
                              )}
                            </div>
                          </div>

                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md self-start sm:self-center uppercase tracking-wider ${badge.bg} ${badge.text} border ${badge.border}`}>
                            {badge.label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
