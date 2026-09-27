import { addDays, startOfDay } from 'date-fns';
import type { SuggestedSlot } from './types.js';

/**
 * Finding a free slot for both of you.
 *
 * The item this feeds is *linked* to the slot the same way any other
 * scheduling is (`scheduleItemSchema`) — this only proposes candidates, it
 * never books one itself.
 */

export interface BusyInterval {
  startsAt: string;
  endsAt: string;
}

export interface SuggestSlotsOptions {
  /** How long the plan needs. */
  durationMinutes: number;
  /** Start of the look-ahead window — usually now. */
  from: Date;
  /** End of the look-ahead window. */
  to: Date;
  /** Waking hours only: nobody wants "movie night" suggested at 3am. */
  dayStartHour?: number;
  dayEndHour?: number;
  /** How many candidates to return. */
  maxResults?: number;
}

/**
 * Free windows, at most one per day, earliest first.
 *
 * At most one per day is deliberate: three suggestions back-to-back on the
 * same free Tuesday are not three real choices, they're one choice shown
 * three times. Spreading across different days gives an actual pick.
 */
export function suggestFreeSlots(
  busy: BusyInterval[],
  options: SuggestSlotsOptions,
): SuggestedSlot[] {
  const { durationMinutes, from, to, dayStartHour = 8, dayEndHour = 21, maxResults = 3 } = options;
  const durationMs = durationMinutes * 60 * 1000;
  const windowEnd = to.getTime();

  const busyRanges = busy
    .map((interval) => ({ start: Date.parse(interval.startsAt), end: Date.parse(interval.endsAt) }))
    .sort((a, b) => a.start - b.start);

  const results: SuggestedSlot[] = [];
  let day = startOfDay(from);

  while (day.getTime() <= windowEnd && results.length < maxResults) {
    const dayStart = new Date(day);
    dayStart.setHours(dayStartHour, 0, 0, 0);
    const dayEnd = new Date(day);
    dayEnd.setHours(dayEndHour, 0, 0, 0);

    let cursor = Math.max(dayStart.getTime(), from.getTime());
    const limit = Math.min(dayEnd.getTime(), windowEnd);

    for (const range of busyRanges) {
      if (range.end <= cursor) continue;
      if (range.start >= limit) break;
      if (range.start - cursor >= durationMs) break;
      cursor = Math.max(cursor, range.end);
    }

    if (limit - cursor >= durationMs) {
      results.push({
        startsAt: new Date(cursor).toISOString(),
        endsAt: new Date(cursor + durationMs).toISOString(),
      });
    }

    day = addDays(day, 1);
  }

  return results;
}
