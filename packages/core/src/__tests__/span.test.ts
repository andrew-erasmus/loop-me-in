import { describe, expect, it } from 'vitest';
import { getDayRun } from '../dates.js';
import { eventDayIndex, eventDaySpan, layoutDaySegments } from '../span.js';
import type { CalendarEvent } from '../types.js';

/**
 * Monday 21 September 2026, local time. `WEEK` is the seven days from there,
 * standing in for one row of the month grid.
 */
const MONDAY = new Date(2026, 8, 21);
const WEEK = getDayRun(MONDAY, 7, MONDAY);

/** Build an event between two local day-of-month/hour pairs in September 2026. */
function event(
  id: string,
  startDay: number,
  endDay: number,
  overrides: Partial<CalendarEvent> = {},
): CalendarEvent {
  const start = new Date(2026, 8, startDay, 9, 0);
  const end = new Date(2026, 8, endDay, 17, 0);
  return {
    id,
    title: id,
    notes: null,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    allDay: false,
    visibility: 'shared',
    categoryId: null,
    createdBy: null,
    createdAt: start.toISOString(),
    updatedAt: start.toISOString(),
    ...overrides,
  };
}

/** An event with explicit local times, for the midnight and overnight edges. */
function timed(
  id: string,
  startDay: number,
  startHour: number,
  endDay: number,
  endHour: number,
  endMinute = 0,
): CalendarEvent {
  return {
    ...event(id, startDay, endDay),
    startsAt: new Date(2026, 8, startDay, startHour, 0).toISOString(),
    endsAt: new Date(2026, 8, endDay, endHour, endMinute).toISOString(),
  };
}

const byId = (segments: ReturnType<typeof layoutDaySegments>) =>
  new Map(segments.map((segment) => [segment.event.id, segment]));

