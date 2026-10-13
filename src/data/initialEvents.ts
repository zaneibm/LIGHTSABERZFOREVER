import { CalendarEvent } from '../types/calendar';
import { SEED_REFERENCE_DATE, addDaysToDateStr, daysBetween, parseDate } from '../utils/dateUtils';

// Seed events are written for the week of SEED_REFERENCE_DATE (Tue Oct 13, 2026).
const SEED_EVENTS: CalendarEvent[] = [
  // Tuesday of the seed week
  {
    id: 'evt-tue-1',
    title: 'Morning Engineering Standup',
    startDate: '2026-10-13',
    startTime: '09:00',
    endDate: '2026-10-13',
    endTime: '09:30',
    category: 'meeting',
    description: 'Daily team sync on blockers, releases, and sprint progress.',
    attendees: ['Elena Rostova', 'Dev Team'],
    location: 'Google Meet',
    color: '#3b82f6',
  },
  {
    id: 'evt-tue-2',
    title: 'Q4 Product Roadmap Strategy',
    startDate: '2026-10-13',
    startTime: '10:00',
    endDate: '2026-10-13',
    endTime: '11:00',
    category: 'meeting',
    description: 'Finalize core milestones for Q4 product launch and AI features.',
    attendees: ['Sarah Jenkins', 'Marcus Chen'],
    location: 'Room 402 / Meet',
    color: '#6366f1',
  },
  {
    id: 'evt-tue-3',
    title: 'Product Design System Review',
    startDate: '2026-10-13',
    startTime: '14:00',
    endDate: '2026-10-13',
    endTime: '14:45',
    category: 'meeting',
    description: 'Reviewing component tokens, calendar interaction specs, and accessibility.',
    attendees: ['Maya Patel', 'UX Guild'],
    location: 'Design Studio B',
    color: '#8b5cf6',
  },
  {
    id: 'evt-tue-4',
    title: 'Budget & Hiring Sync',
    startDate: '2026-10-13',
    startTime: '15:30',
    endDate: '2026-10-13',
    endTime: '16:00',
    category: 'meeting',
    description: 'Reviewing quarterly headcount requests and cloud infra spending.',
    attendees: ['Finance Team', 'VP Eng'],
    location: 'Virtual',
    color: '#ec4899',
  },

  // Wednesday, October 14, 2026
  {
    id: 'evt-wed-1',
    title: 'Enterprise Client Onboarding Call',
    startDate: '2026-10-14',
    startTime: '10:30',
    endDate: '2026-10-14',
    endTime: '11:30',
    category: 'call',
    description: 'Walkthrough of security controls and API integrations with Acme Corp.',
    attendees: ['Acme Execs', 'Customer Success'],
    location: 'Zoom',
    color: '#10b981',
  },
  {
    id: 'evt-wed-2',
    title: 'Deep Work: Calendar Architecture',
    startDate: '2026-10-14',
    startTime: '13:00',
    endDate: '2026-10-14',
    endTime: '15:00',
    category: 'focus',
    description: 'Uninterrupted focus time for drafting database schemas and event indexing.',
    attendees: [],
    location: 'Focus Mode (DND)',
    color: '#a855f7',
  },

  // Thursday, October 15, 2026
  {
    id: 'evt-thu-1',
    title: '1:1 Sync with Rob',
    startDate: '2026-10-15',
    startTime: '11:00',
    endDate: '2026-10-15',
    endTime: '11:45',
    category: 'call',
    description: 'Bi-weekly career and project sync with Rob.',
    attendees: ['Rob Miller'],
    location: 'Coffee Shop or Meet',
    color: '#10b981',
  },
  {
    id: 'evt-thu-2',
    title: 'Engineering All-Hands',
    startDate: '2026-10-15',
    startTime: '15:00',
    endDate: '2026-10-15',
    endTime: '16:00',
    category: 'meeting',
    description: 'Company-wide engineering updates, lightning talks, and awards.',
    attendees: ['All Hands'],
    location: 'Main Auditorium & Stream',
    color: '#3b82f6',
  },

  // Friday, October 16, 2026
  {
    id: 'evt-fri-1',
    title: 'Sprint Retrospective & Demo',
    startDate: '2026-10-16',
    startTime: '14:00',
    endDate: '2026-10-16',
    endTime: '15:00',
    category: 'meeting',
    description: 'Sprint recap, what went well, what can be improved, and feature demos.',
    attendees: ['Scrum Team'],
    location: 'Virtual',
    color: '#3b82f6',
  },
  {
    id: 'evt-fri-2',
    title: 'Team Social & Board Games',
    startDate: '2026-10-16',
    startTime: '17:00',
    endDate: '2026-10-16',
    endTime: '18:30',
    category: 'personal',
    description: 'End of week celebration and relaxed team games.',
    attendees: ['Product & Eng Team'],
    location: 'Lounge Area',
    color: '#f59e0b',
  },
];

const weekStart = (dateStr: string) => addDaysToDateStr(dateStr, -parseDate(dateStr).getDay());

/** Seed schedule moved (in whole weeks, keeping weekdays) into the week containing `todayStr`. */
export function createInitialEvents(todayStr: string): CalendarEvent[] {
  const weeks = Math.floor(daysBetween(weekStart(SEED_REFERENCE_DATE), weekStart(todayStr)) / 7);
  if (weeks === 0) return SEED_EVENTS;
  return SEED_EVENTS.map((e) => ({
    ...e,
    startDate: addDaysToDateStr(e.startDate, weeks * 7),
    endDate: addDaysToDateStr(e.endDate, weeks * 7),
  }));
}
