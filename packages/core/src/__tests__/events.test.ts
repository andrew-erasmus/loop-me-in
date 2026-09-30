import { describe, expect, it } from 'vitest';
import {
  canEditEvent,
  categoryMap,
  eventColor,
  eventsOnDay,
  filterByCategories,
  filterByQuery,
  groupByDay,
  isHiddenSurprise,
  sortByStart,
} from '../events.js';
import { ORPHAN_EVENT_COLOR, type CalendarEvent, type Category } from '../types.js';

function makeEvent(
  id: string,
  startsAt: Date,
  endsAt: Date,
  overrides: Partial<CalendarEvent> = {},
): CalendarEvent {
  return {
    id,
    title: id,
    notes: null,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    allDay: false,
    visibility: 'shared',
    categoryId: null,
    createdBy: null,
    createdAt: startsAt.toISOString(),
    updatedAt: startsAt.toISOString(),
    ...overrides,
  };
}

const local = (d: number, h = 0, min = 0) => new Date(2026, 8, d, h, min);

describe('groupByDay', () => {
  it('files a single-day event under one key', () => {
    const grouped = groupByDay([makeEvent('a', local(21, 9), local(21, 10))]);
    expect([...grouped.keys()]).toEqual(['2026-09-21']);
  });

  it('files a multi-day event under every day it touches', () => {
    const grouped = groupByDay([makeEvent('trip', local(21, 18), local(24, 12))]);
    expect([...grouped.keys()].sort()).toEqual([
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
    ]);
  });

  it('sorts each day with all-day events first, then by start time', () => {
    const grouped = groupByDay([
      makeEvent('late', local(21, 16), local(21, 17)),
      makeEvent('early', local(21, 9), local(21, 10)),
      makeEvent('holiday', local(21, 12), local(21, 13), { allDay: true }),
    ]);
    expect(grouped.get('2026-09-21')!.map((e) => e.id)).toEqual([
      'holiday',
      'early',
      'late',
    ]);
  });

  it('skips events with unparseable timestamps rather than throwing', () => {
    const broken = makeEvent('broken', local(21, 9), local(21, 10));
    broken.startsAt = 'not-a-date';
    expect(groupByDay([broken]).size).toBe(0);
  });
});

describe('eventsOnDay', () => {
  it('includes an event that merely overlaps the day', () => {
    const spanning = makeEvent('trip', local(20, 18), local(22, 12));
    expect(eventsOnDay([spanning], local(21)).map((e) => e.id)).toEqual(['trip']);
  });

  it('excludes an event that ends before the day starts', () => {
    const past = makeEvent('past', local(19, 9), local(19, 10));
    expect(eventsOnDay([past], local(21))).toHaveLength(0);
  });
});

describe('sortByStart', () => {
  it('does not mutate its input', () => {
    const events = [
      makeEvent('b', local(21, 16), local(21, 17)),
      makeEvent('a', local(21, 9), local(21, 10)),
    ];
    const original = events.map((e) => e.id);
    sortByStart(events);
    expect(events.map((e) => e.id)).toEqual(original);
  });
});

describe('eventColor', () => {
  const categories: Category[] = [
    { id: 'work', name: 'Work', color: '#3b82f6', createdAt: '' },
  ];
  const map = categoryMap(categories);

  it('uses the category colour', () => {
    const event = makeEvent('a', local(21, 9), local(21, 10), { categoryId: 'work' });
    expect(eventColor(event, map)).toBe('#3b82f6');
  });

  it('falls back to grey for an uncategorised event', () => {
    const event = makeEvent('a', local(21, 9), local(21, 10));
    expect(eventColor(event, map)).toBe(ORPHAN_EVENT_COLOR);
  });

  it('falls back to grey when the category was deleted', () => {
    const event = makeEvent('a', local(21, 9), local(21, 10), { categoryId: 'gone' });
    expect(eventColor(event, map)).toBe(ORPHAN_EVENT_COLOR);
  });
});

describe('filterByCategories', () => {
  const events = [
    makeEvent('work', local(21, 9), local(21, 10), { categoryId: 'work' }),
    makeEvent('gym', local(21, 11), local(21, 12), { categoryId: 'health' }),
    makeEvent('loose', local(21, 13), local(21, 14)),
  ];

  it('returns everything when nothing is hidden', () => {
    expect(filterByCategories(events, new Set())).toHaveLength(3);
  });

  it('drops events in hidden categories', () => {
    expect(filterByCategories(events, new Set(['work'])).map((e) => e.id)).toEqual([
      'gym',
      'loose',
    ]);
  });

  it('keeps uncategorised events regardless of filters', () => {
    const visible = filterByCategories(events, new Set(['work', 'health']));
    expect(visible.map((e) => e.id)).toEqual(['loose']);
  });
});

describe('filterByQuery', () => {
  const events = [
    makeEvent('dentist', local(21, 9), local(21, 10), { notes: 'Bring the form' }),
    makeEvent('Cinema', local(21, 19), local(21, 21)),
    makeEvent('walk', local(22, 8), local(22, 9), { notes: null }),
  ];

  it('returns everything for a blank or whitespace query', () => {
    expect(filterByQuery(events, '')).toHaveLength(3);
    expect(filterByQuery(events, '   ')).toHaveLength(3);
  });

  it('matches titles case-insensitively', () => {
    expect(filterByQuery(events, 'cine').map((e) => e.id)).toEqual(['Cinema']);
  });

  it('matches notes as well as titles', () => {
    expect(filterByQuery(events, 'form').map((e) => e.id)).toEqual(['dentist']);
  });

  it('returns nothing when a real query matches nothing', () => {
    expect(filterByQuery(events, 'holiday')).toHaveLength(0);
  });
});

describe('isHiddenSurprise', () => {
  const surprise = makeEvent('s', new Date(), new Date(), {
    visibility: 'surprise',
    createdBy: 'bob',
  });

  it('hides someone else\u2019s surprise from you', () => {
    expect(isHiddenSurprise(surprise, 'alice')).toBe(true);
  });

  it('does not hide your own surprise from you', () => {
    expect(isHiddenSurprise(surprise, 'bob')).toBe(false);
  });

  it('hides it from a signed-out viewer rather than revealing it', () => {
    // Fail closed: no viewer means no claim to be the planner.
    expect(isHiddenSurprise(surprise, null)).toBe(true);
  });

  it('leaves shared and private events alone', () => {
    const shared = makeEvent('a', new Date(), new Date(), { createdBy: 'bob' });
    const priv = makeEvent('b', new Date(), new Date(), {
      visibility: 'private',
      createdBy: 'bob',
    });
    expect(isHiddenSurprise(shared, 'alice')).toBe(false);
    // A private event never reaches the other person at all, so there is
    // nothing here to redact.
    expect(isHiddenSurprise(priv, 'alice')).toBe(false);
  });
});

describe('canEditEvent', () => {
  it('refuses only the surprise that is not yours', () => {
    const mine = makeEvent('m', new Date(), new Date(), {
      visibility: 'surprise',
      createdBy: 'alice',
    });
    const theirs = makeEvent('t', new Date(), new Date(), {
      visibility: 'surprise',
      createdBy: 'bob',
    });
    const shared = makeEvent('s', new Date(), new Date(), { createdBy: 'bob' });

    expect(canEditEvent(mine, 'alice')).toBe(true);
    expect(canEditEvent(theirs, 'alice')).toBe(false);
    // A shared calendar is jointly owned: her events are yours to move.
    expect(canEditEvent(shared, 'alice')).toBe(true);
  });
});
