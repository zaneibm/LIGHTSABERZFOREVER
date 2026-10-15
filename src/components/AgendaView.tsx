import React, { useState } from 'react';
import { CalendarEvent } from '../types/calendar';
import {
  formatDate,
  formatTime12h,
  getCategoryBadge,
  parseDate,
} from '../utils/dateUtils';
import { Search, Clock, MapPin, Users, Sparkles, ChevronUp } from 'lucide-react';

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
}) => {
  const todayStr = formatDate(now);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showPast, setShowPast] = useState(false);

  const filteredEvents = React.useMemo(() => {
    return events.filter((evt) => {
      const matchesSearch =
        searchTerm === '' ||
        evt.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (evt.description && evt.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (evt.attendees && evt.attendees.some(a => a.toLowerCase().includes(searchTerm.toLowerCase())));
      const matchesCat = selectedCategory === 'all' || evt.category === selectedCategory;
      // Hide past events unless toggled or actively searching
      const isPast = evt.startDate < todayStr;
      const visible = searchTerm !== '' ? true : showPast ? true : !isPast;
      return matchesSearch && matchesCat && visible;
    });
  }, [events, searchTerm, selectedCategory, showPast, todayStr]);

  const grouped = React.useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    filteredEvents.forEach((evt) => {
      const list = map.get(evt.startDate) || [];
      list.push(evt);
      map.set(evt.startDate, list);
    });
    return Array.from(map.keys()).sort().map((dateStr) => ({
      dateStr,
      events: map.get(dateStr)!.sort((a, b) => a.startTime.localeCompare(b.startTime)),
    }));
  }, [filteredEvents]);

  const pastCount = React.useMemo(
    () => events.filter(e => e.startDate < todayStr).length,
    [events, todayStr]
  );

  const categories: Array<{ id: string; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'meeting', label: 'Meetings' },
    { id: 'call', label: 'Calls' },
    { id: 'focus', label: 'Focus' },
    { id: 'personal', label: 'Personal' },
  ];

  return (
    <div className="flex flex-col h-full bg-white overflow-y-auto p-4 sm:p-6 max-w-4xl mx-auto w-full">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-gray-200">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search events, attendees..."
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-gray-50 border border-gray-200 text-xs sm:text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 custom-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                selectedCategory === cat.id
                  ? 'bg-gray-900 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-500 hover:text-gray-700 hover:bg-gray-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Past events toggle */}
      {pastCount > 0 && searchTerm === '' && (
        <button
          onClick={() => setShowPast(v => !v)}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 mb-4 transition self-start"
        >
          <ChevronUp className={`w-3.5 h-3.5 transition-transform ${showPast ? '' : 'rotate-180'}`} />
          {showPast ? 'Hide' : 'Show'} {pastCount} past {pastCount === 1 ? 'event' : 'events'}
        </button>
      )}

      {grouped.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-gray-200 rounded-2xl bg-gray-50">
          <p className="text-sm text-gray-400 font-medium">
            {events.length === 0 ? 'No events on your calendar' : 'No events matching your filter'}
          </p>
          {(searchTerm !== '' || selectedCategory !== 'all') && (
            <button
              onClick={() => { setSearchTerm(''); setSelectedCategory('all'); }}
              className="mt-2 text-xs text-gray-500 hover:text-gray-700 underline"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ dateStr, events: dayEvts }) => {
            const dateObj = parseDate(dateStr);
            const isToday = dateStr === todayStr;
            const isPast = dateStr < todayStr;
            const heading = dateObj.toLocaleDateString('en-US', {
              weekday: 'long', month: 'short', day: 'numeric',
            });

            return (
              <div key={dateStr} className="space-y-2">
                {/* Date heading */}
                <div className="flex items-center gap-2 sticky top-0 bg-white py-1 z-10">
                  <div className={`flex items-center gap-2 ${isPast ? 'opacity-50' : ''}`}>
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isToday ? 'bg-green-500' : isPast ? 'bg-gray-300' : 'bg-gray-400'}`} />
                    <h3 className={`text-xs font-bold uppercase tracking-wider ${isToday ? 'text-green-600' : 'text-gray-500'}`}>
                      {heading}{isToday ? ' — Today' : ''}
                    </h3>
                  </div>
                  <div className="h-px flex-1 bg-gray-100" />
                  <span className="text-[11px] text-gray-400 font-medium">{dayEvts.length} {dayEvts.length === 1 ? 'event' : 'events'}</span>
                </div>

                {/* Event rows */}
                <div className="space-y-2">
                  {dayEvts.map((evt) => {
                    const badge = getCategoryBadge(evt.category);
                    return (
                      <div
                        key={evt.id}
                        onClick={() => onSelectEvent(evt)}
                        className={`p-3 sm:p-3.5 rounded-xl transition-all hover:shadow-sm cursor-pointer bg-white ${isPast ? 'opacity-60' : ''}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            {/* Color dot */}
                            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${badge.dot}`} />

                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-semibold text-sm text-gray-900 truncate">{evt.title}</span>
                                {evt.createdByAi && (
                                  <Sparkles className="w-3 h-3 text-gray-400 flex-shrink-0" />
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5 flex-wrap">
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {formatTime12h(evt.startTime)} – {formatTime12h(evt.endTime)}
                                </span>
                                {evt.location && (
                                  <span className="flex items-center gap-1 truncate">
                                    <MapPin className="w-3 h-3 flex-shrink-0" />
                                    <span className="truncate">{evt.location}</span>
                                  </span>
                                )}
                                {evt.attendees && evt.attendees.length > 0 && (
                                  <span className="flex items-center gap-1 truncate">
                                    <Users className="w-3 h-3 flex-shrink-0" />
                                    <span className="truncate">{evt.attendees.join(', ')}</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md flex-shrink-0 uppercase tracking-wider ${badge.bg} ${badge.text} border ${badge.border}`}>
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
