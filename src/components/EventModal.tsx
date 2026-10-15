import React, { useState, useEffect } from 'react';
import { CalendarEvent, EventCategory } from '../types/calendar';
import { checkOverlap, formatDate, formatTime12h } from '../utils/dateUtils';
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
      setStartDate(event.startDate || formatDate(new Date()));
      setStartTime(event.startTime || '09:00');
      setEndDate(event.endDate || event.startDate || formatDate(new Date()));
      setEndTime(event.endTime || '09:30');
      setLocation(event.location || '');
      setAttendeesInput(event.attendees ? event.attendees.join(', ') : '');
      setDescription(event.description || '');
      setError('');
    }
  }, [event]);

  if (!isOpen) return null;

  const conflict = existingEvents.find(
    (e) =>
      e.id !== event?.id &&
      e.startDate === startDate &&
      checkOverlap(startTime, endTime, e.startTime, e.endTime)
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError('Please provide an event title.'); return; }
    if (startTime >= endTime && startDate === endDate) { setError('End time must be after start time.'); return; }

    const attendees = attendeesInput.split(',').map((a) => a.trim()).filter(Boolean);

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

  const inputCls = 'w-full px-3.5 py-2 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-white border border-gray-200 rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-gray-900">
              {event?.id ? 'Edit Event' : 'Create New Event'}
            </h3>
            {event?.createdByAi && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-500 border border-indigo-200 font-semibold flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                AI Created
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
          {error && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {conflict && (
            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>
                Conflicts with <strong>{conflict.title}</strong> ({formatTime12h(conflict.startTime)} – {formatTime12h(conflict.endTime)})
              </span>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Event Title *</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Call with Rob, Team Sync" className={inputCls} autoFocus />
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Category</label>
            <div className="grid grid-cols-3 gap-2">
              {categories.map((c) => (
                <button type="button" key={c.id} onClick={() => setCategory(c.id)}
                  className={`py-1.5 px-2 rounded-xl text-xs font-semibold transition border ${
                    category === c.id
                      ? 'bg-gray-900 text-white border-gray-900 shadow-sm'
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-gray-400" />Date
              </label>
              <input type="date" value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setEndDate(e.target.value); }}
                className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-gray-400" />Time
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputCls} />
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputCls} />
              </div>
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-gray-400" />Location or Video Link
            </label>
            <input type="text" value={location} onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Google Meet, Zoom, Room 402" className={inputCls} />
          </div>

          {/* Attendees */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-gray-400" />Attendees (comma separated)
            </label>
            <input type="text" value={attendeesInput} onChange={(e) => setAttendeesInput(e.target.value)}
              placeholder="e.g. Rob, Sarah, team@company.com" className={inputCls} />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1 flex items-center gap-1">
              <AlignLeft className="w-3.5 h-3.5 text-gray-400" />Notes
            </label>
            <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Add agenda, objectives, or notes..."
              className={`${inputCls} resize-none`} />
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-between border-t border-gray-100">
            {event?.id && onDelete ? (
              <button type="button"
                onClick={() => { onDelete(event.id!); onClose(); }}
                className="flex items-center gap-1 px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-500 border border-rose-200 text-xs font-semibold transition"
              >
                <Trash2 className="w-3.5 h-3.5" />Delete
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose}
                className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-semibold transition">
                Cancel
              </button>
              <button type="submit"
                className="px-5 py-2 rounded-xl bg-gray-900 hover:bg-gray-700 text-white text-xs font-semibold shadow-sm transition">
                Save Event
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
