import { describe, expect, it } from 'vitest';
import {
  MONTH_GRID_WEEKS,
  dayKey,
  formatPeriodLabel,
  fractionOfDay,
  getHourSlots,
  getDayRun,
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

describe('getDayRun', () => {
  it('starts at the given day and runs forward', () => {
    const days = getDayRun(local(2026, 9, 30), 3, local(2026, 9, 30));
    expect(days.map((day) => day.key)).toEqual([
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
    ]);
  });

  it('treats every day in the run as in-month', () => {
    // Unlike a month grid, a run has no month to borrow days from — a day
    // greyed out as "not this month" here would be meaningless.
    const days = getDayRun(local(2026, 9, 30), 3, local(2026, 9, 30));
    expect(days.every((day) => day.inMonth)).toBe(true);
  });

  it('marks today and weekends', () => {
    // Fri 2 Oct 2026 through Sun 4 Oct, viewed on the Saturday.
    const days = getDayRun(local(2026, 10, 2), 3, local(2026, 10, 3));
    expect(days.map((day) => day.isWeekend)).toEqual([false, true, true]);
    expect(days.map((day) => day.isToday)).toEqual([false, true, false]);
  });

  it('normalises a mid-day start to the start of that day', () => {
    const days = getDayRun(local(2026, 9, 21, 15, 30), 2, local(2026, 9, 21));
    expect(days[0]!.date.getHours()).toBe(0);
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

  it('covers three days from the anchor in 3day view', () => {
    const { from, to } = getViewRange(local(2026, 9, 24), '3day');
    expect(dayKey(from)).toBe('2026-09-24');
    expect(dayKey(to)).toBe('2026-09-26');
    expect(to.getHours()).toBe(23);
  });

  it('follows a 3day run across a month boundary', () => {
    // The run is anchored on the date, not snapped to a week, so the range
    // has to straddle the month rather than stopping at the 30th.
    const { from, to } = getViewRange(local(2026, 9, 29), '3day');
    expect(dayKey(from)).toBe('2026-09-29');
    expect(dayKey(to)).toBe('2026-10-01');
  });
});

describe('navigate', () => {
  it('steps by the period of the active view', () => {
    const anchor = local(2026, 9, 21);
    expect(dayKey(navigate(anchor, 'day', 1))).toBe('2026-09-22');
    expect(dayKey(navigate(anchor, 'week', 1))).toBe('2026-09-28');
    // Three days forward, so paging never steps over a day it didn't show.
    expect(dayKey(navigate(anchor, '3day', 1))).toBe('2026-09-24');
    expect(dayKey(navigate(anchor, '3day', -1))).toBe('2026-09-18');
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

  it('labels a 3day run by the days it actually shows', () => {
    expect(formatPeriodLabel(local(2026, 9, 21), '3day')).toBe('21 – 23 Sep 2026');
  });

  it('spells out both months when a span straddles two', () => {
    expect(formatPeriodLabel(local(2026, 9, 30), 'week')).toBe('28 Sep – 4 Oct 2026');
    expect(formatPeriodLabel(local(2026, 9, 30), '3day')).toBe('30 Sep – 2 Oct 2026');
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
