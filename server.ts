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
  // Optional: browser Geolocation coordinates supplied by the client
  latitude?: number;
  longitude?: number;
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
  if (d.toLowerCase() === 'tomorrow') return addDays(todayDate, 1);
  return d;
}

// ---------------------------------------------------------------------------
// Scheduling helpers: free-slot search, conflict alternatives, recurrence, insights
// All date math uses UTC so results do not depend on the server's timezone.
// ---------------------------------------------------------------------------
const WORK_START = 9 * 60;
const WORK_END = 18 * 60;
const MAX_OCCURRENCES = 52;
const MAX_RECURRENCE_DAYS = 366;
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface Recurrence {
  frequency: 'daily' | 'weekly' | 'monthly';
  interval?: number;
  daysOfWeek?: number[];
  count?: number;
  until?: string;
}

function parseUtc(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00Z`);
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

function addDays(dateStr: string, n: number): string {
  const d = parseUtc(dateStr);
  d.setUTCDate(d.getUTCDate() + n);
  return toDateStr(d);
}

function dayOfWeek(dateStr: string): number {
  return parseUtc(dateStr).getUTCDay();
}

function minutesToTime(mins: number): string {
  const clamped = Math.max(0, Math.min(mins, 24 * 60 - 1));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
}

function isValidDate(d: unknown): d is string {
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(parseUtc(d).getTime());
}

// Busy [start, end) intervals in minutes for a given date, merged and sorted.
function getBusyIntervals(events: CalendarEventPayload[], date: string, ignoreId?: string): Array<[number, number]> {
  const raw: Array<[number, number]> = [];
  for (const e of events) {
    if (ignoreId && e.id === ignoreId) continue;
    if (!e.startDate || !e.endDate || e.startDate > date || e.endDate < date) continue;
    const start = e.startDate === date ? timeToMinutes(e.startTime) : 0;
    const end = e.endDate === date ? timeToMinutes(e.endTime) : 24 * 60;
    if (end > start) raw.push([start, end]);
  }
  raw.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const iv of raw) {
    const last = merged[merged.length - 1];
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
    else merged.push([iv[0], iv[1]]);
  }
  return merged;
}

// Free gaps inside working hours for a date.
function getFreeGaps(events: CalendarEventPayload[], date: string, ignoreId?: string): Array<[number, number]> {
  const gaps: Array<[number, number]> = [];
  let cursor = WORK_START;
  for (const [s, e] of getBusyIntervals(events, date, ignoreId)) {
    if (e <= cursor) continue;
    if (s >= WORK_END) break;
    if (s > cursor) gaps.push([cursor, Math.min(s, WORK_END)]);
    cursor = Math.max(cursor, e);
  }
  if (cursor < WORK_END) gaps.push([cursor, WORK_END]);
  return gaps;
}

function findConflict(
  events: CalendarEventPayload[],
  date: string,
  startMins: number,
  endMins: number,
  ignoreId?: string
): CalendarEventPayload | undefined {
  return events.find((e) => {
    if (ignoreId && e.id === ignoreId) return false;
    if (e.startDate > date || e.endDate < date) return false;
    const eStart = e.startDate === date ? timeToMinutes(e.startTime) : 0;
    const eEnd = e.endDate === date ? timeToMinutes(e.endTime) : 24 * 60;
    return Math.max(startMins, eStart) < Math.min(endMins, eEnd);
  });
}

// First free slot of `duration` minutes on/after `date` at or after `fromMins`.
// Weekends are skipped when the search rolls past the requested date.
function findSlotAcrossDays(
  events: CalendarEventPayload[],
  date: string,
  duration: number,
  fromMins: number,
  ignoreId?: string,
  maxDays = 7
): { date: string; startTime: string; endTime: string } | null {
  for (let offset = 0; offset < maxDays; offset++) {
    const d = addDays(date, offset);
    const dow = dayOfWeek(d);
    if (offset > 0 && (dow === 0 || dow === 6)) continue;
    const from = offset === 0 ? fromMins : WORK_START;
    for (const [gs, ge] of getFreeGaps(events, d, ignoreId)) {
      const start = Math.max(gs, from);
      if (ge - start >= duration) {
        return { date: d, startTime: minutesToTime(start), endTime: minutesToTime(start + duration) };
      }
    }
  }
  return null;
}

// Up to 3 alternative slots, nearest to the preferred start on the same day, else the next open slot.
function suggestAlternatives(
  events: CalendarEventPayload[],
  date: string,
  duration: number,
  preferredStart: number,
  ignoreId?: string
): string[] {
  const candidates: number[] = [];
  for (const [gs, ge] of getFreeGaps(events, date, ignoreId)) {
    if (ge - gs < duration) continue;
    // Closest start inside this gap to the preferred time, snapped to 15 minutes
    const ideal = Math.min(Math.max(preferredStart, gs), ge - duration);
    candidates.push(Math.min(ge - duration, Math.ceil(ideal / 15) * 15));
  }
  candidates.sort((a, b) => Math.abs(a - preferredStart) - Math.abs(b - preferredStart));
  const sameDay = candidates
    .slice(0, 3)
    .sort((a, b) => a - b)
    .map((s) => `${format12h(minutesToTime(s))} – ${format12h(minutesToTime(s + duration))}`);
  if (sameDay.length > 0) return sameDay;

  const next = findSlotAcrossDays(events, addDays(date, 1), duration, WORK_START, ignoreId);
  return next
    ? [`${DAY_NAMES[dayOfWeek(next.date)]} ${next.date}, ${format12h(next.startTime)} – ${format12h(next.endTime)}`]
    : [];
}

// Expand a recurrence rule into a list of start dates (always includes the first date).
function expandRecurrence(startDate: string, endDate: string, rec: Recurrence): Array<{ startDate: string; endDate: string }> {
  const interval = Math.max(1, Math.floor(rec.interval || 1));
  const defaultCount = rec.frequency === 'daily' ? 7 : rec.frequency === 'weekly' ? 8 : 6;
  const maxCount = Math.min(MAX_OCCURRENCES, Math.max(1, Math.floor(rec.count || (rec.until ? MAX_OCCURRENCES : defaultCount))));
  const until = isValidDate(rec.until) ? rec.until : addDays(startDate, MAX_RECURRENCE_DAYS);
  const spanDays = Math.round((parseUtc(endDate).getTime() - parseUtc(startDate).getTime()) / 86400000);
  const startDow = dayOfWeek(startDate);
  const startDom = parseUtc(startDate).getUTCDate();
  const startMonthIdx = parseUtc(startDate).getUTCFullYear() * 12 + parseUtc(startDate).getUTCMonth();
  const dows = rec.daysOfWeek && rec.daysOfWeek.length > 0 ? rec.daysOfWeek.filter((n) => n >= 0 && n <= 6) : [startDow];

  const out: Array<{ startDate: string; endDate: string }> = [];
  for (let offset = 0; offset <= MAX_RECURRENCE_DAYS && out.length < maxCount; offset++) {
    const d = addDays(startDate, offset);
    if (d > until) break;
    const dt = parseUtc(d);
    let match = false;
    if (rec.frequency === 'daily') {
      match = offset % interval === 0;
    } else if (rec.frequency === 'weekly') {
      match = dows.includes(dt.getUTCDay()) && Math.floor((offset + startDow) / 7) % interval === 0;
    } else if (rec.frequency === 'monthly') {
      const monthIdx = dt.getUTCFullYear() * 12 + dt.getUTCMonth();
      match = dt.getUTCDate() === startDom && (monthIdx - startMonthIdx) % interval === 0;
    }
    if (match) out.push({ startDate: d, endDate: addDays(d, spanDays) });
  }
  return out.length > 0 ? out : [{ startDate, endDate }];
}

// Pre-computed per-day load so the model can give reliable summaries and insights.
function buildScheduleInsights(events: CalendarEventPayload[], todayStr: string) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(todayStr, i);
    const dayEvents = events
      .filter((e) => e.startDate === date && e.endDate === date)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    let backToBack = 0;
    let overlaps = 0;
    for (let j = 1; j < dayEvents.length; j++) {
      const prevEnd = Math.max(...dayEvents.slice(0, j).map((e) => timeToMinutes(e.endTime)));
      const start = timeToMinutes(dayEvents[j].startTime);
      if (start === prevEnd) backToBack++;
      else if (start < prevEnd) overlaps++;
    }
    const bookedMinutes = getBusyIntervals(events, date).reduce((sum, [s, e]) => sum + (e - s), 0);
    const freeGaps = getFreeGaps(events, date).filter(([s, e]) => e - s >= 15);
    days.push({
      date,
      weekday: DAY_NAMES[dayOfWeek(date)],
      eventCount: dayEvents.length,
      bookedMinutes,
      focusMinutes: dayEvents
        .filter((e) => e.category === 'focus')
        .reduce((sum, e) => sum + (timeToMinutes(e.endTime) - timeToMinutes(e.startTime)), 0),
      backToBack,
      overlaps,
      freeSlotsInWorkHours: freeGaps.map(([s, e]) => `${minutesToTime(s)}-${minutesToTime(e)}`),
      longestFreeBlockMinutes: freeGaps.reduce((max, [s, e]) => Math.max(max, e - s), 0),
    });
  }
  return days;
}

// Resolve the current date/time. Prefers the client's local wall-clock (ISO string with offset),
// otherwise uses the server clock in the given IANA timezone (or UTC if it is invalid).
function resolveNow(currentDateTime: unknown, timeZone: string): { todayStr: string; nowMinutes: number; iso: string } {
  if (typeof currentDateTime === 'string') {
    const m = currentDateTime.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
    if (m && isValidDate(m[1]) && Number(m[2]) < 24 && Number(m[3]) < 60) {
      return { todayStr: m[1], nowMinutes: Number(m[2]) * 60 + Number(m[3]), iso: currentDateTime.slice(0, 40) };
    }
  }
  let tz = 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    tz = timeZone;
  } catch {
    // invalid timezone: keep UTC
  }
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value])
  );
  const todayStr = `${parts.year}-${parts.month}-${parts.day}`;
  return { todayStr, nowMinutes: Number(parts.hour) * 60 + Number(parts.minute), iso: `${todayStr}T${parts.hour}:${parts.minute} (${tz})` };
}

// Validate, resolve and expand the actions returned by the model.
// - update/delete are resolved to real event ids (unknown targets are dropped)
// - schedule supports autoFindSlot, recurrence, conflict detection with alternatives
function processModelActions(rawActions: any[], events: CalendarEventPayload[], todayStr: string, nowMinutes: number) {
  const out: any[] = [];
  const warnings: string[] = [];
  const infos: string[] = [];
  let working = [...events];
  let extraConflicts = 0;

  const warn = (msg: string) => {
    if (warnings.length < 5) warnings.push(msg);
    else extraConflicts++;
  };

  for (const act of rawActions) {
    const ev = act?.event;
    if (!ev || typeof ev !== 'object') continue;

    if (act.type === 'update' || act.type === 'delete') {
      const target =
        (ev.id && events.find((e) => e.id === ev.id)) ||
        events.find((e) => e.title.toLowerCase() === String(ev.title || '').toLowerCase());
      if (!target) {
        infos.push(`I couldn't find "${ev.title || 'that event'}" on your calendar, so I left it unchanged.`);
        continue;
      }

      if (act.type === 'delete') {
        working = working.filter((e) => e.id !== target.id);
        out.push({ type: 'delete', event: target, reason: act.reason });
        continue;
      }

      const startDate = normalizeDate(ev.startDate || target.startDate, todayStr);
      const merged: CalendarEventPayload = {
        ...target,
        ...ev,
        id: target.id,
        startDate,
        endDate: normalizeDate(ev.endDate || startDate, todayStr),
        startTime: normalizeTime(ev.startTime || target.startTime),
        endTime: normalizeTime(ev.endTime || target.endTime),
      };
      const s = timeToMinutes(merged.startTime);
      const e = timeToMinutes(merged.endTime);
      const conflict = merged.startDate === merged.endDate ? findConflict(working, merged.startDate, s, e, target.id) : undefined;
      if (conflict) {
        const alts = suggestAlternatives(working, merged.startDate, Math.max(e - s, 15), s, target.id);
        warn(
          `"${merged.title}" now overlaps with "${conflict.title}" (${format12h(conflict.startTime)} – ${format12h(conflict.endTime)}).` +
            (alts.length ? ` Open alternatives: ${alts.join('; ')}.` : '')
        );
      }
      working = working.map((x) => (x.id === target.id ? merged : x));
      out.push({ type: 'update', event: merged, reason: act.reason });
      continue;
    }

    if (act.type !== 'schedule') continue;

    const startDate = normalizeDate(ev.startDate, todayStr);
    const endDate = normalizeDate(ev.endDate || startDate, todayStr);
    let startTime = normalizeTime(ev.startTime);
    let endTime = normalizeTime(ev.endTime);
    let duration = Number(act.durationMinutes) > 0 ? Math.floor(Number(act.durationMinutes)) : timeToMinutes(endTime) - timeToMinutes(startTime);
    if (!(duration > 0)) duration = 30;

    let firstDate = startDate;
    let firstEndDate = endDate;
    if (act.autoFindSlot) {
      // Never book in the past: start no earlier than today, and no earlier than now (rounded up to 15 min) if today
      const searchDate = startDate < todayStr ? todayStr : startDate;
      const from = ev.startTime ? timeToMinutes(startTime) : WORK_START;
      const notBefore = searchDate === todayStr ? Math.ceil(nowMinutes / 15) * 15 : 0;
      const slot = findSlotAcrossDays(working, searchDate, duration, Math.max(from, WORK_START, notBefore));
      if (!slot) {
        infos.push(`I couldn't find a free ${duration}-minute slot for "${ev.title}" in the next 7 days.`);
        continue;
      }
      firstDate = slot.date;
      firstEndDate = slot.date;
      startTime = slot.startTime;
      endTime = slot.endTime;
      infos.push(
        `Booked **${ev.title}** on **${DAY_NAMES[dayOfWeek(slot.date)]} ${slot.date}**, ${format12h(slot.startTime)} – ${format12h(slot.endTime)}.`
      );
    }

    const rec: Recurrence | undefined =
      act.recurrence && ['daily', 'weekly', 'monthly'].includes(act.recurrence.frequency) ? act.recurrence : undefined;
    const occurrences = rec ? expandRecurrence(firstDate, firstEndDate, rec) : [{ startDate: firstDate, endDate: firstEndDate }];
    if (rec && occurrences.length > 1) {
      infos.push(
        `Created **${occurrences.length}** occurrences of **${ev.title}** (${occurrences[0].startDate} → ${occurrences[occurrences.length - 1].startDate}).`
      );
    }

    for (const occ of occurrences) {
      const s = timeToMinutes(startTime);
      const e = timeToMinutes(endTime);
      const newEvent: CalendarEventPayload = {
        title: ev.title,
        startDate: occ.startDate,
        startTime,
        endDate: occ.endDate,
        endTime,
        category: ev.category,
        description: ev.description,
        location: ev.location,
        attendees: ev.attendees,
      };
      if (occ.startDate === occ.endDate) {
        const conflict = findConflict(working, occ.startDate, s, e);
        if (conflict) {
          const alts = suggestAlternatives(working, occ.startDate, e - s, s);
          warn(
            `"${ev.title}" on ${occ.startDate} overlaps with "${conflict.title}" (${format12h(conflict.startTime)} – ${format12h(conflict.endTime)}).` +
              (alts.length ? ` Open alternatives: ${alts.join('; ')}.` : '')
          );
        }
      }
      working.push(newEvent);
      out.push({ type: 'schedule', event: newEvent, reason: act.reason });
    }
  }

  if (extraConflicts > 0) warnings.push(`…and ${extraConflicts} more conflict${extraConflicts === 1 ? '' : 's'}.`);
  return {
    actions: out,
    conflictWarning: warnings.length > 0 ? warnings.join('\n') : undefined,
    notes: infos,
  };
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
  const todayDate = currentDateTime.split('T')[0];

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
  }

  if (lower.includes('tomorrow')) {
    targetDate = addDays(todayDate, 1);
    targetDayLabel = 'Tomorrow';
  } else {
    if (!explicitDate) {
      for (const [dayName, targetDayNum] of Object.entries(dayOfWeekMap)) {
        if (lower.includes(dayName)) {
          targetDayLabel = dayName.charAt(0).toUpperCase() + dayName.slice(1);
          let diff = targetDayNum - dayOfWeek(todayDate);
          if (diff < 0) diff += 7;
          targetDate = addDays(todayDate, diff);
          break;
        }
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
      const alts = suggestAlternatives(events, targetDate, endMins - startMins, startMins);
      conflictWarning = `Note: This overlaps with "${conflict.title}" (${format12h(conflict.startTime)} – ${format12h(conflict.endTime)}).${
        alts.length ? ` Open alternatives: ${alts.join('; ')}.` : ''
      }`;
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

  // 3. CANCEL / DELETE — use word-aware match to avoid "cancel lunch" deleting "Team Lunch planning session"
  if (lower.includes('cancel') || lower.includes('delete') || lower.includes('remove')) {
    const target = events.find((e) => {
      const t = e.title.toLowerCase();
      // Accept if the title appears as a contiguous word-boundary match in the message
      return new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(lower) || lower.includes(t);
    });
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

// ---------------------------------------------------------------------------
// Weather  (Open-Meteo – free, no API key required, HTTPS only)
// ---------------------------------------------------------------------------
const WEATHER_TIMEOUT_MS = 7000;
const WEATHER_CACHE_MS = 10 * 60 * 1000; // 10 minutes
const FORECAST_DAYS = 16;

// Matches messages that are clearly weather-related (so we don't fetch for every chat).
const WEATHER_KEYWORDS =
  /\b(weather|forecast|rain|raining|rainy|snow|snowy|storm|stormy|sunny|cloudy|windy|wind|temperature|temp|umbrella|jacket|coat|picnic|outdoor|outdoors|hike|hiking|bbq|barbecue|beach|humid|drizzle|thunder|lightning|hot|cold|warm|cool|freezing)\b/i;

// WMO weather-code descriptions
const WMO_CODES: Record<number, string> = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Depositing rime fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  56: 'Light freezing drizzle', 57: 'Heavy freezing drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
  66: 'Light freezing rain', 67: 'Heavy freezing rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Light showers', 81: 'Rain showers', 82: 'Violent rain showers',
  85: 'Snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm + hail', 99: 'Thunderstorm + heavy hail',
};

interface GeoPlace { name: string; latitude: number; longitude: number; timezone: string }
interface DayForecast {
  date: string; weekday: string; conditions: string;
  tempMaxF: number; tempMinF: number;
  tempMaxC: number; tempMinC: number;
  rainChancePct: number; precipInch: number; precipMm: number;
  windMph: number; windKph: number;
  dryWindows: string[]; // 08:00–20:00 gaps of ≥2 h with ≤30 % rain chance
}
interface WeatherForecast { place: string; days: DayForecast[] }

// Simple in-process caches — safe for a single-server prototype
const geoCache = new Map<string, GeoPlace | null>();
const forecastCache = new Map<string, { at: number; data: WeatherForecast }>();

function cityFromMessage(msg: string): string | null {
  // "...in Seattle", "...for New York", "...near Austin" – first capitalised word(s)
  const SKIP = new Set([
    ...DAY_NAMES, 'Today', 'Tomorrow', 'Tonight',
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
    'The', 'My', 'A', 'An', 'Is', 'Will', 'Do',
  ]);
  const m = msg.match(/\b(?:in|for|near|around)\s+([A-Z][\p{L}.'\-]*(?:\s+[A-Z][\p{L}.'\-]*){0,2})/u);
  if (!m) return null;
  const words = m[1].split(/\s+/).filter((w) => !SKIP.has(w));
  const city = words.join(' ').trim();
  return city.length >= 2 && city.length <= 60 ? city : null;
}

function cityFromTimezone(tz: string): string | null {
  const parts = (tz || '').split('/');
  if (parts.length < 2) return null;
  return parts[parts.length - 1].replace(/_/g, ' ');
}

async function geocodeByName(name: string): Promise<GeoPlace | null> {
  const key = name.toLowerCase().trim();
  if (geoCache.has(key)) return geoCache.get(key)!;
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=en&format=json`;
    const r = await fetch(url, { signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS) });
    if (!r.ok) { geoCache.set(key, null); return null; }
    const p = ((await r.json()) as any)?.results?.[0];
    const place: GeoPlace | null =
      p && typeof p.latitude === 'number' && typeof p.longitude === 'number'
        ? { name: [p.name, p.admin1].filter(Boolean).join(', '), latitude: p.latitude, longitude: p.longitude, timezone: p.timezone || 'UTC' }
        : null;
    geoCache.set(key, place);
    return place;
  } catch { geoCache.set(key, null); return null; }
}

async function geocodeByCoords(lat: number, lon: number, tz: string): Promise<GeoPlace> {
  // Reverse-geocode via Open-Meteo's geocoding API isn't available, so we use the
  // timezone city name as a friendly label and trust the supplied coordinates directly.
  const label = cityFromTimezone(tz) || `${lat.toFixed(2)},${lon.toFixed(2)}`;
  return { name: label, latitude: lat, longitude: lon, timezone: tz };
}

function buildDryWindows(hourly: any, date: string): string[] {
  const windows: string[] = [];
  let start = -1;
  for (let h = 8; h <= 20; h++) {
    const idx = hourly.time.findIndex((t: string) => t === `${date}T${String(h).padStart(2, '0')}:00`);
    const prob: number | null = idx >= 0 ? hourly.precipitation_probability[idx] : null;
    const dry = h < 20 && typeof prob === 'number' && prob <= 30;
    if (dry && start < 0) start = h;
    if (!dry && start >= 0) {
      if (h - start >= 2) windows.push(`${String(start).padStart(2, '0')}:00–${String(h).padStart(2, '0')}:00`);
      start = -1;
    }
  }
  return windows;
}

async function fetchForecast(place: GeoPlace): Promise<WeatherForecast | null> {
  const cacheKey = `${place.latitude.toFixed(2)},${place.longitude.toFixed(2)}`;
  const hit = forecastCache.get(cacheKey);
  if (hit && Date.now() - hit.at < WEATHER_CACHE_MS) return hit.data;

  try {
    const q = new URLSearchParams({
      latitude: String(place.latitude),
      longitude: String(place.longitude),
      // Request both unit systems so the model/user can choose
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max',
      daily_variable_additional: 'temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max',
      hourly: 'precipitation_probability',
      timezone: 'auto',
      forecast_days: String(FORECAST_DAYS),
      // Fetch both unit systems in parallel would require two calls; instead we fetch metric
      // and convert in JS — simpler and avoids an extra HTTP round-trip.
    });
    const url = `https://api.open-meteo.com/v1/forecast?${q}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS) });
    if (!r.ok) return null;
    const d: any = await r.json();
    if (!Array.isArray(d?.daily?.time)) return null;

    const days: DayForecast[] = d.daily.time.map((date: string, i: number) => {
      const tMaxC = Math.round(d.daily.temperature_2m_max[i] ?? 0);
      const tMinC = Math.round(d.daily.temperature_2m_min[i] ?? 0);
      const precipMm = Math.round((d.daily.precipitation_sum[i] ?? 0) * 10) / 10;
      const windKph = Math.round(d.daily.wind_speed_10m_max[i] ?? 0);
      return {
        date,
        weekday: DAY_NAMES[dayOfWeek(date)],
        conditions: WMO_CODES[d.daily.weather_code[i]] ?? 'Unknown',
        tempMaxC: tMaxC, tempMinC: tMinC,
        tempMaxF: Math.round(tMaxC * 9 / 5 + 32), tempMinF: Math.round(tMinC * 9 / 5 + 32),
        rainChancePct: d.daily.precipitation_probability_max[i] ?? 0,
        precipMm,
        precipInch: Math.round(precipMm / 25.4 * 100) / 100,
        windKph,
        windMph: Math.round(windKph / 1.609),
        dryWindows: buildDryWindows(d.hourly, date),
      };
    });

    const data: WeatherForecast = { place: place.name, days };
    forecastCache.set(cacheKey, { at: Date.now(), data });
    return data;
  } catch { return null; }
}

// Resolve the best available forecast for a given request.
// Priority: browser coords > city in message > WEATHER_LOCATION env var > timezone city.
async function resolveForecast(
  msg: string,
  timeZone: string,
  lat?: number,
  lon?: number,
): Promise<WeatherForecast | null> {
  const places: Array<() => Promise<GeoPlace | null>> = [];

  if (typeof lat === 'number' && typeof lon === 'number' && isFinite(lat) && isFinite(lon)) {
    places.push(async () => geocodeByCoords(lat, lon, timeZone));
  }
  const cityInMsg = cityFromMessage(msg);
  if (cityInMsg) places.push(() => geocodeByName(cityInMsg));
  const envCity = process.env.WEATHER_LOCATION?.trim();
  if (envCity) places.push(() => geocodeByName(envCity));
  const tzCity = cityFromTimezone(timeZone);
  if (tzCity) places.push(() => geocodeByName(tzCity));

  for (const getPlace of places) {
    const place = await getPlace();
    if (!place) continue;
    const forecast = await fetchForecast(place);
    if (forecast) return forecast;
  }
  return null;
}

// Plain-English fallback weather answer (used when Gemini is unavailable).
function weatherReplyOffline(w: WeatherForecast, targetDate: string, dayLabel: string, imperial: boolean): string {
  const day = w.days.find((x) => x.date === targetDate);
  if (!day) {
    const first = w.days[0]?.date ?? '?';
    const last = w.days[w.days.length - 1]?.date ?? '?';
    return `I only have forecasts from **${first}** to **${last}** — **${targetDate}** is outside that range. Try asking about a date within the next ${FORECAST_DAYS} days.`;
  }
  const tempHigh = imperial ? `${day.tempMaxF}°F` : `${day.tempMaxC}°C`;
  const tempLow  = imperial ? `${day.tempMinF}°F` : `${day.tempMinC}°C`;
  const wind     = imperial ? `${day.windMph} mph` : `${day.windKph} km/h`;
  const precip   = imperial ? `${day.precipInch} in` : `${day.precipMm} mm`;
  const rain = day.rainChancePct;
  const verdict =
    rain <= 20 && day.windMph <= 20
      ? '✅ Looks great for outdoor plans!'
      : rain > 40
        ? `🌧️ Rain is likely (${rain}%) — bring an umbrella or have a backup plan.`
        : rain > 20
          ? `⛅ There's a ${rain}% chance of rain — worth keeping an eye on.`
          : `💨 It will be windy (up to ${wind}) — plan accordingly.`;
  const dryNote = day.dryWindows.length
    ? `\n\n🌤️ **Dry windows today (≤30% rain):** ${day.dryWindows.join(', ')}`
    : '';
  return (
    `**${day.weekday}, ${targetDate}** in **${w.place}**\n` +
    `${day.conditions} · ${tempLow}–${tempHigh} · ${rain}% rain · ${precip} · Wind ${wind}\n\n` +
    `${verdict}${dryNote}`
  );
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

  // Weather proxy endpoint — called by the browser after it receives GPS coords.
  // The browser can't call Open-Meteo directly with a city name, so it sends coords here.
  app.post('/api/weather', async (req, res) => {
    const { latitude, longitude, timeZone = 'UTC' } = req.body as { latitude?: number; longitude?: number; timeZone?: string };
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return res.status(400).json({ error: 'latitude and longitude are required' });
    }
    const place = await geocodeByCoords(latitude, longitude, timeZone);
    const forecast = await fetchForecast(place);
    if (!forecast) return res.status(503).json({ error: 'Forecast unavailable' });
    return res.json(forecast);
  });

  // Calendar AI Assistant Endpoint
  app.post('/api/calendar/chat', async (req, res) => {
    const { messages = [], events = [], currentDateTime, timeZone = 'UTC', latitude, longitude } = req.body as ChatRequestBody;
    const { todayStr, nowMinutes, iso: nowIso } = resolveNow(currentDateTime, timeZone);
    const latestUserMessage = messages[messages.length - 1]?.content || '';
    const imperial = timeZone.startsWith('America/') || timeZone.startsWith('Pacific/Honolulu');

    // Fetch weather only for weather-related messages (keeps non-weather chat fast)
    const weather = WEATHER_KEYWORDS.test(latestUserMessage)
      ? await resolveForecast(latestUserMessage, timeZone, latitude, longitude)
      : null;
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

        const systemInstruction = `You are Daylie AI, an executive AI calendar assistant.
Current Date: ${todayStr} (${DAY_NAMES[dayOfWeek(todayStr)]}). Current local time: ${minutesToTime(nowMinutes)} (Reference: ${nowIso}, Timezone: ${timeZone}).
Never schedule anything in the past: events today must start after the current time, and "tomorrow", "next Monday" etc. are relative to the current date above.
Working hours: ${preferences.workdayStart}-${preferences.workdayEnd}; available weekdays: ${preferences.workDays.join(', ')}.

Current Calendar Events (each has an "id"):
${JSON.stringify(events, null, 2)}

Pre-computed load for the next 7 days (use this for summaries and insights; do not recompute):
${JSON.stringify(buildScheduleInsights(events, todayStr), null, 2)}
${weather ? `
Weather forecast for ${weather.place} (both °C/°F, mm/in, km/h/mph provided — use ${imperial ? '°F, in, mph' : '°C, mm, km/h'} in your reply):
${JSON.stringify(weather.days, null, 2)}
` : ''}
Your Capabilities:
1. Answer queries about the user's schedule (e.g. "what meetings do I have on tuesday?").
2. Schedule events (action type "schedule"), including recurring ones and "find me a slot" requests.
3. Update or reschedule existing events (action type "update").
4. Cancel/delete events (action type "delete").
5. Bulk operations: emit one action per affected event (e.g. "cancel everything on Friday" -> one "delete" per event that day; "move everything on Monday to Tuesday" -> one "update" per event).
6. Daily/weekly summaries and insights: workload, back-to-back meetings, focus time, and the best free blocks.
7. Weather questions (e.g. "will it rain on Tuesday?", "is it good weather for a picnic on Saturday?").

Rules:
- If scheduling "call with Rob at 4:30", set title: "Call with Rob", startDate: "${todayStr}", startTime: "16:30", endDate: "${todayStr}", endTime: "17:00", category: "call", attendees: ["Rob"].
- Default duration is 30 minutes if unspecified.
- Output times strictly in 24-hour format HH:MM. Output dates in YYYY-MM-DD format.
- For update and delete, always copy the exact "id" of the existing event. For update, include the full new date/time values.
- If the user gives no time or asks you to find/pick the best time, set "autoFindSlot": true and "durationMinutes"; set startDate to the earliest acceptable day and startTime to the earliest acceptable time (or "09:00"). The server picks the first free slot in working hours.
- For recurring requests ("every Monday at 9"), emit ONE schedule action for the first occurrence on or after today and set "recurrence" (frequency daily|weekly|monthly, interval, daysOfWeek with 0=Sunday..6=Saturday, and count or until). Do not emit one action per occurrence.
- The server detects conflicts and computes alternatives. Do not claim a slot is free if it overlaps an existing event; mention conflicts in your reply and offer alternatives.
- Weather: answer ONLY from the forecast data provided above. Never invent weather data. If no forecast is present, say so and suggest the user enable location access. State the place name used. For outdoor plans, recommend a specific time slot by cross-referencing dryWindows with the user's free calendar time. Only emit a schedule action if the user explicitly asks to book the time.
- Only describe changes that you actually emit as actions. For pure questions or summaries, return an empty actions array.
- When suggesting open times, honor these scheduling preferences: ${JSON.stringify(preferences)}. Check all existing events and include the configured buffer around busy times.
- Never create a scheduled event unless the user specified its exact date. If they provide only a weekday or no date, ask which calendar date they mean rather than guessing. Use the chat history to combine their answer with the original event details.
`;

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
          const candidateModels = [
            'gemini-3.8-flash',
            'gemini-3.6-flash',
            'gemini-3-flash-preview',
            'gemini-3.1-flash-lite',
            'gemini-flash-latest',
          ];
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
                            type: {
                              type: Type.STRING,
                              enum: ['schedule', 'update', 'delete'],
                              description: 'schedule, update, or delete',
                            },
                            autoFindSlot: {
                              type: Type.BOOLEAN,
                              description: 'schedule only: let the server pick the first free slot in working hours.',
                            },
                            durationMinutes: {
                              type: Type.INTEGER,
                              description: 'schedule only: event length in minutes, used with autoFindSlot.',
                            },
                            recurrence: {
                              type: Type.OBJECT,
                              description: 'schedule only: repeat rule for recurring events.',
                              properties: {
                                frequency: { type: Type.STRING, description: 'daily, weekly, or monthly' },
                                interval: { type: Type.INTEGER },
                                daysOfWeek: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                                count: { type: Type.INTEGER },
                                until: { type: Type.STRING, description: 'YYYY-MM-DD' },
                              },
                              required: ['frequency'],
                            },
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
                const processed = processModelActions(Array.isArray(parsed.actions) ? parsed.actions : [], events, todayStr, nowMinutes);
                const reply = [parsed.reply, ...processed.notes].filter(Boolean).join('\n\n');
                return res.json({
                  reply,
                  actions: processed.actions,
                  conflictWarning: processed.conflictWarning || parsed.conflictWarning || undefined,
                });
              }
            } catch (modelErr: any) {
              // Try next model candidate
              const status = String(modelErr?.message || '').match(/"code":(\d+)/)?.[1] || 'unknown';
              console.info(`Model ${model} unavailable (HTTP ${status}), trying next.`);
            }
          }
        }
      } catch (err: any) {
        console.info('Using local calendar engine fallback.');
      }
    }

    // Seamless fallback to natural language calendar engine
    // If the message is weather-related and we have a forecast, answer it directly.
    if (weather && WEATHER_KEYWORDS.test(latestUserMessage)) {
      // Determine the target date from the message (reuse the same logic the calendar engine uses)
      const lower = latestUserMessage.toLowerCase();
      let targetDate = todayStr;
      let targetLabel = 'Today';
      if (lower.includes('tomorrow')) {
        targetDate = addDays(todayStr, 1);
        targetLabel = 'Tomorrow';
      } else {
        const dayMap: Record<string, number> = { sunday:0,monday:1,tuesday:2,wednesday:3,thursday:4,friday:5,saturday:6 };
        for (const [name, num] of Object.entries(dayMap)) {
          if (lower.includes(name)) {
            let diff = num - dayOfWeek(todayStr);
            if (diff <= 0) diff += 7;
            targetDate = addDays(todayStr, diff);
            targetLabel = name[0].toUpperCase() + name.slice(1);
            break;
          }
        }
      }
      return res.json({ reply: weatherReplyOffline(weather, targetDate, targetLabel, imperial), actions: [] });
    }
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

  app.listen(PORT, '127.0.0.1', () => {
    console.log(`🚀 Chronos AI Server running on http://127.0.0.1:${PORT}`);
  });
}

startServer().catch((err) => {
  console.warn('Server startup caught:', err);
});
