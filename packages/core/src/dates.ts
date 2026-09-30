import {
  addDays,
  addMonths,
  addWeeks,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import type { DatedView } from './types.js';

/**
 * Calendar geometry: which days belong in which grid cell, and which range of
 * time a given view covers. Pure functions over `Date` — no UI, no units.
 *
 * Every function that needs "now" takes it as an argument rather than calling
 * `new Date()` internally, so the whole module is deterministic and testable.
 */

/** 0 = Sunday, 1 = Monday. Matches date-fns' `weekStartsOn`. */
export type WeekStart = 0 | 1;

export const DEFAULT_WEEK_START: WeekStart = 1;

/** Number of week rows in a month grid. Fixed at 6 so the grid never reflows. */
export const MONTH_GRID_WEEKS = 6;

export interface CalendarDay {
  date: Date;
  /** `yyyy-MM-dd` in local time — the key used to group events by day. */
  key: string;
  dayOfMonth: number;
  /** False for the leading/trailing days borrowed from adjacent months. */
  inMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
}

/** Local-time day key. Used as a map key, never for storage. */
export function dayKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

function toCalendarDay(date: Date, monthAnchor: Date, today: Date): CalendarDay {
  const weekday = date.getDay();
  return {
    date,
    key: dayKey(date),
    dayOfMonth: date.getDate(),
    inMonth: isSameMonth(date, monthAnchor),
    isToday: isSameDay(date, today),
    isWeekend: weekday === 0 || weekday === 6,
  };
}

/**
 * The month grid as 6 rows of 7 days, padded with days from the previous and
 * next month so every row is full.
 */
export function getMonthGrid(
  date: Date,
  today: Date = new Date(),
  weekStartsOn: WeekStart = DEFAULT_WEEK_START,
): CalendarDay[][] {
  const gridStart = startOfWeek(startOfMonth(date), { weekStartsOn });
  const weeks: CalendarDay[][] = [];

  for (let week = 0; week < MONTH_GRID_WEEKS; week++) {
    const row: CalendarDay[] = [];
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const cursor = addDays(gridStart, week * 7 + dayOffset);
      row.push(toCalendarDay(cursor, date, today));
    }
    weeks.push(row);
  }

  return weeks;
}

/**
 * How many days the `3day` view shows and pages by. One constant rather than a
 * 3 repeated across the range, the label and the columns — those three have to
 * agree or the view pages over days it never showed.
 */
export const THREE_DAY_SPAN = 3;

/** `count` consecutive days starting at `date`. The `3day` view's columns. */
export function getDayRun(
  date: Date,
  count: number,
  today: Date = new Date(),
): CalendarDay[] {
  const first = startOfDay(date);
  return Array.from({ length: count }, (_, i) => {
    const cursor = addDays(first, i);
    // `monthAnchor` is the day itself: a run of days isn't anchored to one
    // month, so no day in it is "borrowed" the way a month grid's padding is.
    return toCalendarDay(cursor, cursor, today);
  });
}

/** The 7 days of the week containing `date`. */
export function getWeekDays(
  date: Date,
  today: Date = new Date(),
  weekStartsOn: WeekStart = DEFAULT_WEEK_START,
): CalendarDay[] {
  const weekStart = startOfWeek(date, { weekStartsOn });
  return Array.from({ length: 7 }, (_, i) => {
    const cursor = addDays(weekStart, i);
    return toCalendarDay(cursor, cursor, today);
  });
}

/** Weekday column headings, e.g. `['Mon', 'Tue', ...]`. */
export function getWeekdayNames(weekStartsOn: WeekStart = DEFAULT_WEEK_START): string[] {
  const anchor = startOfWeek(new Date(2024, 0, 1), { weekStartsOn });
  return Array.from({ length: 7 }, (_, i) => format(addDays(anchor, i), 'EEE'));
}

/** Hour labels for the time gutter, from `startHour` up to and including `endHour`. */
export function getHourSlots(startHour = 0, endHour = 23): { hour: number; label: string }[] {
  const slots: { hour: number; label: string }[] = [];
  for (let hour = startHour; hour <= endHour; hour++) {
    slots.push({
      hour,
      label: format(new Date(2024, 0, 1, hour), 'HH:mm'),
    });
  }
  return slots;
}

/**
 * The half-open instant range a view covers, used as the `from`/`to` query for
 * fetching events. Month and agenda fetch the whole visible grid (including the
 * padding days) so events on those cells are not missing.
 */
export function getViewRange(
  date: Date,
  view: DatedView,
  weekStartsOn: WeekStart = DEFAULT_WEEK_START,
): { from: Date; to: Date } {
  switch (view) {
    case 'month':
    case 'agenda': {
      const gridStart = startOfWeek(startOfMonth(date), { weekStartsOn });
      return {
        from: gridStart,
        to: endOfDay(addDays(gridStart, MONTH_GRID_WEEKS * 7 - 1)),
      };
    }
    case 'week':
      return {
        from: startOfWeek(date, { weekStartsOn }),
        to: endOfWeek(date, { weekStartsOn }),
      };
    case '3day':
      // Anchored on the date itself rather than snapped to a week boundary —
      // the run starts where you are, and a run of three often straddles two
      // weeks, so the containing week is not a range that would cover it.
      return { from: startOfDay(date), to: endOfDay(addDays(date, THREE_DAY_SPAN - 1)) };
    case 'day':
      return { from: startOfDay(date), to: endOfDay(date) };
  }
}

/** Step the anchor date forward or backward by one period of the active view. */
export function navigate(date: Date, view: DatedView, direction: 1 | -1): Date {
  switch (view) {
    case 'month':
    case 'agenda':
      return addMonths(date, direction);
    case 'week':
      return addWeeks(date, direction);
    case '3day':
      return addDays(date, THREE_DAY_SPAN * direction);
    case 'day':
      return addDays(date, direction);
  }
}

/** Heading text for the current period, e.g. `September 2026` or `15 – 21 Sep 2026`. */
export function formatPeriodLabel(
  date: Date,
  view: DatedView,
  weekStartsOn: WeekStart = DEFAULT_WEEK_START,
): string {
  switch (view) {
    case 'month':
    case 'agenda':
      return format(date, 'MMMM yyyy');
    case 'day':
      return format(date, 'EEEE d MMMM yyyy');
    case 'week':
      return formatSpan(
        startOfWeek(date, { weekStartsOn }),
        endOfWeek(date, { weekStartsOn }),
      );
    case '3day':
      return formatSpan(date, addDays(date, THREE_DAY_SPAN - 1));
  }
}

/** `15 – 21 Sep 2026`, dropping the first month when both ends share one. */
function formatSpan(start: Date, end: Date): string {
  if (isSameMonth(start, end)) {
    return `${format(start, 'd')} – ${format(end, 'd MMM yyyy')}`;
  }
  return `${format(start, 'd MMM')} – ${format(end, 'd MMM yyyy')}`;
}

/** Where `now` sits within the day, as a 0–1 fraction. Drives the time indicator. */
export function fractionOfDay(instant: Date): number {
  const minutes = instant.getHours() * 60 + instant.getMinutes();
  return minutes / (24 * 60);
}

/** Re-exported so callers don't need date-fns directly for the common cases. */
export { startOfDay, endOfDay, startOfMonth, endOfMonth, isSameDay, format };
