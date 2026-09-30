import { useEffect, useMemo, useRef, useState } from 'react';
import { format, isToday, isTomorrow } from 'date-fns';
import { faArrowUpRightFromSquare, faHeart, faWandMagicSparkles, faThumbsUp } from '@fortawesome/free-solid-svg-icons';
import {
  formatAge,
  groupItemsByList,
  isDone,
  isStale,
  itemKeenness,
  pendingCount,
  type Keenness,
  type List,
  type ListItem,
  type Tier,
  type User,
} from '@date-calendar/core';
import Avatar from '../ui/Avatar.js';
import Icon from '../ui/Icon.js';

/**
 * The lists screen: what to watch, where to go, what to do — and which of it
 * has a date yet.
 *
 * A rail of lists on the left, one list's contents on the right. All the
 * ordering and counting comes from `@date-calendar/core`, so a phone screen
 * showing the same lists differently reuses every rule here.
 */

interface ListsViewProps {
  lists: List[];
  items: ListItem[];
  members: Map<string, User>;
  currentUserId: string;
  selectedListId: string | null;
  onSelectList: (listId: string) => void;
  onNewList: () => void;
  onEditList: (list: List) => void;
  onNewItem: (list: List) => void;
  onSelectItem: (item: ListItem, list: List) => void;
  onToggleDone: (item: ListItem) => void;
  onToggleVote: (item: ListItem) => void;
  onShowDay: (day: Date) => void;
}

const EFFORT_LABELS: Record<Tier, string> = { low: 'Low effort', medium: 'Medium effort', high: 'High effort' };
const COST_SYMBOLS: Record<Tier, string> = { low: '$', medium: '$$', high: '$$$' };

/** "Today", "Tomorrow", or "Fri 3 Oct" — whichever reads fastest. */
function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (isToday(date)) return `Today, ${format(date, 'HH:mm')}`;
  if (isTomorrow(date)) return `Tomorrow, ${format(date, 'HH:mm')}`;
  return format(date, 'EEE d MMM');
}

