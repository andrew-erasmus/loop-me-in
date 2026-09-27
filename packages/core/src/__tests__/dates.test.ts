import { describe, expect, it } from 'vitest';
import {
  MONTH_GRID_WEEKS,
  dayKey,
  formatPeriodLabel,
  fractionOfDay,
  getHourSlots,
  getMonthGrid,
  getViewRange,
  getWeekDays,
  navigate,
} from '../dates.js';

/** Local-midnight Date, so tests don't depend on the machine's timezone. */
const local = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(y, m - 1, d, h, min, 0, 0);

describe('getMonthGrid', () => {
  it('always returns 6 rows of 7 days', () => {
    const grid = getMonthGrid(local(2026, 9, 15), local(2026, 9, 21));
    expect(grid).toHaveLength(MONTH_GRID_WEEKS);
    for (const week of grid) expect(week).toHaveLength(7);
  });

  it('pads with adjacent-month days and flags them as out of month', () => {
    // September 2026 starts on a Tuesday, so a Monday-start grid begins on
    // Monday 31 August.
    const grid = getMonthGrid(local(2026, 9, 15), local(2026, 9, 21));
    const first = grid[0]![0]!;
    expect(first.key).toBe('2026-08-31');
    expect(first.inMonth).toBe(false);

    const secondCell = grid[0]![1]!;
    expect(secondCell.key).toBe('2026-09-01');
    expect(secondCell.inMonth).toBe(true);
  });

  it('starts flush when the month begins on the week-start day', () => {
    // June 2026 begins on a Monday — a Monday-start grid needs no leading pad.
    const grid = getMonthGrid(local(2026, 6, 10), local(2026, 6, 10));
    expect(grid[0]![0]!.key).toBe('2026-06-01');
    expect(grid[0]![0]!.inMonth).toBe(true);
  });

  it('handles a Sunday-start week option', () => {
    const grid = getMonthGrid(local(2026, 9, 15), local(2026, 9, 21), 0);
    expect(grid[0]![0]!.date.getDay()).toBe(0);
    expect(grid[0]![0]!.key).toBe('2026-08-30');
  });

  it('covers a leap-year February without dropping the 29th', () => {
    const grid = getMonthGrid(local(2024, 2, 10), local(2024, 2, 10));
    const keys = grid.flat().map((day) => day.key);
    expect(keys).toContain('2024-02-29');
    expect(keys).not.toContain('2024-02-30');
  });

  it('covers a non-leap February', () => {
    const grid = getMonthGrid(local(2026, 2, 10), local(2026, 2, 10));
    const inMonth = grid.flat().filter((day) => day.inMonth);
    expect(inMonth).toHaveLength(28);
  });

  it('marks exactly one cell as today, and only when today is on the grid', () => {
    const grid = getMonthGrid(local(2026, 9, 15), local(2026, 9, 21));
    expect(grid.flat().filter((day) => day.isToday)).toHaveLength(1);

    const otherMonth = getMonthGrid(local(2026, 1, 15), local(2026, 9, 21));
    expect(otherMonth.flat().filter((day) => day.isToday)).toHaveLength(0);
  });

  it('flags weekends', () => {
    const grid = getMonthGrid(local(2026, 9, 15), local(2026, 9, 21));
    const saturday = grid.flat().find((day) => day.key === '2026-09-05');
    expect(saturday?.isWeekend).toBe(true);
    const wednesday = grid.flat().find((day) => day.key === '2026-09-02');
    expect(wednesday?.isWeekend).toBe(false);
  });
});

describe('getWeekDays', () => {
  it('returns Monday through Sunday by default', () => {
    const days = getWeekDays(local(2026, 9, 21), local(2026, 9, 21));
    expect(days).toHaveLength(7);
    expect(days[0]!.key).toBe('2026-09-21');
    expect(days[6]!.key).toBe('2026-09-27');
  });
});

describe('getViewRange', () => {
  it('covers the whole visible month grid, not just the month', () => {
    const { from, to } = getViewRange(local(2026, 9, 15), 'month');
    // Grid starts Mon 31 Aug and spans 42 days.
    expect(dayKey(from)).toBe('2026-08-31');
    expect(dayKey(to)).toBe('2026-10-11');
  });

  it('covers exactly one day in day view', () => {
    const { from, to } = getViewRange(local(2026, 9, 21), 'day');
    expect(dayKey(from)).toBe('2026-09-21');
    expect(dayKey(to)).toBe('2026-09-21');
    expect(from.getHours()).toBe(0);
    expect(to.getHours()).toBe(23);
  });

  it('covers the containing week in week view', () => {
    const { from, to } = getViewRange(local(2026, 9, 24), 'week');
    expect(dayKey(from)).toBe('2026-09-21');
    expect(dayKey(to)).toBe('2026-09-27');
  });
});

describe('navigate', () => {
  it('steps by the period of the active view', () => {
    const anchor = local(2026, 9, 21);
    expect(dayKey(navigate(anchor, 'day', 1))).toBe('2026-09-22');
    expect(dayKey(navigate(anchor, 'week', 1))).toBe('2026-09-28');
    expect(dayKey(navigate(anchor, 'month', 1))).toBe('2026-10-21');
    expect(dayKey(navigate(anchor, 'agenda', -1))).toBe('2026-08-21');
  });

  it('clamps when the target month is shorter', () => {
    // 31 Jan going forward a month must not spill into March.
    expect(dayKey(navigate(local(2026, 1, 31), 'month', 1))).toBe('2026-02-28');
  });
});

describe('formatPeriodLabel', () => {
  it('labels each view distinctly', () => {
    const anchor = local(2026, 9, 21);
    expect(formatPeriodLabel(anchor, 'month')).toBe('September 2026');
    expect(formatPeriodLabel(anchor, 'day')).toBe('Monday 21 September 2026');
    expect(formatPeriodLabel(anchor, 'week')).toBe('21 – 27 Sep 2026');
  });

  it('spells out both months when a week straddles two', () => {
    expect(formatPeriodLabel(local(2026, 9, 30), 'week')).toBe('28 Sep – 4 Oct 2026');
  });
});

describe('getHourSlots', () => {
  it('is inclusive of both ends', () => {
    const slots = getHourSlots(0, 23);
    expect(slots).toHaveLength(24);
    expect(slots[0]!.label).toBe('00:00');
    expect(slots[23]!.label).toBe('23:00');
  });
});

describe('fractionOfDay', () => {
  it('maps midnight to 0 and midday to 0.5', () => {
    expect(fractionOfDay(local(2026, 9, 21, 0, 0))).toBe(0);
    expect(fractionOfDay(local(2026, 9, 21, 12, 0))).toBe(0.5);
  });
});
