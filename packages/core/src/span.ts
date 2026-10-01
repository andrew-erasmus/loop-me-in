import { differenceInCalendarDays, startOfDay } from 'date-fns';
import type { CalendarDay } from './dates.js';
import type { CalendarEvent } from './types.js';

/**
 * Horizontal layout: which day columns an event covers across a run of
 * consecutive days, and how events that share columns stack vertically.
 *
 * This is the counterpart to `layout.ts`. That file answers "where does an
 * event sit on an hour axis"; this one answers "which days does it reach
 * across, and what does it sit above or below". It is what makes a Mon–Thu trip
 * read as one bar rather than four identical chips — `groupByDay` deliberately
 * repeats an event under every day it touches, which is right for an agenda and
 * wrong for a grid.
 *
 * Positions are returned as **column indices and lanes, not pixels**, for the
 * same reason `layout.ts` returns fractions: the maths stays testable without a
 * layout to measure, and turning a lane into a grid row is the view's job.
 */

export interface DaySegment {
  event: CalendarEvent;
  /** Zero-based index into `days` of the first column this segment occupies. */
  startColumn: number;
  /** Columns covered, at least 1. */
  span: number;
  /** Vertical lane. Two segments in the same lane never share a column. */
  lane: number;
  /** True when the event began before this run's first day (clipped). */
  continuesBefore: boolean;
  /** True when the event runs past this run's last day (clipped). */
  continuesAfter: boolean;
}

/** A segment's column range before lanes have been assigned. */
interface Extent {
  event: CalendarEvent;
  startColumn: number;
  span: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
  /** The true start instant, used only for ordering. */
  startMs: number;
}

/**
 * Which columns of `days` an event covers, or `null` when it misses the run.
 *
 * The day range is the same one `groupByDay` walks — `startOfDay(start)` through
 * `startOfDay(end)`, inclusive — so the two can never disagree about which days
 * an event belongs to. One consequence worth knowing: an event ending at exactly
 * local midnight reaches into the following day, because `startOfDay(end)` *is*
 * that next day. All-day events avoid this by ending at 23:59 (see the all-day
 * toggle in the web app's event dialog), and changing it would be a visible
 * behaviour change in the month grid and the agenda at once.
 *
 * Calendar-day differences rather than millisecond arithmetic, so a run that
 * crosses a daylight-saving boundary still counts whole days.
 */
function toExtent(event: CalendarEvent, days: CalendarDay[]): Extent | null {
  const start = Date.parse(event.startsAt);
  const end = Date.parse(event.endsAt);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;

  const runStart = startOfDay(days[0]!.date);
  const lastColumn = days.length - 1;

  const firstIndex = differenceInCalendarDays(startOfDay(new Date(start)), runStart);
  const lastIndex = differenceInCalendarDays(startOfDay(new Date(end)), runStart);

  // No intersection with this run of days.
  if (lastIndex < 0 || firstIndex > lastColumn) return null;

  const startColumn = Math.max(firstIndex, 0);
  const endColumn = Math.min(lastIndex, lastColumn);

  return {
    event,
    startColumn,
    span: endColumn - startColumn + 1,
    continuesBefore: firstIndex < 0,
    continuesAfter: lastIndex > lastColumn,
    startMs: start,
  };
}

/**
 * Lay out the events touching a run of consecutive days as horizontal segments.
 *
 * `days` is any run of consecutive days — one row of the month grid, the three
 * columns of the `3day` view, or a single day — which is what lets the month
 * grid and the time grid's all-day band share one engine instead of each
 * growing its own.
 *
 * An event spanning more than one row of the month grid is **not** one segment:
 * call this once per row and each call returns that row's piece, flagged with
 * `continuesBefore` / `continuesAfter` so the view can square off the edge
 * where it crosses the boundary.
 */
export function layoutDaySegments(
  events: CalendarEvent[],
  days: CalendarDay[],
): DaySegment[] {
  if (days.length === 0) return [];

  const extents = events
    .map((event) => toExtent(event, days))
    .filter((extent): extent is Extent => extent !== null)
    // Earliest first; on a tie the longer event takes the upper lane, which
    // keeps a bar above the single-day chips it passes over rather than
    // threading between them. The id breaks remaining ties so the layout is
    // stable across refetches rather than depending on array order.
    .sort(
      (a, b) =>
        a.startMs - b.startMs ||
        b.span - a.span ||
        a.event.id.localeCompare(b.event.id),
    );

  // Greedy lane packing. `laneEnds[lane]` is the last column that lane occupies;
  // a segment can reuse a lane once its previous segment has ended.
  //
  // Checking only the last column is enough because the sort above leaves
  // `startColumn` non-decreasing — a segment's column comes from the day it
  // starts on, and segments clipped at the run's start sort by their true
  // (earlier) start, so they come first and land in column 0.
  const laneEnds: number[] = [];

  return extents.map((extent) => {
    let lane = laneEnds.findIndex((end) => end < extent.startColumn);
    if (lane === -1) {
      lane = laneEnds.length;
    }
    laneEnds[lane] = extent.startColumn + extent.span - 1;

    return {
      event: extent.event,
      startColumn: extent.startColumn,
      span: extent.span,
      lane,
      continuesBefore: extent.continuesBefore,
      continuesAfter: extent.continuesAfter,
    };
  });
}

/**
 * How many local days an event covers, counting both ends. 1 for a single-day
 * event, 4 for a Mon–Thu trip.
 *
 * The agenda uses this to say "day 2 of 4" rather than repeating a plan four
 * times with nothing to distinguish the rows.
 */
export function eventDaySpan(event: CalendarEvent): number {
  const start = Date.parse(event.startsAt);
  const end = Date.parse(event.endsAt);
  if (Number.isNaN(start) || Number.isNaN(end)) return 1;

  return (
    differenceInCalendarDays(startOfDay(new Date(end)), startOfDay(new Date(start))) + 1
  );
}

/**
 * Which day of its own run `day` is for `event`, one-based. Pairs with
 * `eventDaySpan` to read "day 2 of 4".
 */
export function eventDayIndex(event: CalendarEvent, day: Date): number {
  const start = Date.parse(event.startsAt);
  if (Number.isNaN(start)) return 1;

  return differenceInCalendarDays(startOfDay(day), startOfDay(new Date(start))) + 1;
}
