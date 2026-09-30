import { endOfDay, startOfDay } from 'date-fns';
import type { CalendarEvent } from './types.js';

/**
 * Time-grid layout: where each timed event sits on a day column, and how
 * overlapping events share the horizontal space.
 *
 * Positions are returned as **fractions, not pixels**. `top`/`height` are
 * fractions of the full day (0 = midnight, 1 = next midnight) and
 * `column`/`columnCount` describe the horizontal split. The web app multiplies
 * these by a pixel height; keeping the maths in fractions is what keeps this
 * file free of units, and testable without a layout to measure.
 */

const MINUTES_PER_DAY = 24 * 60;

/** Events shorter than this are drawn at this height so they stay clickable. */
export const MIN_EVENT_MINUTES = 20;

export interface PositionedEvent {
  event: CalendarEvent;
  /** Fraction of the day at which the event starts (0–1). */
  top: number;
  /** Fraction of the day the event spans (0–1), floored at MIN_EVENT_MINUTES. */
  height: number;
  /** Zero-based horizontal slot within its overlap cluster. */
  column: number;
  /** Total slots in that cluster — `column / columnCount` gives the x offset. */
  columnCount: number;
  /** True when the event actually began before this day (clipped at midnight). */
  continuesFromPreviousDay: boolean;
  /** True when the event runs past this day (clipped at midnight). */
  continuesIntoNextDay: boolean;
}

interface Span {
  event: CalendarEvent;
  startMinute: number;
  endMinute: number;
  /**
   * `endMinute` floored to MIN_EVENT_MINUTES and capped at midnight. Overlap is
   * decided on this rather than the true end, so a 5-minute event drawn at its
   * minimum height still gets its own column instead of sitting on top of
   * whatever starts 10 minutes later.
   */
  layoutEndMinute: number;
  continuesFromPreviousDay: boolean;
  continuesIntoNextDay: boolean;
}

/** Clip an event to `day` and express its bounds as minutes past midnight. */
function toSpan(event: CalendarEvent, day: Date): Span | null {
  const dayStart = startOfDay(day).getTime();
  const dayEnd = endOfDay(day).getTime();

  const start = Date.parse(event.startsAt);
  const end = Date.parse(event.endsAt);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;

  // No intersection with this day.
  if (end < dayStart || start > dayEnd) return null;

  const clippedStart = Math.max(start, dayStart);
  const clippedEnd = Math.min(end, dayEnd);

  const startMinute = (clippedStart - dayStart) / 60_000;
  const endMinute = (clippedEnd - dayStart) / 60_000;

  return {
    event,
    startMinute,
    endMinute,
    layoutEndMinute: Math.min(
      Math.max(endMinute, startMinute + MIN_EVENT_MINUTES),
      MINUTES_PER_DAY,
    ),
    continuesFromPreviousDay: start < dayStart,
    continuesIntoNextDay: end > dayEnd,
  };
}

/**
 * Position the timed events that intersect `day`.
 *
 * All-day events are excluded — those belong in the header row, not the grid.
 * Overlapping events are split into columns: events that overlap transitively
 * form a cluster, and every event in a cluster is given the first column that
 * is free at its start time.
 */
export function layoutDayEvents(events: CalendarEvent[], day: Date): PositionedEvent[] {
  const spans = events
    .filter((event) => !event.allDay)
    .map((event) => toSpan(event, day))
    .filter((span): span is Span => span !== null)
    // Earliest first; on a tie the longer event takes the leftmost column,
    // which reads better than the reverse. The id breaks remaining ties so the
    // layout is stable across refetches rather than depending on array order.
    .sort(
      (a, b) =>
        a.startMinute - b.startMinute ||
        b.endMinute - a.endMinute ||
        a.event.id.localeCompare(b.event.id),
    );

  const positioned: PositionedEvent[] = [];

  let cluster: Span[] = [];
  let clusterEndMinute = -1;

  const flush = () => {
    if (cluster.length === 0) return;

    // Greedy column packing: reuse a column once its previous event has ended.
    const columnEnds: number[] = [];
    const assignments = cluster.map((span) => {
      let column = columnEnds.findIndex((end) => end <= span.startMinute);
      if (column === -1) {
        column = columnEnds.length;
      }
      columnEnds[column] = span.layoutEndMinute;
      return { span, column };
    });

    const columnCount = columnEnds.length;

    for (const { span, column } of assignments) {
      positioned.push({
        event: span.event,
        top: span.startMinute / MINUTES_PER_DAY,
        height: (span.layoutEndMinute - span.startMinute) / MINUTES_PER_DAY,
        column,
        columnCount,
        continuesFromPreviousDay: span.continuesFromPreviousDay,
        continuesIntoNextDay: span.continuesIntoNextDay,
      });
    }

    cluster = [];
    clusterEndMinute = -1;
  };

  for (const span of spans) {
    // A gap with no active event closes the cluster: nothing after this point
    // can overlap anything before it.
    if (cluster.length > 0 && span.startMinute >= clusterEndMinute) {
      flush();
    }
    cluster.push(span);
    clusterEndMinute = Math.max(clusterEndMinute, span.layoutEndMinute);
  }
  flush();

  return positioned;
}
