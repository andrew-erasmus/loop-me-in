import { endOfDay, startOfDay } from 'date-fns';
import { dayKey } from './dates.js';
import type { CalendarEvent, Category } from './types.js';
import { ORPHAN_EVENT_COLOR } from './types.js';

/**
 * Querying and grouping over a list of events. Pure functions — the views call
 * these instead of doing their own filtering inline, so the same logic serves
 * the web grid today and the mobile list later.
 */

/** Events touching the inclusive instant range `[from, to]`. */
export function eventsInRange(
  events: CalendarEvent[],
  from: Date,
  to: Date,
): CalendarEvent[] {
  const fromMs = from.getTime();
  const toMs = to.getTime();
  return events.filter((event) => {
    const start = Date.parse(event.startsAt);
    const end = Date.parse(event.endsAt);
    return end >= fromMs && start <= toMs;
  });
}

/** Events touching a single calendar day, in local time. */
export function eventsOnDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  return eventsInRange(events, startOfDay(day), endOfDay(day));
}

export function sortByStart(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((a, b) => {
    // All-day events read first in a day's list, regardless of their timestamp.
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    return (
      Date.parse(a.startsAt) - Date.parse(b.startsAt) ||
      a.title.localeCompare(b.title)
    );
  });
}

/**
 * Bucket events by local day key (`yyyy-MM-dd`). A multi-day event appears
 * under every day it touches, which is what a month grid and an agenda both
 * want — each day shows what is happening on it.
 */
export function groupByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const buckets = new Map<string, CalendarEvent[]>();

  for (const event of events) {
    const start = new Date(event.startsAt);
    const end = new Date(event.endsAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;

    // Walk day by day from the event's first day to its last.
    const cursor = startOfDay(start);
    const lastDay = startOfDay(end).getTime();

    // Guard against a pathological range producing an unbounded loop.
    for (let guard = 0; cursor.getTime() <= lastDay && guard < 400; guard++) {
      const key = dayKey(cursor);
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.push(event);
      } else {
        buckets.set(key, [event]);
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  for (const [key, bucket] of buckets) {
    buckets.set(key, sortByStart(bucket));
  }

  return buckets;
}

/**
 * Index categories by id for O(1) colour lookup while rendering.
 */
export function categoryMap(categories: Category[]): Map<string, Category> {
  return new Map(categories.map((category) => [category.id, category]));
}

/**
 * The colour an event should render in. Events whose category was deleted fall
 * back to a neutral grey rather than disappearing.
 */
export function eventColor(
  event: CalendarEvent,
  categories: Map<string, Category>,
): string {
  if (!event.categoryId) return ORPHAN_EVENT_COLOR;
  return categories.get(event.categoryId)?.color ?? ORPHAN_EVENT_COLOR;
}

/** Drop events whose category is toggled off in the filter bar. */
export function filterByCategories(
  events: CalendarEvent[],
  hiddenCategoryIds: ReadonlySet<string>,
): CalendarEvent[] {
  if (hiddenCategoryIds.size === 0) return events;
  return events.filter(
    (event) => !event.categoryId || !hiddenCategoryIds.has(event.categoryId),
  );
}

/**
 * Drop events whose creator is toggled off in the filter bar.
 *
 * Kept next to `filterByCategories` and composed the same way: the two filters
 * are independent axes over the same list, and App.tsx applies both in turn.
 */
export function filterByPeople(
  events: CalendarEvent[],
  hiddenUserIds: ReadonlySet<string>,
): CalendarEvent[] {
  if (hiddenUserIds.size === 0) return events;
  return events.filter(
    (event) => !event.createdBy || !hiddenUserIds.has(event.createdBy),
  );
}

/** The colour identifying who created an event, or grey if the account is gone. */
export function personColor(
  event: CalendarEvent,
  people: Map<string, { color: string }>,
): string {
  if (!event.createdBy) return ORPHAN_EVENT_COLOR;
  return people.get(event.createdBy)?.color ?? ORPHAN_EVENT_COLOR;
}

/**
 * Whether this event is a surprise the viewer is not in on — i.e. what they
 * are holding has already been redacted by the server.
 *
 * The check is `createdBy`, not the title: comparing against the placeholder
 * would misfire the moment someone genuinely names an event "Something
 * planned", and would quietly stop working if that wording ever changed.
 */
export function isHiddenSurprise(
  event: CalendarEvent,
  viewerId: string | null,
): boolean {
  return event.visibility === 'surprise' && event.createdBy !== viewerId;
}

/**
 * Whether the viewer may edit, move or delete this event.
 *
 * Only surprises are protected, and only from the person they are for —
 * everything else in a shared calendar is jointly owned, which is rather the
 * point of sharing it.
 */
export function canEditEvent(event: CalendarEvent, viewerId: string | null): boolean {
  return !isHiddenSurprise(event, viewerId);
}
