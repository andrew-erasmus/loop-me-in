import { describe, expect, it } from 'vitest';
import { MIN_EVENT_MINUTES, layoutDayEvents } from '../layout.js';
import type { CalendarEvent } from '../types.js';

const DAY = new Date(2026, 8, 21); // 21 September 2026, local time.

/** Build an event spanning local `startHour:startMin` to `endHour:endMin`. */
function event(
  id: string,
  startHour: number,
  startMin: number,
  endHour: number,
  endMin: number,
  overrides: Partial<CalendarEvent> = {},
): CalendarEvent {
  const start = new Date(2026, 8, 21, startHour, startMin);
  const end = new Date(2026, 8, 21, endHour, endMin);
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

const byId = (positioned: ReturnType<typeof layoutDayEvents>) =>
  new Map(positioned.map((p) => [p.event.id, p]));

describe('layoutDayEvents', () => {
  it('positions a single event as a fraction of the day', () => {
    const [positioned] = layoutDayEvents([event('a', 9, 0, 12, 0)], DAY);
    expect(positioned!.top).toBeCloseTo(9 / 24);
    expect(positioned!.height).toBeCloseTo(3 / 24);
    expect(positioned!.column).toBe(0);
    expect(positioned!.columnCount).toBe(1);
  });

  it('gives non-overlapping events the full width each', () => {
    const result = layoutDayEvents(
      [event('morning', 9, 0, 10, 0), event('afternoon', 14, 0, 15, 0)],
      DAY,
    );
    for (const positioned of result) {
      expect(positioned.columnCount).toBe(1);
      expect(positioned.column).toBe(0);
    }
  });

  it('splits two partially overlapping events into two columns', () => {
    const result = byId(
      layoutDayEvents([event('a', 14, 0, 15, 30), event('b', 14, 30, 16, 0)], DAY),
    );
    expect(result.get('a')!.columnCount).toBe(2);
    expect(result.get('b')!.columnCount).toBe(2);
    expect(result.get('a')!.column).not.toBe(result.get('b')!.column);
  });

  it('splits three mutually overlapping events into three columns', () => {
    const result = layoutDayEvents(
      [event('a', 9, 0, 11, 0), event('b', 9, 30, 11, 30), event('c', 10, 0, 12, 0)],
      DAY,
    );
    expect(result.every((p) => p.columnCount === 3)).toBe(true);
    expect(new Set(result.map((p) => p.column))).toEqual(new Set([0, 1, 2]));
  });

  it('handles a fully nested event', () => {
    const result = byId(
      layoutDayEvents([event('outer', 9, 0, 17, 0), event('inner', 12, 0, 13, 0)], DAY),
    );
    expect(result.get('outer')!.columnCount).toBe(2);
    expect(result.get('inner')!.columnCount).toBe(2);
    // The longer event takes the leftmost column.
    expect(result.get('outer')!.column).toBe(0);
    expect(result.get('inner')!.column).toBe(1);
  });

  it('handles identical time ranges', () => {
    const result = layoutDayEvents(
      [event('a', 10, 0, 11, 0), event('b', 10, 0, 11, 0), event('c', 10, 0, 11, 0)],
      DAY,
    );
    expect(result.every((p) => p.columnCount === 3)).toBe(true);
    expect(new Set(result.map((p) => p.column)).size).toBe(3);
  });

  it('reuses a column once its previous event has ended', () => {
    // `long` spans the whole window; `early` and `late` are sequential and can
    // therefore share the second column.
    const result = byId(
      layoutDayEvents(
        [event('long', 9, 0, 17, 0), event('early', 10, 0, 11, 0), event('late', 14, 0, 15, 0)],
        DAY,
      ),
    );
    expect(result.get('early')!.column).toBe(1);
    expect(result.get('late')!.column).toBe(1);
    expect(result.get('long')!.columnCount).toBe(2);
  });

  it('treats a back-to-back event as non-overlapping', () => {
    const result = layoutDayEvents(
      [event('first', 9, 0, 10, 0), event('second', 10, 0, 11, 0)],
      DAY,
    );
    expect(result.every((p) => p.columnCount === 1)).toBe(true);
  });

  it('floors very short events to a minimum height', () => {
    const [positioned] = layoutDayEvents([event('quick', 9, 0, 9, 5)], DAY);
    expect(positioned!.height).toBeCloseTo(MIN_EVENT_MINUTES / (24 * 60));
  });

  it('gives a floored short event its own column against a close neighbour', () => {
    // 09:00–09:05 floored to 09:00–09:20 now visually overlaps 09:10, so the
    // two must not be stacked on top of each other.
    const result = layoutDayEvents(
      [event('quick', 9, 0, 9, 5), event('next', 9, 10, 10, 0)],
      DAY,
    );
    expect(result.every((p) => p.columnCount === 2)).toBe(true);
  });

  it('excludes all-day events from the time grid', () => {
    const result = layoutDayEvents(
      [event('timed', 9, 0, 10, 0), event('holiday', 0, 0, 23, 59, { allDay: true })],
      DAY,
    );
    expect(result.map((p) => p.event.id)).toEqual(['timed']);
  });

  it('excludes events on other days', () => {
    const otherDay: CalendarEvent = {
      ...event('tomorrow', 9, 0, 10, 0),
      startsAt: new Date(2026, 8, 22, 9, 0).toISOString(),
      endsAt: new Date(2026, 8, 22, 10, 0).toISOString(),
    };
    expect(layoutDayEvents([otherDay], DAY)).toHaveLength(0);
  });

  it('clips a multi-day event to the day and flags the continuation', () => {
    const spanning: CalendarEvent = {
      ...event('conference', 0, 0, 0, 0),
      startsAt: new Date(2026, 8, 20, 18, 0).toISOString(),
      endsAt: new Date(2026, 8, 22, 12, 0).toISOString(),
    };
    const [positioned] = layoutDayEvents([spanning], DAY);
    expect(positioned!.top).toBe(0);
    expect(positioned!.height).toBeCloseTo(1, 2);
    expect(positioned!.continuesFromPreviousDay).toBe(true);
    expect(positioned!.continuesIntoNextDay).toBe(true);
  });

  it('never positions an event past the end of the day', () => {
    const lateNight = event('late', 23, 50, 23, 59);
    const [positioned] = layoutDayEvents([lateNight], DAY);
    expect(positioned!.top + positioned!.height).toBeLessThanOrEqual(1.0001);
  });

  it('is stable regardless of input order', () => {
    const events = [event('a', 9, 0, 11, 0), event('b', 9, 30, 11, 30)];
    const forward = byId(layoutDayEvents(events, DAY));
    const reversed = byId(layoutDayEvents([...events].reverse(), DAY));
    expect(forward.get('a')!.column).toBe(reversed.get('a')!.column);
    expect(forward.get('b')!.column).toBe(reversed.get('b')!.column);
  });

  it('returns nothing for an empty list', () => {
    expect(layoutDayEvents([], DAY)).toEqual([]);
  });
});
