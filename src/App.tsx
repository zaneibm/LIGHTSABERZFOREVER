/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { CalendarEvent, CalendarTheme, CalendarViewMode, ChatMessage, SchedulingPreferences } from './types/calendar';
import { INITIAL_CALENDAR_EVENTS } from './data/initialEvents';
import {
  parseDate,
  formatDate,
  DEFAULT_REFERENCE_DATE,
  formatTime12h,
  extractExplicitDate,
  getWeekdayDateConflict,
  resolveWeekdayDateChoice,
} from './utils/dateUtils';
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
const THEME_STORAGE_KEY = 'chronos_calendar_theme';
const PREFERENCES_STORAGE_KEY = 'chronos_scheduling_preferences';
const REMINDED_EVENTS_STORAGE_KEY = 'chronos_reminded_events';
const CALENDAR_THEMES: CalendarTheme[] = ['rose', 'lavender', 'ocean', 'midnight', 'halloween'];
const DEFAULT_SCHEDULING_PREFERENCES: SchedulingPreferences = {
  workDays: [1, 2, 3, 4, 5],
  workdayStart: '09:00',
  workdayEnd: '17:00',
  preferredTimeOfDay: 'any',
  bufferMinutes: 15,
};

export default function App() {
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
    return INITIAL_CALENDAR_EVENTS;
  });

  // Current view date (October 13, 2026 Tuesday default)
  const [currentDate, setCurrentDate] = useState<Date>(() => parseDate(DEFAULT_REFERENCE_DATE));
  const [viewMode, setViewMode] = useState<CalendarViewMode>('week');
  const [theme, setTheme] = useState<CalendarTheme>(() => {
    try {
      const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
      return CALENDAR_THEMES.find((item) => item === savedTheme) || 'rose';
    } catch (error) {
      console.error('Failed to load calendar theme from storage', error);
      return 'rose';
    }
  });
  const [schedulingPreferences, setSchedulingPreferences] = useState<SchedulingPreferences>(() => {
    try {
      const saved = localStorage.getItem(PREFERENCES_STORAGE_KEY);
      if (!saved) return DEFAULT_SCHEDULING_PREFERENCES;
      const parsed = JSON.parse(saved) as SchedulingPreferences;
      const isValidTime = (time: string) =>
        /^\d{2}:\d{2}$/.test(time) && Number(time.slice(0, 2)) < 24 && Number(time.slice(3, 5)) < 60;
      if (
        !Array.isArray(parsed.workDays) ||
        parsed.workDays.length === 0 ||
        !parsed.workDays.every((day) => Number.isInteger(day) && day >= 0 && day <= 6) ||
        !isValidTime(parsed.workdayStart) ||
        !isValidTime(parsed.workdayEnd) ||
        parsed.workdayStart >= parsed.workdayEnd ||
        !['any', 'morning', 'afternoon'].includes(parsed.preferredTimeOfDay) ||
        ![0, 10, 15, 30, 45].includes(parsed.bufferMinutes)
      ) {
        throw new Error('Saved scheduling preferences have an invalid format.');
      }
      return parsed;
    } catch (error) {
      console.error('Failed to load scheduling preferences from storage', error);
      return DEFAULT_SCHEDULING_PREFERENCES;
    }
  });
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
      content: `Hello! I'm **Chronos AI**, your calendar assistant.\n\nI can view your meetings, book new calls, resolve conflicts, and organize your day with simple commands. I'll confirm the exact date before adding an event if you haven't specified one. Try asking me:\n\n• **"What meetings do I have on tuesday?"**\n• **"Schedule a call with Rob on October 16 at 4:30 PM"**\n• **"Schedule a meeting sometime this week"**\n• **"Book 2 hours of focus time tomorrow"**`,
      timestamp: '11:07 AM',
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

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (error) {
      console.error('Failed to save calendar theme to storage', error);
    }
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(schedulingPreferences));
    } catch (error) {
      console.error('Failed to save scheduling preferences to storage', error);
    }
  }, [schedulingPreferences]);

  const addToast = useCallback((type: 'success' | 'warning' | 'info', title: string, message: string) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  useEffect(() => {
    const checkReminders = () => {
      const now = Date.now();
      let remindedIds = new Set<string>();
      try {
        const stored = localStorage.getItem(REMINDED_EVENTS_STORAGE_KEY);
        if (stored) remindedIds = new Set(JSON.parse(stored) as string[]);
      } catch (error) {
        console.error('Failed to load sent calendar reminders', error);
      }

      events.forEach((event) => {
        if (event.reminderMinutesBefore === undefined) return;
        const eventId = `${event.id}:${event.startDate}:${event.startTime}:${event.reminderMinutesBefore}`;
        if (remindedIds.has(eventId)) return;
        const eventStart = new Date(`${event.startDate}T${event.startTime}:00`).getTime();
        const reminderAt = eventStart - event.reminderMinutesBefore * 60_000;
        if (!Number.isFinite(eventStart) || now < reminderAt || now >= eventStart) return;

        const message = `${event.title} starts at ${formatTime12h(event.startTime)}.`;
        if ('Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification('Upcoming event', { body: message });
          } catch (error) {
            console.error('Failed to show browser notification', error);
            addToast('warning', 'Upcoming Event', message);
          }
        } else {
          addToast('info', 'Upcoming Event', message);
        }
        remindedIds.add(eventId);
      });

      try {
        localStorage.setItem(REMINDED_EVENTS_STORAGE_KEY, JSON.stringify([...remindedIds]));
      } catch (error) {
        console.error('Failed to save sent calendar reminders', error);
      }
    };

    checkReminders();
    const intervalId = window.setInterval(checkReminders, 15_000);
    return () => window.clearInterval(intervalId);
  }, [events, addToast]);

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
    setCurrentDate(parseDate(DEFAULT_REFERENCE_DATE));
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
    if (savedEvent.reminderMinutesBefore !== undefined && 'Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission()
        .then((permission) => {
          if (permission !== 'granted') {
            addToast('warning', 'Notifications Disabled', 'Allow browser notifications to receive event reminders outside the page.');
          }
        })
        .catch((error: unknown) => {
          console.error('Failed to request browser notification permission', error);
          addToast('warning', 'Notifications Unavailable', 'The event is saved, but browser notification permission could not be requested.');
        });
    } else if (savedEvent.reminderMinutesBefore !== undefined && !('Notification' in window)) {
      addToast('info', 'In-app Reminder Set', 'This browser does not support notifications; the reminder will appear while Chronos is open.');
    } else if (savedEvent.reminderMinutesBefore !== undefined && Notification.permission === 'denied') {
      addToast('info', 'In-app Reminder Set', 'Browser notifications are blocked; the reminder will appear while Chronos is open.');
    }
  };

  const handleDeleteEvent = (eventId: string) => {
    const target = events.find((e) => e.id === eventId);
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
    if (target) {
      addToast('info', 'Event Removed', `"${target.title}" has been deleted.`);
    }
  };

  const handleResetData = () => {
    setEvents(INITIAL_CALENDAR_EVENTS);
    setCurrentDate(parseDate(DEFAULT_REFERENCE_DATE));
    addToast('info', 'Schedule Reset', 'Restored initial prototype calendar schedule.');
  };

  // Natural Language AI Chat Handling
  const handleSendMessage = async (userPrompt: string) => {
    if (!userPrompt.trim()) return;

    const userMessage: ChatMessage = {
      id: `usr-${Date.now()}`,
      role: 'user',
      content: userPrompt,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setChatMessages((prev) => [...prev, userMessage]);
    setIsAiLoading(true);

    try {
      const previousAssistantMessage = [...chatMessages].reverse().find((message) => message.role === 'assistant');
      const isDateFollowUp =
        /\bwhat date should i schedule\b|\bwhich date do you mean\b|\bweekday and date don't match\b/i.test(previousAssistantMessage?.content || '');
      let schedulingContext = userPrompt;
      if (!/\b(schedule|book|add|set up|create)\b/i.test(userPrompt) && isDateFollowUp) {
        let pendingRequestIndex = -1;
        chatMessages.forEach((message, index) => {
          if (message.role === 'user' && /\b(schedule|book|add|set up|create)\b/i.test(message.content)) {
            pendingRequestIndex = index;
          }
        });
        if (pendingRequestIndex !== -1) {
          const originalRequest = chatMessages
            .slice(pendingRequestIndex)
            .filter((message) => message.role === 'user')
            .map((message) => message.content)
            .join(' ');
          const selectedDate = resolveWeekdayDateChoice(
            previousAssistantMessage?.content || '',
            userPrompt,
            DEFAULT_REFERENCE_DATE
          );
          schedulingContext = selectedDate
            ? `${originalRequest
                .replace(/\b(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi, '')
                .replace(/\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?\b/gi, '')
                .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '')
                .replace(/\s+/g, ' ')
                .trim()} on ${selectedDate}`
            : [...chatMessages.slice(pendingRequestIndex).filter((message) => message.role === 'user').map((message) => message.content), userPrompt].join(' ');
        }
      }

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
          currentDateTime: '2026-10-13T11:07:47-07:00',
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles',
          schedulingPreferences,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();
      const actionsApplied: Array<{ type: 'schedule' | 'update' | 'delete'; eventTitle: string; details?: string }> = [];
      const explicitScheduleDate = extractExplicitDate(schedulingContext, DEFAULT_REFERENCE_DATE);
      const hasRelativeScheduleDate = /\b(today|tomorrow)\b/i.test(schedulingContext);
      const hasExplicitScheduleDate = Boolean(explicitScheduleDate || hasRelativeScheduleDate);
      const weekdayDateConflict = getWeekdayDateConflict(schedulingContext, DEFAULT_REFERENCE_DATE);
      const blockedScheduleAction =
        (!hasExplicitScheduleDate || Boolean(weekdayDateConflict)) &&
        Array.isArray(data.actions) &&
        data.actions.some((action: any) => action.type === 'schedule');

      // Execute returned calendar mutations
      if (data.actions && Array.isArray(data.actions)) {
        data.actions.forEach((act: any) => {
          if (act.type === 'schedule' && act.event) {
            if (blockedScheduleAction) return;
            const newEvt: CalendarEvent = {
              id: `evt-ai-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              title: act.event.title || 'Scheduled Event',
              startDate: explicitScheduleDate || act.event.startDate || DEFAULT_REFERENCE_DATE,
              startTime: act.event.startTime || '16:30',
              endDate: explicitScheduleDate || act.event.endDate || act.event.startDate || DEFAULT_REFERENCE_DATE,
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
            setEvents((prev) =>
              prev.map((e) => {
                if (e.id === act.event.id || e.title.toLowerCase() === (act.event.title || '').toLowerCase()) {
                  const updated = { ...e, ...act.event };
                  actionsApplied.push({
                    type: 'update',
                    eventTitle: updated.title,
                    details: `Updated time to ${formatTime12h(updated.startTime)} – ${formatTime12h(updated.endTime)}`,
                  });
                  return updated;
                }
                return e;
              })
            );
            addToast('info', 'Event Updated', `Updated schedule for ${act.event.title || 'event'}.`);
          } else if (act.type === 'delete' && act.event) {
            setEvents((prev) => prev.filter((e) => e.id !== act.event.id && e.title.toLowerCase() !== (act.event.title || '').toLowerCase()));
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
        content: blockedScheduleAction
          ? weekdayDateConflict?.message || 'What date should I schedule it for? Please include the month and day (for example, October 19).'
          : data.reply || "I've updated your calendar.",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
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
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div data-theme={theme} className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 font-sans text-slate-100">
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
        theme={theme}
        onThemeChange={setTheme}
        schedulingPreferences={schedulingPreferences}
        onSchedulingPreferencesChange={setSchedulingPreferences}
      />

      {/* Quick Stats & Spotlight */}
      <QuickStatsBar
        events={events}
        currentDate={currentDate}
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
          theme={theme}
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
