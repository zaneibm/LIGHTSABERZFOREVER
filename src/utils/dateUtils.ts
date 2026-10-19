/**
 * Date utility functions for Chronos Calendar
 */

// Anchor date (a Tuesday) that the seed events in data/initialEvents.ts are written against.
// Not used as "today"; see useNow() for the real current date/time.
export const SEED_REFERENCE_DATE = '2026-10-13';

export function extractExplicitDate(prompt: string, referenceDate: string): string | null {
  const months = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
  ];
  const isoDate = prompt.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  const namedDate = prompt.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/i
  );

  let year: number;
  let month: number;
  let day: number;
  if (isoDate) {
    year = Number(isoDate[1]);
    month = Number(isoDate[2]);
    day = Number(isoDate[3]);
  } else if (namedDate) {
    const monthText = namedDate[1].replace('.', '').toLowerCase();
    month = months.findIndex((name) => name.startsWith(monthText.slice(0, 3))) + 1;
    day = Number(namedDate[2]);
    year = Number(namedDate[3] || referenceDate.slice(0, 4));
    if (!namedDate[3]) {
      const referenceMonth = Number(referenceDate.slice(5, 7));
      if (month < referenceMonth) year += 1;
    }
  } else {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    !Number.isFinite(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function getWeekdayDateConflict(prompt: string, referenceDate: string) {
  const weekday = prompt.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i)?.[1];
  const date = extractExplicitDate(prompt, referenceDate);
  if (!weekday || !date) return null;

  const requestedDate = new Date(`${date}T00:00:00Z`);
  const actualWeekday = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(requestedDate);
  if (actualWeekday.toLowerCase() === weekday.toLowerCase()) return null;

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const weekStart = new Date(requestedDate);
  weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
  const matchingWeekday = new Date(weekStart);
  matchingWeekday.setUTCDate(weekStart.getUTCDate() + dayNames.findIndex((day) => day.toLowerCase() === weekday.toLowerCase()));
  const formatOption = (optionDate: Date) => ({
    date: optionDate.toISOString().slice(0, 10),
    label: new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(optionDate),
  });
  const options = [formatOption(matchingWeekday), formatOption(requestedDate)];

  return {
    options,
    message: `The weekday and date don't match: ${date} is ${actualWeekday}. Which should I use?\n\n1. ${options[0].label}\n2. ${options[1].label}\n\nReply with the weekday or date.`,
  };
}

export function resolveWeekdayDateChoice(
  optionsMessage: string,
  answer: string,
  referenceDate: string
): string | null {
  if (!/\bweekday and date don't match\b/i.test(optionsMessage)) return null;

  const options = [...optionsMessage.matchAll(/^\d+\.\s+(.+)$/gm)]
    .map((match) => ({
      label: match[1],
      date: extractExplicitDate(match[1], referenceDate),
    }))
    .filter((option): option is { label: string; date: string } => option.date !== null);
  const answerDate = extractExplicitDate(answer, referenceDate);
  if (answerDate) return options.find((option) => option.date === answerDate)?.date || null;

  const weekday = answer.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i)?.[1]?.toLowerCase();
  if (weekday) return options.find((option) => option.label.toLowerCase().startsWith(weekday))?.date || null;

  const numberedChoice = answer.match(/^\s*([12])\s*$/)?.[1];
  return numberedChoice ? options[Number(numberedChoice) - 1]?.date || null : null;
}

export function getScheduledEventTitle(prompt: string): string | null {
  const attendee = getScheduledEventAttendee(prompt);

  if (/\bcall\b/i.test(prompt)) return attendee ? `Call with ${attendee}` : 'Phone Call';
  if (/\bmeeting\b/i.test(prompt)) return attendee ? `Meeting with ${attendee}` : 'Meeting';
  if (/\bfocus(?:\s+time)?\b/i.test(prompt)) return 'Focus Time';
  if (/\blunch\b/i.test(prompt)) return 'Lunch';
  if (/\bstand[\s-]?up\b/i.test(prompt)) return 'Standup';

  return null;
}

export function getScheduledEventAttendee(prompt: string): string | null {
  const attendeeMatch = prompt.match(
    /\bwith\s+([a-z][a-z'-]*(?:\s+(?!on\b|at\b|for\b|this\b|tomorrow\b|today\b|monday\b|tuesday\b|wednesday\b|thursday\b|friday\b|saturday\b|sunday\b)[a-z][a-z'-]*)?)/i
  );
  return attendeeMatch?.[1]
    .split(/\s+/)
    .map((name) => `${name.charAt(0).toUpperCase()}${name.slice(1).toLowerCase()}`)
    .join(' ') || null;
}

