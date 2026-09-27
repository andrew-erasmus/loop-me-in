import { describe, expect, it } from 'vitest';
import {
  ageInDays,
  formatAge,
  groupItemsByList,
  isStale,
  itemKeenness,
  pendingCount,
  readyToSchedule,
  scheduledItemsByEventId,
  sortItems,
} from '../lists.js';
import type { ListItem } from '../types.js';

function makeItem(id: string, overrides: Partial<ListItem> = {}): ListItem {
  return {
    id,
    listId: 'movies',
    title: id,
    notes: null,
    url: null,
    doneAt: null,
    effort: null,
    cost: null,
    position: 0,
    scheduledEventId: null,
    scheduledAt: null,
    votes: [],
    createdBy: 'alice',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

const BOTH = ['alice', 'bob'];

describe('sortItems', () => {
  it('puts outstanding items before done ones', () => {
    const items = [
      makeItem('done', { doneAt: '2026-09-10T00:00:00.000Z' }),
      makeItem('todo'),
    ];
    expect(sortItems(items).map((i) => i.id)).toEqual(['todo', 'done']);
  });

  it('orders outstanding items by position, then title', () => {
    const items = [
      makeItem('c', { position: 2 }),
      makeItem('a', { position: 1 }),
      makeItem('b', { position: 1 }),
    ];
    expect(sortItems(items).map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('orders done items most-recently-finished first', () => {
    const items = [
      makeItem('older', { doneAt: '2026-09-01T00:00:00.000Z' }),
      makeItem('newer', { doneAt: '2026-09-20T00:00:00.000Z' }),
    ];
    expect(sortItems(items).map((i) => i.id)).toEqual(['newer', 'older']);
  });

  it('does not mutate its input', () => {
    const items = [makeItem('b', { position: 2 }), makeItem('a', { position: 1 })];
    sortItems(items);
    expect(items.map((i) => i.id)).toEqual(['b', 'a']);
  });
});

describe('groupItemsByList', () => {
  it('buckets by list id and sorts each bucket', () => {
    const grouped = groupItemsByList([
      makeItem('m2', { listId: 'movies', position: 2 }),
      makeItem('p1', { listId: 'places' }),
      makeItem('m1', { listId: 'movies', position: 1 }),
    ]);

    expect([...grouped.keys()].sort()).toEqual(['movies', 'places']);
    expect(grouped.get('movies')!.map((i) => i.id)).toEqual(['m1', 'm2']);
    expect(grouped.get('places')!.map((i) => i.id)).toEqual(['p1']);
  });

  it('returns an empty map for no items', () => {
    expect(groupItemsByList([]).size).toBe(0);
  });
});

describe('scheduledItemsByEventId', () => {
  it('indexes only the items that have an event', () => {
    const index = scheduledItemsByEventId([
      makeItem('scheduled', { scheduledEventId: 'evt-1' }),
      makeItem('unscheduled'),
    ]);

    expect(index.size).toBe(1);
    expect(index.get('evt-1')!.id).toBe('scheduled');
  });
});

describe('itemKeenness', () => {
  it('is none with no votes', () => {
    expect(itemKeenness(makeItem('x'), BOTH)).toBe('none');
  });

  it('is some when one of two has voted', () => {
    expect(itemKeenness(makeItem('x', { votes: ['alice'] }), BOTH)).toBe('some');
  });

  it('is all when everyone has voted', () => {
    expect(itemKeenness(makeItem('x', { votes: ['alice', 'bob'] }), BOTH)).toBe('all');
  });

  it('does not count a vote from someone who has left the space', () => {
    // A departed member's vote must not make an item look unanimous.
    expect(itemKeenness(makeItem('x', { votes: ['alice', 'carol'] }), BOTH)).toBe('some');
  });
});

describe('pendingCount', () => {
  it('counts only outstanding items', () => {
    expect(
      pendingCount([
        makeItem('a'),
        makeItem('b'),
        makeItem('c', { doneAt: '2026-09-10T00:00:00.000Z' }),
      ]),
    ).toBe(2);
  });
});

describe('readyToSchedule', () => {
  it('returns unanimous items that are neither done nor already scheduled', () => {
    const items = [
      makeItem('keen', { votes: BOTH }),
      makeItem('half-keen', { votes: ['alice'] }),
      makeItem('already-on', { votes: BOTH, scheduledEventId: 'evt-1' }),
      makeItem('finished', { votes: BOTH, doneAt: '2026-09-10T00:00:00.000Z' }),
    ];
    expect(readyToSchedule(items, BOTH).map((i) => i.id)).toEqual(['keen']);
  });
});

describe('isStale', () => {
  const now = new Date('2026-09-25T00:00:00.000Z');

  it('is false for a freshly created item', () => {
    expect(isStale(makeItem('x', { createdAt: '2026-09-24T00:00:00.000Z' }), { now })).toBe(false);
  });

  it('is true once an outstanding item crosses the threshold', () => {
    expect(isStale(makeItem('x', { createdAt: '2026-09-01T00:00:00.000Z' }), { now })).toBe(true);
  });

  it('respects a custom threshold', () => {
    const item = makeItem('x', { createdAt: '2026-09-20T00:00:00.000Z' });
    expect(isStale(item, { now, thresholdDays: 3 })).toBe(true);
    expect(isStale(item, { now, thresholdDays: 10 })).toBe(false);
  });

  it('is false once the item is done, even if old', () => {
    const item = makeItem('x', {
      createdAt: '2026-09-01T00:00:00.000Z',
      doneAt: '2026-09-05T00:00:00.000Z',
    });
    expect(isStale(item, { now })).toBe(false);
  });

  it('is false once the item is scheduled, even if old', () => {
    const item = makeItem('x', {
      createdAt: '2026-09-01T00:00:00.000Z',
      scheduledEventId: 'evt-1',
    });
    expect(isStale(item, { now })).toBe(false);
  });
});

describe('ageInDays', () => {
  it('counts whole days since creation', () => {
    const now = new Date('2026-09-25T12:00:00.000Z');
    expect(ageInDays(makeItem('x', { createdAt: '2026-09-01T00:00:00.000Z' }), now)).toBe(24);
  });
});

describe('formatAge', () => {
  it('reads as "Added <duration> ago"', () => {
    const now = new Date('2026-09-25T00:00:00.000Z');
    expect(formatAge(makeItem('x', { createdAt: '2026-09-11T00:00:00.000Z' }), now)).toBe(
      'Added 14 days ago',
    );
  });
});
