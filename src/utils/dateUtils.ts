/**
 * Date utility functions for Chronos Calendar
 */

// Anchor date (a Tuesday) that the seed events in data/initialEvents.ts are written against.
// Not used as "today"; see useNow() for the real current date/time.
export const SEED_REFERENCE_DATE = '2026-10-13';

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
        bg: 'bg-blue-500/15',
        border: 'border-blue-500/30',
        text: 'text-blue-400',
        dot: 'bg-blue-400',
        label: 'Meeting',
      };
    case 'call':
      return {
        bg: 'bg-emerald-500/15',
        border: 'border-emerald-500/30',
        text: 'text-emerald-400',
        dot: 'bg-emerald-400',
        label: 'Call',
      };
    case 'focus':
      return {
        bg: 'bg-purple-500/15',
        border: 'border-purple-500/30',
        text: 'text-purple-400',
        dot: 'bg-purple-400',
        label: 'Focus Time',
      };
    case 'personal':
      return {
        bg: 'bg-amber-500/15',
        border: 'border-amber-500/30',
        text: 'text-amber-400',
        dot: 'bg-amber-400',
        label: 'Personal',
      };
    case 'work':
      return {
        bg: 'bg-indigo-500/15',
        border: 'border-indigo-500/30',
        text: 'text-indigo-400',
        dot: 'bg-indigo-400',
        label: 'Work',
      };
    default:
      return {
        bg: 'bg-slate-500/15',
        border: 'border-slate-500/30',
        text: 'text-slate-400',
        dot: 'bg-slate-400',
        label: 'Event',
      };
  }
}
