import { addDays, startOfDay } from 'date-fns';
import { MIN_EVENT_MINUTES } from './layout.js';
import type { CalendarEvent } from './types.js';

/**
 * What a drag gesture does to an event's times.
 *
 * Deliberately free of pointer events, DOM nodes and pixels: a gesture is
 * reduced to "how many days sideways, how many minutes up or down" before it
 * reaches this file. Web measures that from a PointerEvent, React Native will
 * measure it from a PanResponder, and both then call the same functions here.
 *
 * All arithmetic is in local time — dragging an event one column to the right
 * means "same wall-clock time, next day", which is what the user sees, and
 * date-fns' `addDays` keeps that true across a DST boundary.
 */

/** Drags land on a 15-minute grid, matching the quarter-hour rows on screen. */
export const SNAP_MINUTES = 15;

const MINUTES_PER_DAY = 24 * 60;

/** Round to the nearest `step`-minute boundary. */
export function snapToStep(minutes: number, step: number = SNAP_MINUTES): number {
  return Math.round(minutes / step) * step;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export interface MoveDelta {
  /** Whole columns dragged sideways. Always 0 in day view. */
  dayDelta?: number;
  /** Vertical travel, already converted from pixels to minutes. */
  minuteDelta?: number;
  step?: number;
}

/** The times a drag would produce — apply as a PATCH, or render as a preview. */
export interface EventTimes {
  startsAt: string;
  endsAt: string;
}

/**
 * Move an event, preserving its duration.
 *
 * The *resulting* start is snapped rather than the delta, so events come to
 * rest on the quarter-hour lines instead of keeping whatever offset they began
 * with. The start is also clamped inside its day: an event always begins on the
 * day you dropped it on, though a long one may still run past midnight.
 */
export function moveEvent(event: CalendarEvent, delta: MoveDelta): EventTimes {
  const { dayDelta = 0, minuteDelta = 0, step = SNAP_MINUTES } = delta;

  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);
  const durationMs = Math.max(end.getTime() - start.getTime(), 0);

  const shifted = addDays(start, dayDelta);
  const minutesOfDay = shifted.getHours() * 60 + shifted.getMinutes();
  const target = clamp(
    snapToStep(minutesOfDay + minuteDelta, step),
    0,
    MINUTES_PER_DAY - step,
  );

  // setHours normalises an out-of-range minute count into the right hour.
  const newStart = new Date(shifted);
  newStart.setHours(0, target, 0, 0);

  return {
    startsAt: newStart.toISOString(),
    endsAt: new Date(newStart.getTime() + durationMs).toISOString(),
  };
}

/**
 * Drag the bottom edge: change the end, leave the start alone.
 *
 * Floors at MIN_EVENT_MINUTES so an event can't be shrunk to nothing and
 * become impossible to grab again.
 */
export function resizeEventEnd(
  event: CalendarEvent,
  delta: { minuteDelta: number; step?: number },
): EventTimes {
  const { minuteDelta, step = SNAP_MINUTES } = delta;

  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);
  const dayStart = startOfDay(start).getTime();

  const startOffset = (start.getTime() - dayStart) / 60_000;
  const endOffset = (end.getTime() - dayStart) / 60_000;

  const target = Math.max(
    snapToStep(endOffset + minuteDelta, step),
    startOffset + MIN_EVENT_MINUTES,
  );

  return {
    startsAt: event.startsAt,
    endsAt: new Date(dayStart + target * 60_000).toISOString(),
  };
}

/**
 * Re-date an event onto `targetDay`, keeping its time of day and duration.
 * This is what a month-grid drag does — there is no hour axis to read, so only
 * the date changes.
 */
export function moveEventToDay(event: CalendarEvent, targetDay: Date): EventTimes {
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);
  const durationMs = Math.max(end.getTime() - start.getTime(), 0);

  const newStart = startOfDay(targetDay);
  newStart.setHours(start.getHours(), start.getMinutes(), 0, 0);

  return {
    startsAt: newStart.toISOString(),
    endsAt: new Date(newStart.getTime() + durationMs).toISOString(),
  };
}

/** True when a drag produced no actual change, so the PATCH can be skipped. */
export function isUnchanged(event: CalendarEvent, times: EventTimes): boolean {
  return (
    Date.parse(event.startsAt) === Date.parse(times.startsAt) &&
    Date.parse(event.endsAt) === Date.parse(times.endsAt)
  );
}

/** Convert vertical travel in a day column to minutes. */
export function pixelsToMinutes(deltaPixels: number, dayHeightPixels: number): number {
  if (dayHeightPixels <= 0) return 0;
  return (deltaPixels / dayHeightPixels) * MINUTES_PER_DAY;
}
