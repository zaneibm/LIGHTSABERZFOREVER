/**
 * Date utility functions for Chronos Calendar
 */

// User current context reference: 2026-10-13 (Tuesday)
export const DEFAULT_REFERENCE_DATE = '2026-10-13';

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

export function getWeekDays(centerDate: Date) {
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
      isToday: dateStr === DEFAULT_REFERENCE_DATE,
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
