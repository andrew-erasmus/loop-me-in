import { describe, expect, it } from 'vitest';
import { suggestFreeSlots } from '../scheduling.js';

/** Local Date, so tests don't depend on the machine's timezone. */
const local = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(y, m - 1, d, h, min, 0, 0);

const iso = (y: number, m: number, d: number, h = 0, min = 0) =>
  local(y, m, d, h, min).toISOString();

// A Monday, well inside waking hours, so `from` never itself falls outside
// the day's window in these tests.
const FROM = local(2026, 9, 21, 9, 0);
const TO = local(2026, 9, 28, 23, 59);

describe('suggestFreeSlots', () => {
  it('offers the start of the window when nobody is busy', () => {
    const slots = suggestFreeSlots([], { durationMinutes: 60, from: FROM, to: TO });
    expect(slots[0]).toEqual({
      startsAt: iso(2026, 9, 21, 9, 0),
      endsAt: iso(2026, 9, 21, 10, 0),
    });
  });

  it('skips a slot that overlaps a busy interval', () => {
    const slots = suggestFreeSlots(
      [{ startsAt: iso(2026, 9, 21, 9, 0), endsAt: iso(2026, 9, 21, 10, 0) }],
      { durationMinutes: 60, from: FROM, to: TO },
    );
    expect(slots[0]!.startsAt).toBe(iso(2026, 9, 21, 10, 0));
  });

  it('finds a gap between two busy intervals', () => {
    const slots = suggestFreeSlots(
      [
        { startsAt: iso(2026, 9, 21, 9, 0), endsAt: iso(2026, 9, 21, 10, 0) },
        { startsAt: iso(2026, 9, 21, 10, 30), endsAt: iso(2026, 9, 21, 20, 0) },
      ],
      { durationMinutes: 30, from: FROM, to: TO },
    );
    expect(slots[0]).toEqual({
      startsAt: iso(2026, 9, 21, 10, 0),
      endsAt: iso(2026, 9, 21, 10, 30),
    });
  });

  it('merges overlapping busy intervals from both people', () => {
    const slots = suggestFreeSlots(
      [
        { startsAt: iso(2026, 9, 21, 9, 0), endsAt: iso(2026, 9, 21, 12, 0) },
        { startsAt: iso(2026, 9, 21, 11, 0), endsAt: iso(2026, 9, 21, 14, 0) },
      ],
      { durationMinutes: 60, from: FROM, to: TO },
    );
    expect(slots[0]!.startsAt).toBe(iso(2026, 9, 21, 14, 0));
  });

  it('moves to the next day when today has no room left', () => {
    const slots = suggestFreeSlots(
      [{ startsAt: iso(2026, 9, 21, 8, 0), endsAt: iso(2026, 9, 21, 21, 0) }],
      { durationMinutes: 60, from: FROM, to: TO },
    );
    expect(slots[0]!.startsAt).toBe(iso(2026, 9, 22, 8, 0));
  });

  it('never suggests before the window start or outside waking hours', () => {
    const slots = suggestFreeSlots([], {
      durationMinutes: 60,
      from: FROM,
      to: TO,
      dayStartHour: 8,
      dayEndHour: 21,
      maxResults: 5,
    });
    for (const slot of slots) {
      const hour = new Date(slot.startsAt).getHours();
      expect(hour).toBeGreaterThanOrEqual(8);
      expect(hour).toBeLessThan(21);
      expect(Date.parse(slot.startsAt)).toBeGreaterThanOrEqual(FROM.getTime());
    }
  });

  it('returns at most one slot per day', () => {
    const slots = suggestFreeSlots([], { durationMinutes: 30, from: FROM, to: TO, maxResults: 5 });
    const days = slots.map((slot) => slot.startsAt.slice(0, 10));
    expect(new Set(days).size).toBe(days.length);
  });

  it('respects maxResults', () => {
    const slots = suggestFreeSlots([], { durationMinutes: 30, from: FROM, to: TO, maxResults: 2 });
    expect(slots.length).toBe(2);
  });

  it('returns nothing when the window is too short for the duration', () => {
    const slots = suggestFreeSlots([], {
      durationMinutes: 60,
      from: local(2026, 9, 21, 20, 45),
      to: local(2026, 9, 21, 21, 0),
    });
    expect(slots).toEqual([]);
  });
});
