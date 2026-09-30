import { useMemo } from 'react';
import { format } from 'date-fns';
import { faClockRotateLeft } from '@fortawesome/free-solid-svg-icons';
import { groupMemoriesByMonth, listsById, memoryAt, type List, type ListItem } from '@date-calendar/core';
import Icon from '../ui/Icon.js';

/**
 * Completed plans, most recent first — a record of what you have actually
 * done together rather than another to-do list. Grouped by month, the way a
 * photo timeline would be.
 */

interface MemoriesViewProps {
  items: ListItem[];
  lists: List[];
  onSelectItem: (item: ListItem, list: List) => void;
}

export default function MemoriesView({ items, lists, onSelectItem }: MemoriesViewProps) {
  const listIndex = useMemo(() => listsById(lists), [lists]);
  const groups = useMemo(() => groupMemoriesByMonth(items), [items]);

  if (groups.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <Icon icon={faClockRotateLeft} size="lg" className="text-4xl text-moss-300" />
        <p className="display text-2xl text-moss-950">No memories yet</p>
        <p className="max-w-xs text-sm text-moss-500">
          Tick something off, or let a scheduled plan's date arrive, and it shows up here.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto h-full max-w-2xl overflow-y-auto overscroll-contain px-6 py-8">
      {groups.map((group) => (
        <section key={group.key} className="mb-8">
          <h2 className="display mb-3 text-lg text-moss-950">{group.label}</h2>
          <ul className="space-y-2">
            {group.items.map((item) => {
              const list = listIndex.get(item.listId);
              const at = memoryAt(item);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => list && onSelectItem(item, list)}
                    className="flex w-full items-center gap-3 rounded-xl border border-moss-200/80 bg-white px-4 py-3 text-left transition hover:border-moss-300 hover:shadow-sm"
                  >
                    <span
                      aria-hidden
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base"
                      style={{ backgroundColor: `${list?.color ?? '#a1a1aa'}1a` }}
                    >
                      {list?.emoji ?? '•'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium text-moss-900">
                        {item.title}
                      </span>
                      <span className="block text-xs text-moss-400">
                        {list?.name ?? 'Deleted list'}
                      </span>
                    </span>
                    {at && (
                      <span className="shrink-0 text-xs font-medium text-moss-400">
                        {format(new Date(at), 'd MMM')}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
