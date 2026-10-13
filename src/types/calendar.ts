export type EventCategory = 'meeting' | 'call' | 'focus' | 'personal' | 'work' | 'other';

export interface CalendarEvent {
  id: string;
  title: string;
  startDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM (24-hour format)
  endDate: string;   // YYYY-MM-DD
  endTime: string;   // HH:MM (24-hour format)
  category: EventCategory;
  description?: string;
  attendees?: string[];
  location?: string;
  isAllDay?: boolean;
  createdByAi?: boolean;
  color?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  actionsApplied?: Array<{
    type: 'schedule' | 'update' | 'delete';
    eventTitle: string;
    details?: string;
  }>;
  conflictWarning?: string;
}

export type CalendarViewMode = 'month' | 'week' | 'day' | 'agenda';
