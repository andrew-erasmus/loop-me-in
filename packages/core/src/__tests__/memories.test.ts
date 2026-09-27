import { describe, expect, it } from 'vitest';
import { groupMemoriesByMonth, isMemory, memoryAt, sortMemories } from '../memories.js';
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
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const NOW = new Date('2026-09-25T00:00:00.000Z');

describe('memoryAt', () => {
  it('is the done instant, when done', () => {
    const item = makeItem('x', { doneAt: '2026-09-10T00:00:00.000Z' });
    expect(memoryAt(item, NOW)).toBe('2026-09-10T00:00:00.000Z');
  });

  it('is the scheduled instant, when scheduled for the past and not done', () => {
    const item = makeItem('x', {
      scheduledEventId: 'evt-1',
      scheduledAt: '2026-09-01T00:00:00.000Z',
    });
    expect(memoryAt(item, NOW)).toBe('2026-09-01T00:00:00.000Z');
  });

  it('is null when scheduled for the future', () => {
    const item = makeItem('x', {
      scheduledEventId: 'evt-1',
      scheduledAt: '2026-10-01T00:00:00.000Z',
    });
    expect(memoryAt(item, NOW)).toBeNull();
  });

  it('is null for an untouched item', () => {
    expect(memoryAt(makeItem('x'), NOW)).toBeNull();
  });

  it('prefers doneAt over a past scheduled date', () => {
    const item = makeItem('x', {
      doneAt: '2026-09-15T00:00:00.000Z',
      scheduledEventId: 'evt-1',
      scheduledAt: '2026-09-01T00:00:00.000Z',
    });
    expect(memoryAt(item, NOW)).toBe('2026-09-15T00:00:00.000Z');
  });
});

describe('isMemory', () => {
  it('is true once done, even without a schedule', () => {
    expect(isMemory(makeItem('x', { doneAt: '2026-09-10T00:00:00.000Z' }), NOW)).toBe(true);
  });

  it('is false for an outstanding, unscheduled item', () => {
    expect(isMemory(makeItem('x'), NOW)).toBe(false);
  });

  it('is false for something scheduled in the future', () => {
    const item = makeItem('x', { scheduledEventId: 'evt-1', scheduledAt: '2026-12-25T00:00:00.000Z' });
    expect(isMemory(item, NOW)).toBe(false);
  });
});

describe('sortMemories', () => {
  it('keeps only memories, most recent first', () => {
    const items = [
      makeItem('old', { doneAt: '2026-08-01T00:00:00.000Z' }),
      makeItem('future', { scheduledEventId: 'evt-1', scheduledAt: '2026-12-01T00:00:00.000Z' }),
      makeItem('untouched'),
      makeItem('recent', { doneAt: '2026-09-20T00:00:00.000Z' }),
    ];
    expect(sortMemories(items, NOW).map((i) => i.id)).toEqual(['recent', 'old']);
  });
});

describe('groupMemoriesByMonth', () => {
  it('buckets by month, most recent month and item first', () => {
    const items = [
      makeItem('aug1', { doneAt: '2026-08-05T00:00:00.000Z' }),
      makeItem('sep-early', { doneAt: '2026-09-02T00:00:00.000Z' }),
      makeItem('sep-late', { doneAt: '2026-09-20T00:00:00.000Z' }),
      makeItem('aug2', { doneAt: '2026-08-20T00:00:00.000Z' }),
    ];
    const groups = groupMemoriesByMonth(items, NOW);

    expect(groups.map((g) => g.key)).toEqual(['2026-09', '2026-08']);
    expect(groups[0]!.label).toBe('September 2026');
    expect(groups[0]!.items.map((i) => i.id)).toEqual(['sep-late', 'sep-early']);
    expect(groups[1]!.items.map((i) => i.id)).toEqual(['aug2', 'aug1']);
  });
});
