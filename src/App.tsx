/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CalendarEvent, CalendarViewMode, ChatMessage } from './types/calendar';
import { createInitialEvents } from './data/initialEvents';
import {
  parseDate,
  formatDate,
  formatTime12h,
  formatLocalIso,
  formatClockTime,
} from './utils/dateUtils';
import { useNow } from './utils/useNow';
import { useLocation } from './utils/useLocation';
import { Header } from './components/Header';
import { QuickStatsBar } from './components/QuickStatsBar';
import { MonthView } from './components/MonthView';
import { WeekView } from './components/WeekView';
import { DayView } from './components/DayView';
import { AgendaView } from './components/AgendaView';
import { AIChatSidebar } from './components/AIChatSidebar';
import { EventModal } from './components/EventModal';
import { NotificationToast, ToastNotification } from './components/NotificationToast';

const STORAGE_KEY = 'chronos_calendar_events_v2';

export default function App() {
  // Real current date/time (re-renders each minute)
  const now = useNow();
  // GPS location for weather queries (requested silently on mount; user can also click to enable)
  const { location: gpsLocation, request: requestLocation } = useLocation();
  const gpsRef = useRef(gpsLocation);
  useEffect(() => { gpsRef.current = gpsLocation; }, [gpsLocation]);
  const todayStr = formatDate(now);

  // Calendar state
  const [events, setEvents] = useState<CalendarEvent[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to load events from storage', e);
    }
    return createInitialEvents(formatDate(new Date()));
  });

  // Current view date (starts on today)
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [viewMode, setViewMode] = useState<CalendarViewMode>('week');
  const [isAiOpen, setIsAiOpen] = useState<boolean>(true);
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);

  // Modal state
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [editingEvent, setEditingEvent] = useState<Partial<CalendarEvent> | null>(null);

  // Toast notifications
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  // AI chat messages
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-1',
      role: 'assistant',
      content: `Hello! I'm **Chronos AI**, your calendar assistant.\n\nI can view your meetings, book new calls, resolve conflicts, and organize your day with simple commands. Try asking me:\n\n• **"What meetings do I have on tuesday?"**\n• **"Schedule a call with Rob at 4:30"**\n• **"Book 2 hours of focus time tomorrow"**`,
      timestamp: formatClockTime(new Date()),
    },
  ]);

  // Persist events to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
    } catch (e) {
      console.error('Failed to save events to storage', e);
    }
  }, [events]);

  const addToast = (type: 'success' | 'warning' | 'info', title: string, message: string) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Date Navigation
  const handlePrev = () => {
    setCurrentDate((prev) => {
      const next = new Date(prev);
      if (viewMode === 'month') {
        next.setMonth(next.getMonth() - 1);
      } else if (viewMode === 'week') {
        next.setDate(next.getDate() - 7);
      } else {
        next.setDate(next.getDate() - 1);
      }
      return next;
    });
  };

  const handleNext = () => {
    setCurrentDate((prev) => {
      const next = new Date(prev);
      if (viewMode === 'month') {
        next.setMonth(next.getMonth() + 1);
      } else if (viewMode === 'week') {
        next.setDate(next.getDate() + 7);
      } else {
        next.setDate(next.getDate() + 1);
      }
      return next;
    });
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Manual event creation / editing
  const handleOpenNewEvent = (dateStr?: string, timeStr?: string) => {
    const targetDate = dateStr || formatDate(currentDate);
    const targetStart = timeStr || '10:00';
    // Calculate default 30 min end time
    const [h, m] = targetStart.split(':').map(Number);
    const endMinutes = h * 60 + (m || 0) + 30;
    const endH = String(Math.floor(endMinutes / 60) % 24).padStart(2, '0');
    const endM = String(endMinutes % 60).padStart(2, '0');

    setEditingEvent({
      startDate: targetDate,
      endDate: targetDate,
      startTime: targetStart,
      endTime: `${endH}:${endM}`,
      category: 'meeting',
    });
    setModalOpen(true);
  };

  const handleOpenEditEvent = (event: CalendarEvent) => {
    setEditingEvent(event);
    setModalOpen(true);
  };

  const handleSaveEvent = (savedEvent: CalendarEvent) => {
    setEvents((prev) => {
      const exists = prev.some((e) => e.id === savedEvent.id);
      if (exists) {
        return prev.map((e) => (e.id === savedEvent.id ? savedEvent : e));
      } else {
        return [...prev, savedEvent];
      }
    });

    addToast('success', 'Event Saved', `"${savedEvent.title}" on ${savedEvent.startDate} at ${formatTime12h(savedEvent.startTime)}.`);
  };

  const handleDeleteEvent = (eventId: string) => {
    const target = events.find((e) => e.id === eventId);
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
    if (target) {
      addToast('info', 'Event Removed', `"${target.title}" has been deleted.`);
    }
  };

  const handleResetData = () => {
    setEvents(createInitialEvents(formatDate(new Date())));
    setCurrentDate(new Date());
    addToast('info', 'Schedule Reset', 'Restored initial prototype calendar schedule.');
  };

  // Natural Language AI Chat Handling
  const handleSendMessage = async (userPrompt: string) => {
    if (!userPrompt.trim()) return;

    const userMessage: ChatMessage = {
      id: `usr-${Date.now()}`,
      role: 'user',
      content: userPrompt,
      timestamp: formatClockTime(new Date()),
    };

    setChatMessages((prev) => [...prev, userMessage]);
    setIsAiLoading(true);

    try {
      const validMessages = [...chatMessages, userMessage]
        .filter((m) => m.role === 'user' || m.role === 'assistant');
      const firstUserIndex = validMessages.findIndex((m) => m.role === 'user');
      const outgoingMessages = firstUserIndex !== -1 ? validMessages.slice(firstUserIndex) : [userMessage];

      const response = await fetch('/api/calendar/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: outgoingMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          events,
          currentDateTime: formatLocalIso(new Date()),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles',
          ...(gpsRef.current.status === 'granted'
            ? { latitude: gpsRef.current.latitude, longitude: gpsRef.current.longitude }
            : {}),
        }),
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();
      const actionsApplied: Array<{ type: 'schedule' | 'update' | 'delete'; eventTitle: string; details?: string }> = [];

      // Execute returned calendar mutations
      if (data.actions && Array.isArray(data.actions)) {
        data.actions.forEach((act: any) => {
          if (act.type === 'schedule' && act.event) {
            const newEvt: CalendarEvent = {
              id: `evt-ai-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              title: act.event.title || 'Scheduled Event',
              startDate: act.event.startDate || todayStr,
              startTime: act.event.startTime || '16:30',
              endDate: act.event.endDate || act.event.startDate || todayStr,
              endTime: act.event.endTime || '17:00',
              category: act.event.category || 'call',
              description: act.event.description || 'Scheduled via Chronos AI',
              attendees: act.event.attendees || [],
              location: act.event.location || '',
              createdByAi: true,
            };

            setEvents((prev) => [...prev, newEvt]);

            actionsApplied.push({
              type: 'schedule',
              eventTitle: newEvt.title,
              details: `${newEvt.startDate} • ${formatTime12h(newEvt.startTime)} – ${formatTime12h(newEvt.endTime)}`,
            });

            addToast('success', 'Event Scheduled by AI', `"${newEvt.title}" added for ${newEvt.startDate} at ${formatTime12h(newEvt.startTime)}.`);

            // Ensure user is viewing that date
            if (newEvt.startDate) {
              setCurrentDate(parseDate(newEvt.startDate));
            }
          } else if (act.type === 'update' && act.event) {
            // Server resolves updates to a concrete event id (important for recurring events sharing a title)
            const target = events.find((e) => e.id === act.event.id);
            if (!target) return;
            const updated: CalendarEvent = { ...target, ...act.event };
            setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
            actionsApplied.push({
              type: 'update',
              eventTitle: updated.title,
              details: `${updated.startDate} • ${formatTime12h(updated.startTime)} – ${formatTime12h(updated.endTime)}`,
            });
            addToast('info', 'Event Updated', `Updated schedule for ${updated.title}.`);
          } else if (act.type === 'delete' && act.event) {
            setEvents((prev) => prev.filter((e) => e.id !== act.event.id));
            actionsApplied.push({
              type: 'delete',
              eventTitle: act.event.title || 'Event',
              details: 'Removed from calendar',
            });
            addToast('info', 'Event Cancelled', `Removed ${act.event.title || 'event'}.`);
          }
        });
      }

      // Append assistant reply
      const assistantMessage: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: data.reply || "I've updated your calendar.",
        timestamp: formatClockTime(new Date()),
        actionsApplied: actionsApplied.length > 0 ? actionsApplied : undefined,
        conflictWarning: data.conflictWarning || undefined,
      };

      setChatMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      console.error('Failed to communicate with calendar assistant:', err);
      setChatMessages((prev) => [
        ...prev,
        {
          id: `ai-err-${Date.now()}`,
          role: 'assistant',
          content: "Sorry, I had trouble processing that request right now. Please try again or create the event using the **+ Event** button.",
          timestamp: formatClockTime(new Date()),
        },
      ]);
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 font-sans text-slate-100">
      {/* Top Header */}
      <Header
        currentDate={currentDate}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onPrev={handlePrev}
        onNext={handleNext}
        onToday={handleToday}
        onNewEvent={() => handleOpenNewEvent()}
        isAiOpen={isAiOpen}
        onToggleAi={() => setIsAiOpen((prev) => !prev)}
        onResetData={handleResetData}
        totalEventsCount={events.length}
      />

      {/* Quick Stats & Spotlight */}
      <QuickStatsBar
        events={events}
        now={now}
        onOpenAiPrompt={(prompt) => {
          setIsAiOpen(true);
          handleSendMessage(prompt);
        }}
      />

      {/* Main Content Area: Split View with Calendar on Left, AI Chat on Right */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Calendar View Area */}
        <main className="flex-1 flex flex-col h-full overflow-hidden bg-slate-900">
          {viewMode === 'month' && (
            <MonthView
              currentDate={currentDate}
              now={now}
              events={events}
              onSelectEvent={handleOpenEditEvent}
              onSelectDate={(dateStr) => {
                setCurrentDate(parseDate(dateStr));
                setViewMode('day');
              }}
              onQuickAdd={(dateStr) => handleOpenNewEvent(dateStr)}
            />
          )}

          {viewMode === 'week' && (
            <WeekView
              currentDate={currentDate}
              now={now}
              events={events}
              onSelectEvent={handleOpenEditEvent}
              onSelectSlot={(dateStr, timeStr) => handleOpenNewEvent(dateStr, timeStr)}
            />
          )}

          {viewMode === 'day' && (
            <DayView
              currentDate={currentDate}
              events={events}
              onSelectEvent={handleOpenEditEvent}
              onQuickAdd={(dateStr, timeStr) => handleOpenNewEvent(dateStr, timeStr)}
            />
          )}

          {viewMode === 'agenda' && (
            <AgendaView
              now={now}
              events={events}
              onSelectEvent={handleOpenEditEvent}
              onNewEvent={() => handleOpenNewEvent()}
            />
          )}
        </main>

        {/* AI Chat Window Panel */}
        <AIChatSidebar
          isOpen={isAiOpen}
          onClose={() => setIsAiOpen(false)}
          messages={chatMessages}
          onSendMessage={handleSendMessage}
          isLoading={isAiLoading}
          onSelectEvent={handleOpenEditEvent}
          onClearHistory={() =>
            setChatMessages([
              {
                id: 'welcome-reset',
                role: 'assistant',
                content: "Chat cleared. What can I help you schedule or check?",
                timestamp: 'Just now',
              },
            ])
          }
          allEvents={events}
          locationState={gpsLocation}
          onRequestLocation={requestLocation}
        />
      </div>

      {/* Event Details / Edit Modal */}
      <EventModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingEvent(null);
        }}
        event={editingEvent}
        onSave={handleSaveEvent}
        onDelete={handleDeleteEvent}
        existingEvents={events}
      />

      {/* Toast Notifications */}
      <NotificationToast toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