export function parseDate(dateStr: string): Date {
  // Safe parsing of YYYY-MM-DD
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

// Local wall-clock time with UTC offset, e.g. 2026-10-13T11:07:47-07:00
export function formatLocalIso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  return (
    `${formatDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

export function formatClockTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Whole days from a to b (b - a), ignoring time of day and DST shifts
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

export function addDaysToDateStr(dateStr: string, days: number): string {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

export function formatTime12h(time24: string): string {
  if (!time24) return '';
  const [hStr, mStr] = time24.split(':');
  let h = parseInt(hStr, 10);
  const m = mStr || '00';
  if (isNaN(h)) return time24;
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

export function formatTimeRange(startTime: string, endTime: string): string {
  return `${formatTime12h(startTime)} – ${formatTime12h(endTime)}`;
}

export function getMonthDays(year: number, month: number) {
  // Returns days array for full calendar grid (including leading/trailing padding)
  const firstDayOfMonth = new Date(year, month, 1);
  const startDayOfWeek = firstDayOfMonth.getDay(); // 0 is Sunday
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const totalDays = lastDayOfMonth.getDate();

  const days: Array<{
    dateStr: string;
    dayNumber: number;
    isCurrentMonth: boolean;
    date: Date;
  }> = [];

  // Previous month padding
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const dayNum = prevMonthLastDay - i;
    const date = new Date(year, month - 1, dayNum);
    days.push({
      dateStr: formatDate(date),
      dayNumber: dayNum,
      isCurrentMonth: false,
      date,
    });
  }

  // Current month
  for (let d = 1; d <= totalDays; d++) {
    const date = new Date(year, month, d);
    days.push({
      dateStr: formatDate(date),
      dayNumber: d,
      isCurrentMonth: true,
      date,
    });
  }

  // Next month padding to fill out 35 or 42 cells
  const remaining = (7 - (days.length % 7)) % 7;
  for (let d = 1; d <= remaining; d++) {
    const date = new Date(year, month + 1, d);
    days.push({
      dateStr: formatDate(date),
      dayNumber: d,
      isCurrentMonth: false,
      date,
    });
  }

  return days;
}

export function getWeekDays(centerDate: Date, todayStr: string) {
  const d = new Date(centerDate);
  const day = d.getDay();
  const diffToSunday = d.getDate() - day;

  const week: Array<{
    dateStr: string;
    dayName: string;
    dayNumber: number;
    date: Date;
    isToday: boolean;
  }> = [];

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  for (let i = 0; i < 7; i++) {
    const current = new Date(d.getFullYear(), d.getMonth(), diffToSunday + i);
    const dateStr = formatDate(current);
    week.push({
      dateStr,
      dayName: dayNames[i],
      dayNumber: current.getDate(),
      date: current,
      isToday: dateStr === todayStr,
    });
  }

  return week;
}

export function timeToMinutes(time24: string): number {
  const [h, m] = time24.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function checkOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean {
  const minA1 = timeToMinutes(startA);
  const minA2 = timeToMinutes(endA);
  const minB1 = timeToMinutes(startB);
  const minB2 = timeToMinutes(endB);
  return Math.max(minA1, minB1) < Math.min(minA2, minB2);
}

export function getCategoryBadge(category: string) {
  switch (category) {
    case 'meeting':
      return {
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        text: 'text-blue-600',
        dot: 'bg-blue-400',
        label: 'Meeting',
      };
    case 'call':
      return {
        bg: 'bg-emerald-50',
        border: 'border-emerald-200',
        text: 'text-emerald-600',
        dot: 'bg-emerald-400',
        label: 'Call',
      };
    case 'focus':
      return {
        bg: 'bg-violet-50',
        border: 'border-violet-200',
        text: 'text-violet-600',
        dot: 'bg-violet-400',
        label: 'Focus Time',
      };
    case 'personal':
      return {
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        text: 'text-amber-600',
        dot: 'bg-amber-400',
        label: 'Personal',
      };
    case 'work':
      return {
        bg: 'bg-indigo-50',
        border: 'border-indigo-200',
        text: 'text-indigo-600',
        dot: 'bg-indigo-400',
        label: 'Work',
      };
    default:
      return {
        bg: 'bg-gray-50',
        border: 'border-gray-200',
        text: 'text-gray-500',
        dot: 'bg-gray-400',
        label: 'Event',
      };
  }
}