export default function ListsView({
  lists,
  items,
  members,
  currentUserId,
  selectedListId,
  onSelectList,
  onNewList,
  onEditList,
  onNewItem,
  onSelectItem,
  onToggleDone,
  onToggleVote,
  onShowDay,
}: ListsViewProps) {
  const [showDone, setShowDone] = useState(false);

  const itemsByList = useMemo(() => groupItemsByList(items), [items]);
  const memberIds = useMemo(() => [...members.keys()], [members]);

  /**
   * A little celebration the moment both of you are keen on something.
   *
   * Only fires on the *transition* into unanimous — never on load, so
   * reopening the app doesn't set off a burst of animations for votes cast
   * days ago. `previousKeennessRef` is the memory of "was this already 'all'
   * last time we looked".
   */
  const previousKeennessRef = useRef<Map<string, Keenness>>(new Map());
  const [celebrating, setCelebrating] = useState<Set<string>>(new Set());

  useEffect(() => {
    const previous = previousKeennessRef.current;
    const timeouts: number[] = [];

    for (const item of items) {
      const keenness = itemKeenness(item, memberIds);
      const was = previous.get(item.id);
      if (was !== undefined && was !== 'all' && keenness === 'all') {
        setCelebrating((current) => new Set(current).add(item.id));
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate([15, 40, 15]);
        }
        timeouts.push(
          window.setTimeout(() => {
            setCelebrating((current) => {
              if (!current.has(item.id)) return current;
              const next = new Set(current);
              next.delete(item.id);
              return next;
            });
          }, 700),
        );
      }
      previous.set(item.id, keenness);
    }

    return () => timeouts.forEach((id) => window.clearTimeout(id));
  }, [items, memberIds]);

  const selected = lists.find((list) => list.id === selectedListId) ?? lists[0] ?? null;
  const selectedItems = selected ? (itemsByList.get(selected.id) ?? []) : [];
  const visibleItems = showDone
    ? selectedItems
    : selectedItems.filter((item) => !isDone(item));
  const doneCount = selectedItems.length - selectedItems.filter((i) => !isDone(i)).length;

  if (lists.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <Icon icon={faWandMagicSparkles} size="lg" className="text-4xl text-moss-300" />
        <p className="display text-2xl text-moss-950">No lists yet</p>
        <p className="max-w-xs text-sm text-moss-500">
          Keep the films you keep meaning to watch, the places you keep meaning to go, and
          the things you keep meaning to do — then give one of them a date.
        </p>
        <button
          type="button"
          onClick={onNewList}
          className="mt-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-pressed"
        >
          Make a list
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      {/* Rail — desktop only. Below `md` this becomes the chip strip further
          down, RN's own trade for the same "no room for a sidebar" reason. */}
      <nav
        aria-label="Lists"
        className="hidden w-60 shrink-0 flex-col gap-1 overflow-y-auto border-r border-moss-200/80 bg-moss-50/70 p-3 md:flex"
      >
        {lists.map((list) => {
          const listItems = itemsByList.get(list.id) ?? [];
          const outstanding = pendingCount(listItems);
          const active = selected?.id === list.id;

          return (
            <button
              key={list.id}
              type="button"
              onClick={() => onSelectList(list.id)}
              aria-current={active ? 'true' : undefined}
              className={`flex items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm font-semibold transition ${
                active
                  ? 'bg-white text-primary shadow-sm ring-1 ring-moss-950/5'
                  : 'text-moss-500 hover:bg-moss-200/50 hover:text-moss-900'
              }`}
            >
              <span
                aria-hidden
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base"
                style={{ backgroundColor: `${list.color}1a` }}
              >
                {list.emoji ?? '•'}
              </span>
              <span className="min-w-0 flex-1 truncate">{list.name}</span>
              {outstanding > 0 && (
                <span className="shrink-0 rounded-full bg-moss-200/70 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-moss-500">
                  {outstanding}
                </span>
              )}
            </button>
          );
        })}

        <button
          type="button"
          onClick={onNewList}
          className="mt-1 rounded-xl px-2.5 py-2 text-left text-sm font-semibold text-moss-400 transition hover:bg-moss-200/50 hover:text-moss-900"
        >
          + New list
        </button>
      </nav>

      {/* Chip strip — phone width only. RN's horizontal strip of lists above
          the items, since there's no room for a sidebar. */}
      <div
        aria-label="Lists"
        className="flex shrink-0 gap-2 overflow-x-auto border-b border-moss-200/80 bg-white px-4 py-3 md:hidden"
      >
        {lists.map((list) => {
          const outstanding = pendingCount(itemsByList.get(list.id) ?? []);
          const active = selected?.id === list.id;

          return (
            <button
              key={list.id}
              type="button"
              onClick={() => onSelectList(list.id)}
              aria-current={active ? 'true' : undefined}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold transition ${
                active ? 'bg-primary text-white' : 'bg-moss-100 text-moss-600'
              }`}
            >
              <span aria-hidden className="text-sm">
                {list.emoji ?? '•'}
              </span>
              {list.name}
              {outstanding > 0 && (
                <span className={active ? 'text-white/70' : 'text-moss-400'}>
                  {outstanding}
                </span>
              )}
            </button>
          );
        })}

        <button
          type="button"
          onClick={onNewList}
          className="shrink-0 rounded-full bg-moss-100 px-3 py-2 text-sm font-semibold text-moss-400"
        >
          + New
        </button>
      </div>

      {/* Items */}
      <section className="min-w-0 flex-1 overflow-y-auto overscroll-contain">
        {selected && (
          <>
            <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-moss-200/80 bg-white/90 px-6 py-4 backdrop-blur">
              <h2 className="display flex items-center gap-2.5 text-2xl text-moss-950">
                <span aria-hidden className="text-xl">
                  {selected.emoji ?? '•'}
                </span>
                {selected.name}
              </h2>
              <button
                type="button"
                onClick={() => onEditList(selected)}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-moss-400 transition hover:bg-moss-100 hover:text-moss-900"
              >
                Edit
              </button>

              <div className="flex-1" />

              {doneCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowDone((current) => !current)}
                  className="rounded-lg px-2 py-1 text-xs font-semibold text-moss-400 transition hover:bg-moss-100 hover:text-moss-900"
                >
                  {showDone ? 'Hide' : 'Show'} {doneCount} done
                </button>
              )}

              <button
                type="button"
                onClick={() => onNewItem(selected)}
                className="rounded-lg bg-primary px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-primary-pressed"
              >
                Add
              </button>
            </div>

            {visibleItems.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-20 text-center">
                <p className="text-3xl opacity-40" aria-hidden>
                  {selected.emoji ?? '📋'}
                </p>
                <p className="display text-lg text-moss-950">
                  {showDone && doneCount > 0 ? 'All done here' : 'Nothing here yet'}
                </p>
                <p className="max-w-xs text-sm text-moss-400">
                  Add the first thing to <strong className="font-semibold text-moss-500">{selected.name}</strong> and
                  you can give it a date whenever you both fancy it.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-moss-100">
                {visibleItems.map((item) => {
                  const done = isDone(item);
                  const keenness = itemKeenness(item, memberIds);
                  const iAmKeen = item.votes.includes(currentUserId);
                  const stale = isStale(item);
                  const justMatched = celebrating.has(item.id);

                  return (
                    <li key={item.id}>
                      <div
                        className={`flex items-start gap-3.5 px-6 py-3.5 transition hover:bg-moss-50/80 ${
                          done ? 'opacity-45' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={done}
                          onChange={() => onToggleDone(item)}
                          aria-label={done ? `Mark ${item.title} as not done` : `Mark ${item.title} as done`}
                          className="mt-1 h-[18px] w-[18px] shrink-0 rounded-md border-moss-300 accent-primary"
                        />

                        <button
                          type="button"
                          onClick={() => onSelectItem(item, selected)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <span
                            className={`block text-[15px] font-medium text-moss-900 ${
                              done ? 'line-through' : ''
                            }`}
                          >
                            {item.title}
                          </span>
                          {item.notes && (
                            <span className="mt-0.5 block truncate text-[13px] text-moss-400">
                              {item.notes}
                            </span>
                          )}
                          {(item.effort || item.cost) && (
                            <span className="mt-1 flex items-center gap-1.5">
                              {item.effort && (
                                <span className="rounded-full bg-moss-100 px-1.5 py-0.5 text-[10px] font-semibold text-moss-500">
                                  {EFFORT_LABELS[item.effort]}
                                </span>
                              )}
                              {item.cost && (
                                <span className="rounded-full bg-moss-100 px-1.5 py-0.5 text-[10px] font-semibold text-moss-500">
                                  {COST_SYMBOLS[item.cost]}
                                </span>
                              )}
                            </span>
                          )}
                        </button>

                        {item.url && (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noreferrer noopener"
                            onClick={(clickEvent) => clickEvent.stopPropagation()}
                            title="Open link"
                            className="shrink-0 rounded-md p-1 text-moss-400 transition hover:bg-moss-200 hover:text-moss-700"
                          >
                            <Icon icon={faArrowUpRightFromSquare} size="sm" />
                          </a>
                        )}

                        {/* Sat around a while with no decision made on it. */}
                        {stale && (
                          <span
                            title={`Added ${format(new Date(item.createdAt), 'd MMM')}`}
                            className="shrink-0 rounded-full bg-amber-100/70 px-2.5 py-1 text-[11px] font-bold text-amber-700"
                          >
                            {formatAge(item)}
                          </span>
                        )}

                        {/* The date, and a way back to it on the grid. */}
                        {item.scheduledAt && (
                          <button
                            type="button"
                            onClick={() => onShowDay(new Date(item.scheduledAt!))}
                            title="Show this on the calendar"
                            className="shrink-0 rounded-full bg-moss-900 px-2.5 py-1 text-[11px] font-bold tracking-wide text-white transition hover:bg-moss-700"
                          >
                            {formatWhen(item.scheduledAt)}
                          </button>
                        )}

                        {/* Who's keen. Both of you lights it up. */}
                        <button
                          type="button"
                          onClick={() => onToggleVote(item)}
                          aria-pressed={iAmKeen}
                          title={iAmKeen ? 'Withdraw your vote' : "I'm keen"}
                          className={`flex shrink-0 items-center gap-1.5 rounded-full py-1 pr-2 pl-2.5 text-xs transition ${
                            keenness === 'all'
                              ? 'bg-emerald-100/70 text-emerald-800'
                              : iAmKeen
                                ? 'bg-moss-100 text-moss-600'
                                : 'text-moss-300 hover:bg-moss-100 hover:text-moss-500'
                          } ${justMatched ? 'animate-match' : ''}`}
                        >
                          <Icon
                            icon={keenness === 'all' ? faHeart : faThumbsUp}
                            size="xs"
                            className={keenness === 'all' ? 'text-emerald-600' : 'text-current'}
                          />
                          {item.votes.length > 0 && (
                            <span className="flex -space-x-1">
                              {item.votes.map((userId) => {
                                const voter = members.get(userId);
                                return voter ? (
                                  <Avatar key={userId} user={voter} size="xs" />
                                ) : null;
                              })}
                            </span>
                          )}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  );
}
