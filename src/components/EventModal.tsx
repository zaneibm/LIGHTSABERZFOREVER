import React, { useState, useEffect } from 'react';
import { CalendarEvent, EventCategory } from '../types/calendar';
import { checkOverlap, formatTime12h } from '../utils/dateUtils';
import {
  X,
  Calendar,
  Clock,
  MapPin,
  Users,
  AlignLeft,
  Trash2,
  Sparkles,
  AlertCircle,
} from 'lucide-react';

interface EventModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: Partial<CalendarEvent> | null;
  onSave: (event: CalendarEvent) => void;
  onDelete?: (eventId: string) => void;
  existingEvents: CalendarEvent[];
}

export const EventModal: React.FC<EventModalProps> = ({
  isOpen,
  onClose,
  event,
  onSave,
  onDelete,
  existingEvents,
}) => {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<EventCategory>('meeting');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('09:30');
  const [location, setLocation] = useState('');
  const [attendeesInput, setAttendeesInput] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (event) {
      setTitle(event.title || '');
      setCategory(event.category || 'meeting');
      setStartDate(event.startDate || '2026-10-13');
      setStartTime(event.startTime || '09:00');
      setEndDate(event.endDate || event.startDate || '2026-10-13');
      setEndTime(event.endTime || '09:30');
      setLocation(event.location || '');
      setAttendeesInput(event.attendees ? event.attendees.join(', ') : '');
      setDescription(event.description || '');
      setError('');
    }
  }, [event]);

  if (!isOpen) return null;

  // Check if current slot conflicts with another event
  const conflict = existingEvents.find(
    (e) =>
      e.id !== event?.id &&
      e.startDate === startDate &&
      checkOverlap(startTime, endTime, e.startTime, e.endTime)
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please provide an event title.');
      return;
    }
    if (startTime >= endTime && startDate === endDate) {
      setError('End time must be after start time.');
      return;
    }

    const attendees = attendeesInput
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean);

    const updatedEvent: CalendarEvent = {
      id: event?.id || `evt-${Date.now()}`,
      title: title.trim(),
      category,
      startDate,
      startTime,
      endDate: endDate || startDate,
      endTime,
      location: location.trim() || undefined,
      attendees: attendees.length > 0 ? attendees : undefined,
      description: description.trim() || undefined,
      createdByAi: event?.createdByAi || false,
    };

    onSave(updatedEvent);
    onClose();
  };

  const categories: Array<{ id: EventCategory; label: string }> = [
    { id: 'meeting', label: 'Meeting' },
    { id: 'call', label: 'Call' },
    { id: 'focus', label: 'Focus Time' },
    { id: 'work', label: 'Work' },
    { id: 'personal', label: 'Personal' },
    { id: 'other', label: 'Other' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-white">
              {event?.id ? 'Edit Event' : 'Create New Event'}
            </h3>
            {event?.createdByAi && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-semibold flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-indigo-400" />
                AI Created
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
          {error && (
            <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {conflict && (
            <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span>
                Conflicts with <strong>{conflict.title}</strong> ({formatTime12h(conflict.startTime)} – {formatTime12h(conflict.endTime)})
              </span>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Event Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Call with Rob, Team Sync"
              className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              autoFocus
            />
          </div>

          {/* Category selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Category
            </label>
            <div className="grid grid-cols-3 gap-2">
              {categories.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => setCategory(c.id)}
                  className={`py-1.5 px-2 rounded-xl text-xs font-semibold transition border ${
                    category === c.id
                      ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                      : 'bg-slate-800 text-slate-300 border-slate-700/80 hover:bg-slate-700'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date & Time fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setEndDate(e.target.value);
                }}
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs sm:text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                Time Window (24h)
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-2 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full px-2 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-slate-400" />
              Location or Video Link
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Google Meet, Zoom, Room 402"
              className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs sm:text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Attendees */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-slate-400" />
              Attendees (comma separated)
            </label>
            <input
              type="text"
              value={attendeesInput}
              onChange={(e) => setAttendeesInput(e.target.value)}
              placeholder="e.g. Rob, Sarah, team@company.com"
              className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs sm:text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
              <AlignLeft className="w-3.5 h-3.5 text-slate-400" />
              Description & Agenda Notes
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add agenda, meeting objectives, or notes..."
              className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs sm:text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          {/* Action buttons */}
          <div className="pt-2 flex items-center justify-between border-t border-slate-800">
            {event?.id && onDelete ? (
              <button
                type="button"
                onClick={() => {
                  onDelete(event.id!);
                  onClose();
                }}
                className="flex items-center gap-1 px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-semibold transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/30 transition"
              >
                Save Event
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
