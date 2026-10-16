import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { SchedulingPreferences } from './src/types/calendar';
import {
  extractExplicitDate,
  getScheduledEventAttendee,
  getScheduledEventTitle,
  getWeekdayDateConflict,
  resolveWeekdayDateChoice,
} from './src/utils/dateUtils';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Guard against unhandled process exceptions
process.on('uncaughtException', (err) => {
  console.warn('Process exception prevented:', err?.message || err);
});

process.on('unhandledRejection', (reason) => {
  console.warn('Process rejection handled:', reason);
});

interface CalendarEventPayload {
  id?: string;
  title: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  category?: string;
  description?: string;
  attendees?: string[];
  location?: string;
}

interface ChatRequestBody {
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  events: CalendarEventPayload[];
  currentDateTime: string;
  timeZone?: string;
  schedulingPreferences?: SchedulingPreferences;
}

const DEFAULT_SCHEDULING_PREFERENCES: SchedulingPreferences = {
  workDays: [1, 2, 3, 4, 5],
  workdayStart: '09:00',
  workdayEnd: '17:00',
  preferredTimeOfDay: 'any',
  bufferMinutes: 15,
};

function timeToMinutes(time24: string): number {
  const [h, m] = (time24 || '00:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function formatDateLabel(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

function findAvailableTimeSlots(
  prompt: string,
  events: CalendarEventPayload[],
  todayDate: string,
  preferences: SchedulingPreferences
): Array<{ date: string; start: string; end: string }> {
  const lower = prompt.toLowerCase();
  const durationMatch = lower.match(/\b(15|30|45|60|90|120)\s*(minutes?|mins?|m|hours?|hrs?|h)\b/);
  const durationMinutes = durationMatch
    ? Number(durationMatch[1]) * (/hours?|hrs?|h/.test(durationMatch[2]) ? 60 : 1)
    : /\bone hour\b/.test(lower)
      ? 60
      : /\btwo hours\b/.test(lower)
        ? 120
        : 30;
  const explicitDate = extractExplicitDate(prompt, todayDate);
  const weekdayEntry = Object.entries({
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  }).find(([day]) => lower.includes(day));
  const rangeStart = explicitDate || todayDate;
  let daysToSearch = 7;

  if (explicitDate || /\btoday\b|\btomorrow\b/.test(lower) || weekdayEntry) {
    daysToSearch = 1;
  }

  const dates: string[] = [];
  const startDate = new Date(`${rangeStart}T00:00:00Z`);
  if (!explicitDate && lower.includes('tomorrow')) startDate.setUTCDate(startDate.getUTCDate() + 1);
  if (!explicitDate && weekdayEntry) {
    const todayWeekday = startDate.getUTCDay();
    let offset = weekdayEntry[1] - todayWeekday;
    if (offset < 0) offset += 7;
    startDate.setUTCDate(startDate.getUTCDate() + offset);
  }
  for (let offset = 0; offset < daysToSearch; offset++) {
    const date = new Date(startDate);
    date.setUTCDate(date.getUTCDate() + offset);
    const dateString = date.toISOString().slice(0, 10);
    if (preferences.workDays.includes(date.getUTCDay())) dates.push(dateString);
  }

  const startOfDay = timeToMinutes(preferences.workdayStart);
  const endOfDay = timeToMinutes(preferences.workdayEnd);
  const buffer = preferences.bufferMinutes;
  const slots: Array<{ date: string; start: string; end: string; preferenceScore: number }> = [];

  for (const date of dates) {
    const busy = events
      .filter((event) => event.startDate === date)
      .map((event) => ({
        start: Math.max(0, timeToMinutes(event.startTime) - buffer),
        end: Math.min(24 * 60, timeToMinutes(event.endTime) + buffer),
      }))
      .sort((a, b) => a.start - b.start);
    for (let start = startOfDay; start + durationMinutes <= endOfDay; start += 15) {
      const end = start + durationMinutes;
      if (busy.some((event) => start < event.end && end > event.start)) continue;
      const preferenceScore =
        preferences.preferredTimeOfDay === 'morning'
          ? (start >= 12 * 60 ? 1 : 0)
          : preferences.preferredTimeOfDay === 'afternoon'
            ? (start < 12 * 60 ? 1 : 0)
            : 0;
      slots.push({
        date,
        start: `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`,
        end: `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`,
        preferenceScore,
      });
    }
  }

  return slots
    .sort((a, b) => a.preferenceScore - b.preferenceScore || a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
    .slice(0, 3)
    .map(({ date, start, end }) => ({ date, start, end }));
}

function getSchedulingPreferences(input?: SchedulingPreferences): SchedulingPreferences {
  const isValidTime = (time: string) => /^\d{2}:\d{2}$/.test(time) && timeToMinutes(time) < 24 * 60;
  if (
    input &&
    Array.isArray(input.workDays) &&
    input.workDays.length > 0 &&
    input.workDays.every((day) => Number.isInteger(day) && day >= 0 && day <= 6) &&
    isValidTime(input.workdayStart) &&
    isValidTime(input.workdayEnd) &&
    timeToMinutes(input.workdayStart) < timeToMinutes(input.workdayEnd) &&
    ['any', 'morning', 'afternoon'].includes(input.preferredTimeOfDay) &&
    [0, 10, 15, 30, 45].includes(input.bufferMinutes)
  ) {
    return input;
  }
  return DEFAULT_SCHEDULING_PREFERENCES;
}

function format12h(time24: string): string {
  if (!time24) return '';
  const [hStr, mStr] = time24.split(':');
  let h = parseInt(hStr, 10);
  const m = mStr || '00';
  if (isNaN(h)) return time24;
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

function normalizeTime(t: string): string {
  if (!t) return '10:00';
  const clean = t.trim();
  const [h, m] = clean.split(':').map(Number);
  return `${String(h || 0).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
}

function normalizeDate(d: string, todayDate: string): string {
  if (!d || d.toLowerCase() === 'today') return todayDate;
  if (d.toLowerCase() === 'tomorrow') {
    const nextDay = new Date(todayDate);
    nextDay.setDate(nextDay.getDate() + 1);
    const m = String(nextDay.getMonth() + 1).padStart(2, '0');
    const day = String(nextDay.getDate()).padStart(2, '0');
    return `${nextDay.getFullYear()}-${m}-${day}`;
  }
  return d;
}

function getSchedulingClarification(prompt: string, todayDate: string): string | null {
  const isSchedulingRequest = /\b(schedule|book|add|set up|create)\b/i.test(prompt);
  if (!isSchedulingRequest) return null;

  const weekday = prompt.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i)?.[1];
  const explicitDate = extractExplicitDate(prompt, todayDate);
  if (explicitDate) {
    return getWeekdayDateConflict(prompt, todayDate)?.message || null;
  }

  if (/\b(today|tomorrow)\b/i.test(prompt)) return null;
  return weekday
    ? `Which date do you mean for ${weekday}? Please include the month and day (for example, October 19) so I don't choose the wrong date.`
    : 'What date should I schedule it for? Please include the month and day (for example, October 19).';
}

// Built-in intelligent natural language calendar engine
function processNaturalLanguageCalendar(
  prompt: string,
  events: CalendarEventPayload[],
  currentDateTime: string
) {
  const lower = prompt.toLowerCase();
  const todayDate = currentDateTime.split('T')[0] || '2026-10-13';

  // Determine target date from prompt
  const dayOfWeekMap: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };

  let targetDate = todayDate;
  let targetDayLabel = 'Today';

  const explicitDate = extractExplicitDate(prompt, todayDate);
  if (explicitDate) {
    targetDate = explicitDate;
    targetDayLabel = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(`${explicitDate}T00:00:00Z`));
  } else if (lower.includes('tomorrow')) {
    const d = new Date(todayDate);
    d.setDate(d.getDate() + 1);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    targetDate = `${d.getFullYear()}-${m}-${day}`;
    targetDayLabel = 'Tomorrow';
  } else {
    for (const [dayName, targetDayNum] of Object.entries(dayOfWeekMap)) {
      if (lower.includes(dayName)) {
        targetDayLabel = dayName.charAt(0).toUpperCase() + dayName.slice(1);
        const refDate = new Date(todayDate);
        const currentDayNum = refDate.getDay();
        let diff = targetDayNum - currentDayNum;
        if (diff < 0) diff += 7;
        const target = new Date(refDate);
        target.setDate(target.getDate() + diff);
        const m = String(target.getMonth() + 1).padStart(2, '0');
        const day = String(target.getDate()).padStart(2, '0');
        targetDate = `${target.getFullYear()}-${m}-${day}`;
        break;
      }
    }
  }

  // 1. QUERY: "what meetings do I have", "what do I have on tuesday", "schedule", "free time"
  const isQuery =
    lower.includes('what meeting') ||
    lower.includes('what do i have') ||
    lower.includes('what are my') ||
    lower.includes('my schedule') ||
    lower.includes('free time') ||
    lower.includes('am i free') ||
    lower.includes('show meetings');

  if (isQuery && !lower.includes('schedule a') && !lower.includes('book a') && !lower.includes('add a')) {
    const matching = events.filter((e) => e.startDate === targetDate);

    if (matching.length === 0) {
      return {
        reply: `You don't have any scheduled meetings for **${targetDayLabel}** (${targetDate}). Your calendar is completely open!`,
        actions: [],
      };
    }

    const sorted = [...matching].sort((a, b) => a.startTime.localeCompare(b.startTime));
    const items = sorted.map((e) => {
      const timeStr = `${format12h(e.startTime)} – ${format12h(e.endTime)}`;
      const attendeesStr = e.attendees && e.attendees.length > 0 ? ` with ${e.attendees.join(', ')}` : '';
      const locStr = e.location ? ` (${e.location})` : '';
      return `• **${e.title}**: ${timeStr}${locStr}${attendeesStr}`;
    });

    return {
      reply: `You have **${sorted.length} ${sorted.length === 1 ? 'meeting' : 'meetings'}** on **${targetDayLabel}** (${targetDate}):\n\n${items.join('\n')}\n\nLet me know if you would like to reschedule anything or book a new slot!`,
      actions: [],
    };
  }

  // 2. SCHEDULING: "schedule a call with rob at 4:30", "book focus time", "add meeting"
  if (
    lower.includes('schedule') ||
    lower.includes('book') ||
    lower.includes('add') ||
    lower.includes('set up') ||
    lower.includes('create')
  ) {
    const clarification = getSchedulingClarification(prompt, todayDate);
    if (clarification) {
      return {
        reply: clarification,
        actions: [],
      };
    }

    // Extract time
    let startTime = '16:30';
    let endTime = '17:00';

    // Regex for time like 4:30, 4:30pm, 4pm, 10:00, 10am, 16:30
    const timeMatch =
      prompt.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i) ||
      prompt.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\b/i) ||
      prompt.match(/\b(\d{1,2}):(\d{2})\b/);
    if (timeMatch) {
      let hour = parseInt(timeMatch[1], 10);
      const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      const meridiem = timeMatch[3]?.toLowerCase();

      if (meridiem === 'pm' && hour < 12) hour += 12;
      else if (meridiem === 'am' && hour === 12) hour = 0;
      else if (!meridiem) {
        // Business logic: if hour is 1..6, assume afternoon (e.g. 4:30 -> 16:30)
        if (hour >= 1 && hour <= 6) hour += 12;
      }

      startTime = `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

      // Default duration: check for "1 hour", "2 hours", "45 minutes"
      let durationMinutes = 30;
      if (lower.includes('1 hour') || lower.includes('one hour') || lower.includes('1hr')) durationMinutes = 60;
      else if (lower.includes('2 hour') || lower.includes('two hours') || lower.includes('2hr')) durationMinutes = 120;
      else if (lower.includes('45 min')) durationMinutes = 45;

      const endTotalMins = hour * 60 + minutes + durationMinutes;
      const endH = Math.floor(endTotalMins / 60) % 24;
      const endM = endTotalMins % 60;
      endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
    }

    // Extract title & category
    let title = getScheduledEventTitle(prompt) || 'Meeting';
    let category = 'meeting';
    let attendees: string[] = [];

    const attendee = getScheduledEventAttendee(prompt);
    if (attendee) attendees = [attendee];

    if (lower.includes('call')) {
      category = 'call';
    } else if (lower.includes('focus')) {
      category = 'focus';
    } else if (lower.includes('lunch')) {
      category = 'personal';
    }

    if (!getScheduledEventTitle(prompt)) {
      const cleanTitle = prompt
        .replace(/schedule\s+(?:a\s+)?/i, '')
        .replace(/book\s+(?:a\s+)?/i, '')
        .replace(/add\s+(?:a\s+)?/i, '')
        .replace(/\bat\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?/i, '')
        .replace(/\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?\b/gi, '')
        .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '')
        .replace(/\b(?:this week|during the week|sometime this week|any day this week)\b/gi, '')
        .replace(/\b(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|today|tomorrow)\b/gi, '')
        .replace(/\bon\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
      title = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1) || 'Scheduled Event';
    }

    // Check conflict
    const startMins = timeToMinutes(startTime);
    const endMins = timeToMinutes(endTime);
    const conflict = events.find(
      (e) =>
        e.startDate === targetDate &&
        Math.max(startMins, timeToMinutes(e.startTime)) < Math.min(endMins, timeToMinutes(e.endTime))
    );

    const newEvent: CalendarEventPayload = {
      title,
      startDate: targetDate,
      startTime,
      endDate: targetDate,
      endTime,
      category,
      attendees: attendees.length > 0 ? attendees : undefined,
      description: 'Scheduled via Chronos AI assistant',
    };

    let reply = `I've scheduled **${title}** for **${targetDayLabel}** (${targetDate}) from **${format12h(startTime)} to ${format12h(endTime)}**${
      attendees.length > 0 ? ` with ${attendees.join(', ')}` : ''
    }.`;

    let conflictWarning: string | undefined;
    if (conflict) {
      conflictWarning = `Note: This overlaps with "${conflict.title}" (${format12h(conflict.startTime)} – ${format12h(conflict.endTime)}).`;
      reply += `\n\n⚠️ **Heads up:** This overlaps with your existing meeting: **${conflict.title}**.`;
    }

    return {
      reply,
      actions: [
        {
          type: 'schedule',
          event: newEvent,
          reason: `Scheduled ${title} on ${targetDate}`,
        },
      ],
      conflictWarning,
    };
  }

  // 3. CANCEL / DELETE
  if (lower.includes('cancel') || lower.includes('delete') || lower.includes('remove')) {
    const target = events.find((e) => lower.includes(e.title.toLowerCase()));
    if (target) {
      return {
        reply: `I have cancelled and removed **${target.title}** from your calendar.`,
        actions: [
          {
            type: 'delete',
            event: target,
            reason: `Cancelled ${target.title}`,
          },
        ],
      };
    }
  }

  // Default helpful message
  return {
    reply: `I'm here to help manage your schedule! You can ask:\n\n• **"What meetings do I have on tuesday?"**\n    • **"Schedule a call with Rob on October 16 at 4:30 PM"**\n• **"Book 2 hours of focus time tomorrow"**\n• **"Show my schedule for today"**`,
    actions: [],
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;
  const isProduction = process.env.NODE_ENV === 'production';

  app.use(express.json());

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', hasGeminiKey: Boolean(process.env.GEMINI_API_KEY) });
  });

  // Calendar AI Assistant Endpoint
  app.post('/api/calendar/chat', async (req, res) => {
    const { messages = [], events = [], currentDateTime, timeZone = 'UTC' } = req.body as ChatRequestBody;
    const todayStr = currentDateTime ? currentDateTime.split('T')[0] : '2026-10-13';
    const latestUserMessage = messages[messages.length - 1]?.content || '';
    const previousAssistantMessage = messages.slice(0, -1).reverse().find((message) => message.role === 'assistant');
    const previousMessages = messages.slice(0, -1);
    const pendingScheduleIndex = previousMessages.reduce((lastIndex, message, index) => {
      const isSchedulingRequest =
        message.role === 'user' &&
        /\b(schedule|book|add|set up|create)\b/i.test(message.content);
      return isSchedulingRequest ? index : lastIndex;
    }, -1);
    const isWeekdayDateMismatch =
      /\bweekday and date don't match\b/i.test(previousAssistantMessage?.content || '') &&
      pendingScheduleIndex !== -1;
    const selectedMismatchDate = isWeekdayDateMismatch
      ? resolveWeekdayDateChoice(previousAssistantMessage?.content || '', latestUserMessage, todayStr)
      : null;
    const isSchedulingFollowUp =
      /\bwhat date should i schedule\b|\bwhich date do you mean\b/i.test(previousAssistantMessage?.content || '') &&
      pendingScheduleIndex !== -1;
    const originalSchedule = previousMessages
      .slice(pendingScheduleIndex)
      .filter((message) => message.role === 'user')
      .map((message) => message.content)
      .join(' ');
    const schedulingPrompt = selectedMismatchDate
      ? `${originalSchedule
          .replace(/\b(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi, '')
          .replace(/\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?\b/gi, '')
          .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '')
          .replace(/\s+/g, ' ')
          .trim()} on ${selectedMismatchDate}`
      : isSchedulingFollowUp
        ? `${originalSchedule} ${latestUserMessage}`
        : latestUserMessage;
    if (isWeekdayDateMismatch && !selectedMismatchDate) {
      return res.json({ reply: previousAssistantMessage?.content, actions: [] });
    }
    if (selectedMismatchDate) {
      return res.json(processNaturalLanguageCalendar(schedulingPrompt, events, todayStr));
    }
    const preferences = getSchedulingPreferences(req.body.schedulingPreferences);
    if (/\b(find|suggest|recommend)\b.{0,35}\b(time|slot|availability)\b|\bwhen am i (?:free|available)\b|\bavailable slots?\b/i.test(latestUserMessage)) {
      const slots = findAvailableTimeSlots(latestUserMessage, events, todayStr, preferences);
      if (slots.length === 0) {
        return res.json({
          reply: 'I couldn’t find an open slot in your working hours that fits your calendar and buffer preferences. Try changing your working hours, buffer, or search date.',
          actions: [],
        });
      }
      const slotLines = slots.map((slot, index) =>
        `${index + 1}. ${formatDateLabel(slot.date)} at ${format12h(slot.start)}–${format12h(slot.end)}`
      );
      return res.json({
        reply: `Here are some open times based on your working days, hours, calendar conflicts, and ${preferences.bufferMinutes}-minute buffer:\n\n${slotLines.join('\n')}\n\nTell me which date and time you’d like to schedule.`,
        actions: [],
      });
    }
    const schedulingClarification = getSchedulingClarification(schedulingPrompt, todayStr);
    if (schedulingClarification) return res.json({ reply: schedulingClarification, actions: [] });

    const apiKey = process.env.GEMINI_API_KEY;

    // Try cloud Gemini API first if key exists
    if (apiKey) {
      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            },
          },
        });

        const systemInstruction = `You are Chronos AI, an elite executive AI calendar assistant.
Current Date: ${todayStr} (Reference Time: ${currentDateTime || '2026-10-13T11:07:47-07:00'}, Timezone: ${timeZone})

Current Calendar Events:
${JSON.stringify(events, null, 2)}

Your Capabilities:
1. Answer queries about the user's schedule (e.g. "what meetings do I have on tuesday?").
2. Automatically schedule events from requests (e.g. "Schedule a call with Rob at 4:30").
3. Update or reschedule existing events.
4. Cancel/delete events.
5. Check for conflicts or overlaps.

Rules:
- If scheduling "call with Rob at 4:30", set title: "Call with Rob", startDate: "${todayStr}", startTime: "16:30", endDate: "${todayStr}", endTime: "17:00", category: "call", attendees: ["Rob"].
- Default duration is 30 minutes if unspecified.
- When suggesting open times, honor these scheduling preferences: ${JSON.stringify(preferences)}. Check all existing events and include the configured buffer around busy times.
- Never create a scheduled event unless the user specified its exact date. If they provide only a weekday or no date, ask which calendar date they mean rather than guessing. Use the chat history to combine their answer with the original event details.
- Output times strictly in 24-hour format HH:MM.
- Output dates in YYYY-MM-DD format.`;

        // Filter and sanitize messages so history starts with 'user'
        const rawFiltered = messages.filter((m) => m.role === 'user' || m.role === 'assistant');
        const firstUserIdx = rawFiltered.findIndex((m) => m.role === 'user');
        const usableMessages = firstUserIdx !== -1 ? rawFiltered.slice(firstUserIdx) : rawFiltered;

        // Group into valid alternating turns for Gemini
        const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
        for (const m of usableMessages) {
          const role = m.role === 'assistant' ? 'model' : 'user';
          const last = contents[contents.length - 1];
          if (last && last.role === role) {
            last.parts.push({ text: m.content });
          } else {
            contents.push({ role, parts: [{ text: m.content }] });
          }
        }

        if (contents.length > 0 && contents[0].role === 'user') {
          const candidateModels = ['gemini-3.8-flash', 'gemini-flash-latest'];
          for (const model of candidateModels) {
            try {
              const response = await ai.models.generateContent({
                model,
                contents: contents as any,
                config: {
                  systemInstruction,
                  responseMimeType: 'application/json',
                  responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                      reply: {
                        type: Type.STRING,
                        description: 'Friendly response explaining what was found or scheduled.',
                      },
                      actions: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            type: { type: Type.STRING, description: 'schedule, update, or delete' },
                            event: {
                              type: Type.OBJECT,
                              properties: {
                                id: { type: Type.STRING },
                                title: { type: Type.STRING },
                                startDate: { type: Type.STRING },
                                startTime: { type: Type.STRING },
                                endDate: { type: Type.STRING },
                                endTime: { type: Type.STRING },
                                category: { type: Type.STRING },
                                description: { type: Type.STRING },
                                location: { type: Type.STRING },
                                attendees: {
                                  type: Type.ARRAY,
                                  items: { type: Type.STRING },
                                },
                              },
                              required: ['title', 'startDate', 'startTime', 'endDate', 'endTime'],
                            },
                            reason: { type: Type.STRING },
                          },
                          required: ['type', 'event'],
                        },
                      },
                      conflictWarning: { type: Type.STRING },
                    },
                    required: ['reply', 'actions'],
                  },
                },
              });

              if (response.text) {
                const parsed = JSON.parse(response.text);
                if (parsed.actions && Array.isArray(parsed.actions)) {
                  parsed.actions = parsed.actions.map((act: any) => {
                    if (act.event) {
                      if (act.type === 'schedule') {
                        act.event.title = getScheduledEventTitle(schedulingPrompt) || act.event.title;
                      }
                      act.event.startDate = normalizeDate(act.event.startDate, todayStr);
                      act.event.endDate = normalizeDate(act.event.endDate || act.event.startDate, todayStr);
                      act.event.startTime = normalizeTime(act.event.startTime);
                      act.event.endTime = normalizeTime(act.event.endTime);
                    }
                    return act;
                  });
                }
                return res.json(parsed);
              }
            } catch (modelErr: any) {
              // Try next model candidate
              console.info(`Model ${model} unavailable, checking fallback.`);
            }
          }
        }
      } catch (err: any) {
        console.info('Using local calendar engine fallback.');
      }
    }

    // Seamless fallback to natural language calendar engine
    const fallbackResult = processNaturalLanguageCalendar(schedulingPrompt, events, todayStr);
    return res.json(fallbackResult);
  });

  // Serve Vite in dev or static files in production
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Chronos AI Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.warn('Server startup caught:', err);
});
