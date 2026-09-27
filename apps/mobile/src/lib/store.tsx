import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  type CalendarEvent,
  type Category,
  type List,
  type ListItem,
  type Me,
} from '@date-calendar/core';
import { api } from './api';

/**
 * Everything the app has loaded, in one place.
 *
 * Deliberately not TanStack Query, which the web app uses: there are two
 * screens here and they want the *same* data, so a cache keyed per-hook would
 * mean `me` and `categories` fetched twice and two sources of truth for an item
 * that both screens can toggle. One load, one state, explicit mutators.
 *
 * Swapping to Query later is a contained change — the mutators below are
 * already the only things that write.
 */

interface Data {
  me: Me;
  categories: Category[];
  events: CalendarEvent[];
  lists: List[];
  items: ListItem[];
}

interface Store {
  data: Data | null;
  /** Make sure `[from, to]` has been fetched, widening the window if not. */
  ensureRange: (from: Date, to: Date) => void;
  error: string | null;
  refreshing: boolean;
  refresh: () => Promise<void>;
  /** Replace one item in place, after the server has confirmed the change. */
  replaceItem: (item: ListItem) => void;
  /** Add a newly created item to its list. */
  insertItem: (item: ListItem) => void;
  /** Drop an item entirely — deleting it never touches its scheduled event. */
  removeItem: (itemId: string) => void;
  /** Drop an event and un-schedule anything that pointed at it. */
  removeEvent: (eventId: string) => void;
  /** Insert a new event, or replace one that already exists. */
  upsertEvent: (event: CalendarEvent) => void;
}

const StoreContext = createContext<Store | null>(null);

/**
 * How much calendar to fetch up front.
 *
 * Wide enough that paging through months feels instant and never hits a
 * loading state, small enough to stay one quick request — for two people this
 * is a few hundred rows. `ensureRange` widens it when you navigate past the
 * edge, so the window is a head start rather than a limit.
 */
const MONTHS_BACK = 3;
const MONTHS_FORWARD = 12;

function defaultWindow(): { from: Date; to: Date } {
  const from = new Date();
  from.setMonth(from.getMonth() - MONTHS_BACK, 1);
  from.setHours(0, 0, 0, 0);

  const to = new Date();
  to.setMonth(to.getMonth() + MONTHS_FORWARD, 1);
  to.setHours(23, 59, 59, 999);

  return { from, to };
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [window, setWindow] = useState(defaultWindow);

  const load = useCallback(async (range: { from: Date; to: Date }) => {
    try {
      setError(null);
      const [me, categories, events, lists, items] = await Promise.all([
        api.me(),
        api.listCategories(),
        api.listEvents(range),
        api.listLists(),
        api.listItems(),
      ]);
      setData({ me, categories, events, lists, items });
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : 'Could not reach the API.',
      );
    }
  }, []);

  useEffect(() => {
    void load(window);
  }, [load, window]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load(window);
    setRefreshing(false);
  }, [load, window]);

  /**
   * Extend the fetched window to cover a period the user has navigated to.
   *
   * Widening and refetching the whole span, rather than fetching just the gap
   * and merging, keeps one list with one source of truth — at the cost of a
   * request that is still trivial at this size.
   */
  const ensureRange = useCallback((from: Date, to: Date) => {
    setWindow((current) => {
      if (from >= current.from && to <= current.to) return current;
      return {
        from: from < current.from ? startOfMonthBefore(from) : current.from,
        to: to > current.to ? endOfMonthAfter(to) : current.to,
      };
    });
  }, []);

  const replaceItem = useCallback((item: ListItem) => {
    setData((current) =>
      current
        ? { ...current, items: current.items.map((i) => (i.id === item.id ? item : i)) }
        : current,
    );
  }, []);

  const insertItem = useCallback((item: ListItem) => {
    setData((current) =>
      current ? { ...current, items: [...current.items, item] } : current,
    );
  }, []);

  const removeItem = useCallback((itemId: string) => {
    setData((current) =>
      current
        ? { ...current, items: current.items.filter((i) => i.id !== itemId) }
        : current,
    );
  }, []);

  const removeEvent = useCallback((eventId: string) => {
    setData((current) =>
      current
        ? {
            ...current,
            events: current.events.filter((e) => e.id !== eventId),
            // Mirrors the server's ON DELETE SET NULL: the item survives its
            // event, it just stops being scheduled.
            items: current.items.map((i) =>
              i.scheduledEventId === eventId
                ? { ...i, scheduledEventId: null, scheduledAt: null }
                : i,
            ),
          }
        : current,
    );
  }, []);

  const upsertEvent = useCallback((event: CalendarEvent) => {
    setData((current) => {
      if (!current) return current;
      const exists = current.events.some((e) => e.id === event.id);
      return {
        ...current,
        events: exists
          ? current.events.map((e) => (e.id === event.id ? event : e))
          : [...current.events, event],
      };
    });
  }, []);

  const value = useMemo<Store>(
    () => ({
      data,
      error,
      refreshing,
      ensureRange,
      refresh,
      replaceItem,
      insertItem,
      removeItem,
      removeEvent,
      upsertEvent,
    }),
    [
      data,
      error,
      refreshing,
      ensureRange,
      refresh,
      replaceItem,
      insertItem,
      removeItem,
      removeEvent,
      upsertEvent,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

/** A month's margin either side, so a single step never refetches again. */
function startOfMonthBefore(date: Date): Date {
  const out = new Date(date);
  out.setMonth(out.getMonth() - 1, 1);
  out.setHours(0, 0, 0, 0);
  return out;
}

function endOfMonthAfter(date: Date): Date {
  const out = new Date(date);
  out.setMonth(out.getMonth() + 2, 0);
  out.setHours(23, 59, 59, 999);
  return out;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside <DataProvider>');
  return store;
}