describe('layoutDaySegments', () => {
  it('gives a single-day event one column and the first lane', () => {
    const [segment] = layoutDaySegments([event('a', 21, 21)], WEEK);
    expect(segment!.startColumn).toBe(0);
    expect(segment!.span).toBe(1);
    expect(segment!.lane).toBe(0);
    expect(segment!.continuesBefore).toBe(false);
    expect(segment!.continuesAfter).toBe(false);
  });

  it('spans a Mon–Thu event across four columns as one segment', () => {
    const segments = layoutDaySegments([event('trip', 21, 24)], WEEK);
    expect(segments).toHaveLength(1);
    expect(segments[0]!.startColumn).toBe(0);
    expect(segments[0]!.span).toBe(4);
  });

  it('places an event on the column of the day it starts', () => {
    const [segment] = layoutDaySegments([event('wed', 23, 23)], WEEK);
    expect(segment!.startColumn).toBe(2);
    expect(segment!.span).toBe(1);
  });

  it('clips an event that began before the run and flags it', () => {
    // Starts the previous Saturday, ends on the Tuesday.
    const [segment] = layoutDaySegments([event('ongoing', 19, 22)], WEEK);
    expect(segment!.startColumn).toBe(0);
    expect(segment!.span).toBe(2);
    expect(segment!.continuesBefore).toBe(true);
    expect(segment!.continuesAfter).toBe(false);
  });

  it('clips an event that runs past the run and flags it', () => {
    // Saturday of this row through the following Tuesday.
    const [segment] = layoutDaySegments([event('onward', 26, 29)], WEEK);
    expect(segment!.startColumn).toBe(5);
    expect(segment!.span).toBe(2);
    expect(segment!.continuesBefore).toBe(false);
    expect(segment!.continuesAfter).toBe(true);
  });

  it('fills the run and flags both ends for an event that contains it', () => {
    const [segment] = layoutDaySegments([event('fortnight', 14, 30)], WEEK);
    expect(segment!.startColumn).toBe(0);
    expect(segment!.span).toBe(WEEK.length);
    expect(segment!.continuesBefore).toBe(true);
    expect(segment!.continuesAfter).toBe(true);
  });

  it('splits an event crossing a week boundary into one segment per run', () => {
    // Thursday 24 September to Tuesday 29 September, over two month-grid rows.
    const crossing = event('crossing', 24, 29);
    const nextWeek = getDayRun(new Date(2026, 8, 28), 7, MONDAY);

    const [first] = layoutDaySegments([crossing], WEEK);
    expect(first!.startColumn).toBe(3);
    expect(first!.span).toBe(4); // Thu–Sun
    expect(first!.continuesBefore).toBe(false);
    expect(first!.continuesAfter).toBe(true);

    const [second] = layoutDaySegments([crossing], nextWeek);
    expect(second!.startColumn).toBe(0);
    expect(second!.span).toBe(2); // Mon–Tue
    expect(second!.continuesBefore).toBe(true);
    expect(second!.continuesAfter).toBe(false);
  });

  it('stacks two overlapping multi-day events into two lanes', () => {
    const segments = byId(
      layoutDaySegments([event('a', 21, 24), event('b', 23, 26)], WEEK),
    );
    expect(segments.get('a')!.lane).toBe(0);
    expect(segments.get('b')!.lane).toBe(1);
  });

  it('gives the longer event the upper lane when two start together', () => {
    const segments = byId(
      layoutDaySegments([event('short', 21, 21), event('long', 21, 24)], WEEK),
    );
    expect(segments.get('long')!.lane).toBe(0);
    expect(segments.get('short')!.lane).toBe(1);
  });

  it('keeps a single-day chip out of the lane of a bar crossing its day', () => {
    // The bar covers Mon–Thu; the chip is on the Wednesday inside it.
    const segments = byId(
      layoutDaySegments([event('bar', 21, 24), event('chip', 23, 23)], WEEK),
    );
    expect(segments.get('bar')!.lane).not.toBe(segments.get('chip')!.lane);
    expect(segments.get('chip')!.lane).toBeGreaterThan(segments.get('bar')!.lane);
  });

  it('reuses a lane once its previous segment has ended', () => {
    // Mon–Wed, then Thu–Fri: no shared column, so both sit in lane 0.
    const segments = byId(
      layoutDaySegments([event('early', 21, 23), event('late', 24, 25)], WEEK),
    );
    expect(segments.get('early')!.lane).toBe(0);
    expect(segments.get('late')!.lane).toBe(0);
  });

  it('is stable regardless of the order events arrive in', () => {
    const events = [
      event('a', 21, 23),
      event('b', 22, 25),
      event('c', 21, 21),
      event('d', 24, 26),
    ];
    const forward = byId(layoutDaySegments(events, WEEK));
    const reversed = byId(layoutDaySegments([...events].reverse(), WEEK));

    for (const id of ['a', 'b', 'c', 'd']) {
      expect(reversed.get(id)!.lane).toBe(forward.get(id)!.lane);
      expect(reversed.get(id)!.startColumn).toBe(forward.get(id)!.startColumn);
      expect(reversed.get(id)!.span).toBe(forward.get(id)!.span);
    }
  });

  it('spans an overnight timed event across two columns', () => {
    const [segment] = layoutDaySegments([timed('flight', 21, 22, 22, 9)], WEEK);
    expect(segment!.span).toBe(2);
  });

  it('keeps an all-day event written as 00:00–23:59 to one column', () => {
    const [segment] = layoutDaySegments(
      [{ ...timed('holiday', 21, 0, 21, 23, 59), allDay: true }],
      WEEK,
    );
    expect(segment!.span).toBe(1);
  });

  it('reaches into the next day for an event ending at exactly midnight', () => {
    // Matches `groupByDay`, which buckets on `startOfDay(end)` — so the two
    // never disagree about which days an event belongs to.
    const [segment] = layoutDaySegments([timed('shift', 21, 18, 22, 0)], WEEK);
    expect(segment!.span).toBe(2);
  });

  it('omits an event that misses the run entirely', () => {
    expect(layoutDaySegments([event('elsewhere', 10, 12)], WEEK)).toEqual([]);
  });

  it('skips events with unparseable timestamps rather than throwing', () => {
    const broken = { ...event('broken', 21, 21), startsAt: 'not a date' };
    const segments = layoutDaySegments([broken, event('fine', 21, 21)], WEEK);
    expect(segments).toHaveLength(1);
    expect(segments[0]!.event.id).toBe('fine');
  });

  it('works for a run that is not a week', () => {
    const threeDays = getDayRun(MONDAY, 3, MONDAY);
    const [segment] = layoutDaySegments([event('trip', 21, 24)], threeDays);
    expect(segment!.span).toBe(3);
    expect(segment!.continuesAfter).toBe(true);

    const oneDay = getDayRun(MONDAY, 1, MONDAY);
    const [single] = layoutDaySegments([event('trip', 21, 24)], oneDay);
    expect(single!.span).toBe(1);
    expect(single!.continuesAfter).toBe(true);
  });

  it('returns nothing for an empty run', () => {
    expect(layoutDaySegments([event('a', 21, 21)], [])).toEqual([]);
  });

  it('returns nothing for no events', () => {
    expect(layoutDaySegments([], WEEK)).toEqual([]);
  });
});

describe('eventDaySpan', () => {
  it('is 1 for a single-day event', () => {
    expect(eventDaySpan(event('a', 21, 21))).toBe(1);
  });

  it('counts both ends of a multi-day event', () => {
    expect(eventDaySpan(event('trip', 21, 24))).toBe(4);
  });

  it('is 1 for an all-day event ending at 23:59', () => {
    expect(eventDaySpan(timed('holiday', 21, 0, 21, 23, 59))).toBe(1);
  });

  it('is 2 for an overnight event', () => {
    expect(eventDaySpan(timed('flight', 21, 22, 22, 9))).toBe(2);
  });
});

describe('eventDayIndex', () => {
  it('is 1 on an event’s first day', () => {
    expect(eventDayIndex(event('trip', 21, 24), new Date(2026, 8, 21))).toBe(1);
  });

  it('counts forward through the event', () => {
    const trip = event('trip', 21, 24);
    expect(eventDayIndex(trip, new Date(2026, 8, 23))).toBe(3);
    expect(eventDayIndex(trip, new Date(2026, 8, 24))).toBe(4);
  });

  it('ignores the time of day on either side', () => {
    const trip = event('trip', 21, 24);
    expect(eventDayIndex(trip, new Date(2026, 8, 23, 23, 30))).toBe(3);
  });
});
