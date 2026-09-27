import { formatDistanceStrict } from 'date-fns';
import type { List, ListItem } from './types.js';

/**
 * Querying and grouping over lists and their items. Pure functions, same rule
 * as the rest of this package — the web `ListsView` calls these rather than
 * filtering inline, so a mobile list screen gets the behaviour for free.
 */

/** Whether an item has been ticked off. */
export function isDone(item: ListItem): boolean {
  return item.doneAt !== null;
}

/** Whether an item has a date on the calendar. */
export function isScheduled(item: ListItem): boolean {
  return item.scheduledEventId !== null;
}

/**
 * Outstanding items first, then by position, then alphabetically.
 *
 * Done items sink rather than disappear: the list doubles as a record of what
 * you have actually done together, which is half the point of keeping it.
 */
export function sortItems(items: ListItem[]): ListItem[] {
  return [...items].sort((a, b) => {
    if (isDone(a) !== isDone(b)) return isDone(a) ? 1 : -1;

    // Among done items the most recently finished reads first — that ordering
    // is the interesting one once something is in the past.
    if (isDone(a) && isDone(b)) {
      return Date.parse(b.doneAt!) - Date.parse(a.doneAt!);
    }

    return a.position - b.position || a.title.localeCompare(b.title);
  });
}

/** Bucket items by their list id, each bucket already sorted. */
export function groupItemsByList(items: ListItem[]): Map<string, ListItem[]> {
  const buckets = new Map<string, ListItem[]>();

  for (const item of items) {
    const bucket = buckets.get(item.listId);
    if (bucket) bucket.push(item);
    else buckets.set(item.listId, [item]);
  }

  for (const [listId, bucket] of buckets) {
    buckets.set(listId, sortItems(bucket));
  }

  return buckets;
}

/**
 * Items indexed by the event they are scheduled as.
 *
 * This is the calendar's half of the link, and the reason scheduling needs no
 * extra endpoint: the client already holds every item, so an event can find the
 * item it came from with a Map lookup instead of a round trip per event.
 */
export function scheduledItemsByEventId(items: ListItem[]): Map<string, ListItem> {
  const index = new Map<string, ListItem>();
  for (const item of items) {
    if (item.scheduledEventId) index.set(item.scheduledEventId, item);
  }
  return index;
}

export function listsById(lists: List[]): Map<string, List> {
  return new Map(lists.map((list) => [list.id, list]));
}

/** How many outstanding items a list has, for the count beside its name. */
export function pendingCount(items: ListItem[]): number {
  return items.filter((item) => !isDone(item)).length;
}

/**
 * How keen the space is on an item.
 *
 * `all` means everyone has voted for it — for the two-person case this is the
 * "we're both keen" state that makes an item worth scheduling next.
 */
export type Keenness = 'none' | 'some' | 'all';

export function itemKeenness(item: ListItem, memberIds: string[]): Keenness {
  if (item.votes.length === 0) return 'none';
  if (memberIds.length === 0) return 'some';
  const voted = new Set(item.votes);
  return memberIds.every((id) => voted.has(id)) ? 'all' : 'some';
}

/**
 * Items everyone is keen on but nobody has scheduled — the answer to "what
 * should we actually do this weekend".
 */
export function readyToSchedule(items: ListItem[], memberIds: string[]): ListItem[] {
  return sortItems(
    items.filter(
      (item) =>
        !isDone(item) &&
        !isScheduled(item) &&
        itemKeenness(item, memberIds) === 'all',
    ),
  );
}

const DEFAULT_STALE_THRESHOLD_DAYS = 14;

/**
 * An item that has sat outstanding for a while with nothing happening to it —
 * not done, not scheduled. The nudge to actually decide on it.
 */
export function isStale(
  item: ListItem,
  { thresholdDays = DEFAULT_STALE_THRESHOLD_DAYS, now = new Date() }: { thresholdDays?: number; now?: Date } = {},
): boolean {
  if (isDone(item) || isScheduled(item)) return false;
  const ageMs = now.getTime() - Date.parse(item.createdAt);
  return ageMs >= thresholdDays * 24 * 60 * 60 * 1000;
}

/** How many whole days old an item is. */
export function ageInDays(item: ListItem, now: Date = new Date()): number {
  return Math.floor((now.getTime() - Date.parse(item.createdAt)) / (24 * 60 * 60 * 1000));
}

/** "Added 3 weeks ago" — the nudge badge's copy, shared so web and mobile read identically. */
export function formatAge(item: ListItem, now: Date = new Date()): string {
  return `Added ${formatDistanceStrict(Date.parse(item.createdAt), now, { addSuffix: true })}`;
}
