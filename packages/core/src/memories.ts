import { isDone, isScheduled } from './lists.js';
import type { ListItem } from './types.js';

/**
 * The "memories" timeline: completed plans, most recent first.
 *
 * An item counts as a memory once something actually happened to it — either
 * it was ticked off, or its scheduled date has come and gone even if nobody
 * got around to ticking it off. Purely derived from `ListItem`, the same way
 * `readyToSchedule` is — the list of items the app already has loaded is
 * enough, no separate fetch of calendar history required.
 */

/** The moment worth remembering about an item, or `null` if it isn't one yet. */
export function memoryAt(item: ListItem, now: Date = new Date()): string | null {
  if (item.doneAt) return item.doneAt;
  if (isScheduled(item) && item.scheduledAt && Date.parse(item.scheduledAt) < now.getTime()) {
    return item.scheduledAt;
  }
  return null;
}

/** Whether an item belongs in the memories timeline. */
export function isMemory(item: ListItem, now: Date = new Date()): boolean {
  return isDone(item) || memoryAt(item, now) !== null;
}

/** Memories, most recent first. */
export function sortMemories(items: ListItem[], now: Date = new Date()): ListItem[] {
  return items
    .filter((item) => isMemory(item, now))
    .sort((a, b) => Date.parse(memoryAt(b, now)!) - Date.parse(memoryAt(a, now)!));
}

export interface MemoryGroup {
  /** "2026-09" — sortable and locale-independent. */
  key: string;
  /** "September 2026" for display. */
  label: string;
  items: ListItem[];
}

/** Memories bucketed by the month they happened in, most recent month first. */
export function groupMemoriesByMonth(items: ListItem[], now: Date = new Date()): MemoryGroup[] {
  const groups: MemoryGroup[] = [];

  for (const item of sortMemories(items, now)) {
    const at = new Date(memoryAt(item, now)!);
    const key = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}`;
    const current = groups.at(-1);
    if (current && current.key === key) {
      current.items.push(item);
    } else {
      groups.push({
        key,
        label: at.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        items: [item],
      });
    }
  }

  return groups;
}
