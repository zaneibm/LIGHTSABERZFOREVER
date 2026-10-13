import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

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
}

function timeToMinutes(time24: string): number {
  const [h, m] = (time24 || '00:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
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

  if (lower.includes('tomorrow')) {
    targetDate = addDays(todayDate, 1);
    targetDayLabel = 'Tomorrow';
  } else {
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
    // Extract time
    let startTime = '16:30';
    let endTime = '17:00';

    // Regex for time like 4:30, 4:30pm, 4pm, 10:00, 10am, 16:30
    const timeMatch = prompt.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
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
    let title = 'Meeting';
    let category = 'meeting';
    let attendees: string[] = [];

    if (lower.includes('with rob')) {
      title = 'Call with Rob';
      category = 'call';
      attendees = ['Rob'];
    } else if (lower.includes('call')) {
      category = 'call';
      const withMatch = prompt.match(/with\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/i);
      if (withMatch) {
        title = `Call with ${withMatch[1]}`;
        attendees = [withMatch[1]];
      } else {
        title = 'Phone Call';
      }
    } else if (lower.includes('focus')) {
      title = 'Focus Time';
      category = 'focus';
    } else if (lower.includes('lunch')) {
      title = 'Lunch';
      category = 'personal';
    } else if (lower.includes('standup')) {
      title = 'Standup';
      category = 'meeting';
    } else {
      const cleanTitle = prompt
        .replace(/schedule\s+(?:a\s+)?/i, '')
        .replace(/book\s+(?:a\s+)?/i, '')
        .replace(/add\s+(?:a\s+)?/i, '')
        .replace(/\bat\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?/i, '')
        .replace(/\bon\s+\w+/i, '')
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
    reply: `I'm here to help manage your schedule! You can ask:\n\n• **"What meetings do I have on tuesday?"**\n• **"Schedule a call with Rob at 4:30"**\n• **"Book 2 hours of focus time tomorrow"**\n• **"Show my schedule for today"**`,
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
    const { todayStr, nowMinutes, iso: nowIso } = resolveNow(currentDateTime, timeZone);
    const latestUserMessage = messages[messages.length - 1]?.content || '';

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
Current Date: ${todayStr} (${DAY_NAMES[dayOfWeek(todayStr)]}). Current local time: ${minutesToTime(nowMinutes)} (Reference: ${nowIso}, Timezone: ${timeZone}).
Never schedule anything in the past: events today must start after the current time, and "tomorrow", "next Monday" etc. are relative to the current date above.
Working hours: 09:00-18:00, Monday-Friday.

Current Calendar Events (each has an "id"):
${JSON.stringify(events, null, 2)}

Pre-computed load for the next 7 days (use this for summaries and insights; do not recompute):
${JSON.stringify(buildScheduleInsights(events, todayStr), null, 2)}

Your Capabilities:
1. Answer queries about the user's schedule (e.g. "what meetings do I have on tuesday?").
2. Schedule events (action type "schedule"), including recurring ones and "find me a slot" requests.
3. Update or reschedule existing events (action type "update").
4. Cancel/delete events (action type "delete").
5. Bulk operations: emit one action per affected event (e.g. "cancel everything on Friday" -> one "delete" per event that day; "move everything on Monday to Tuesday" -> one "update" per event).
6. Daily/weekly summaries and insights: workload, back-to-back meetings, focus time, and the best free blocks, based on the pre-computed load above.

Rules:
- If scheduling "call with Rob at 4:30", set title: "Call with Rob", startDate: "${todayStr}", startTime: "16:30", endDate: "${todayStr}", endTime: "17:00", category: "call", attendees: ["Rob"].
- Default duration is 30 minutes if unspecified.
- Output times strictly in 24-hour format HH:MM. Output dates in YYYY-MM-DD format.
- For update and delete, always copy the exact "id" of the existing event. For update, include the full new date/time values.
- If the user gives no time or asks you to find/pick the best time, set "autoFindSlot": true and "durationMinutes"; set startDate to the earliest acceptable day and startTime to the earliest acceptable time (or "09:00"). The server picks the first free slot in working hours.
- For recurring requests ("every Monday at 9"), emit ONE schedule action for the first occurrence on or after today and set "recurrence" (frequency daily|weekly|monthly, interval, daysOfWeek with 0=Sunday..6=Saturday, and count or until). Do not emit one action per occurrence.
- The server detects conflicts and computes alternatives. Do not claim a slot is free if it overlaps an existing event; mention conflicts in your reply and offer alternatives.
- Only describe changes that you actually emit as actions. For pure questions or summaries, return an empty actions array.`;

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
    const fallbackResult = processNaturalLanguageCalendar(latestUserMessage, events, todayStr);
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
