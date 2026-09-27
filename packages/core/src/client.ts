import { z } from 'zod';
import {
  calendarEventSchema,
  categorySchema,
  inviteSchema,
  listItemSchema,
  listSchema,
  meSchema,
  scheduledItemSchema,
  suggestedSlotSchema,
  type CalendarEvent,
  type Category,
  type CategoryInput,
  type CategoryPatch,
  type EventInput,
  type EventPatch,
  type Invite,
  type List,
  type ListInput,
  type ListItem,
  type ListItemInput,
  type ListItemPatch,
  type ListPatch,
  type Me,
  type ScheduleItemInput,
  type ScheduledItem,
  type SuggestedSlot,
} from './types.js';

/**
 * Typed API client built on `fetch`.
 *
 * `fetch` is global in browsers and in React Native, so this file moves to the
 * mobile app unchanged — only `baseUrl` differs (a relative path behind Vite's
 * dev proxy on web, an absolute LAN or production URL on device).
 */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** True for the one status the UI treats as "show the sign-in screen". */
export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

export interface CalendarClientOptions {
  /** Defaults to `/api`, which Vite proxies to the API in development. */
  baseUrl?: string;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetchFn?: typeof fetch;
}

export function createCalendarClient(options: CalendarClientOptions = {}) {
  const baseUrl = (options.baseUrl ?? '/api').replace(/\/$/, '');
  const doFetch = options.fetchFn ?? globalThis.fetch.bind(globalThis);

  async function request<T>(
    path: string,
    init: RequestInit,
    parse: (data: unknown) => T,
  ): Promise<T> {
    const response = await doFetch(`${baseUrl}${path}`, {
      ...init,
      // The session lives in an HttpOnly cookie. Same-origin behind Vite's
      // proxy this is already the default, but the mobile app and any deployed
      // split-origin setup send nothing without it — cheap now, silent 401s
      // later.
      credentials: 'include',
      headers: {
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...init.headers,
      },
    });

    if (!response.ok) {
      // The API returns `{ error, details? }`; fall back to the status text if
      // something else (a proxy, say) produced the failure.
      let message = response.statusText;
      let details: unknown;
      try {
        const body = (await response.json()) as { error?: string; details?: unknown };
        if (body?.error) message = body.error;
        details = body?.details;
      } catch {
        // Non-JSON error body — keep the status text.
      }
      throw new ApiError(message, response.status, details);
    }

    if (response.status === 204) {
      // Drain the (empty) body so the connection isn't left half-read — an
      // unconsumed response shows up in devtools as an aborted request even
      // though the call succeeded.
      await response.arrayBuffer();
      return parse(undefined);
    }
    return parse(await response.json());
  }

  const parseEvents = (data: unknown) => calendarEventSchema.array().parse(data);
  const parseEvent = (data: unknown) => calendarEventSchema.parse(data);
  const parseCategories = (data: unknown) => categorySchema.array().parse(data);
  const parseCategory = (data: unknown) => categorySchema.parse(data);
  const parseLists = (data: unknown) => listSchema.array().parse(data);
  const parseList = (data: unknown) => listSchema.parse(data);
  const parseItems = (data: unknown) => listItemSchema.array().parse(data);
  const parseItem = (data: unknown) => listItemSchema.parse(data);
  const recordOfNumbers = z.record(z.string(), z.number());

  const id = encodeURIComponent;

  return {
    /* ---------------------------------------------------------------- auth */

    /** Who you are and which space you're in. Throws a 401 when signed out. */
    me(): Promise<Me> {
      return request('/auth/me', { method: 'GET' }, (data) => meSchema.parse(data));
    },

    logout(): Promise<void> {
      return request('/auth/logout', { method: 'POST' }, () => undefined);
    },

    /** Switch which space this session is looking at. */
    switchSpace(spaceId: string): Promise<Me> {
      return request(
        '/auth/space',
        { method: 'PUT', body: JSON.stringify({ spaceId }) },
        (data) => meSchema.parse(data),
      );
    },

    /** Rename a space you belong to. */
    renameSpace(spaceId: string, name: string): Promise<Me> {
      return request(
        `/spaces/${id(spaceId)}`,
        { method: 'PATCH', body: JSON.stringify({ name }) },
        (data) => meSchema.parse(data),
      );
    },

    /** Mint a single-use invite link for the other person. */
    createInvite(): Promise<Invite> {
      return request('/spaces/invites', { method: 'POST' }, (data) =>
        inviteSchema.parse(data),
      );
    },

    /** Redeem an invite code, joining that space and switching to it. */
    joinSpace(code: string): Promise<Me> {
      return request(
        '/spaces/join',
        { method: 'POST', body: JSON.stringify({ code }) },
        (data) => meSchema.parse(data),
      );
    },

    /** Remove someone else from the space you are both in. */
    removeMember(userId: string): Promise<Me> {
      return request(`/spaces/members/${id(userId)}`, { method: 'DELETE' }, (data) =>
        meSchema.parse(data),
      );
    },

    /* -------------------------------------------------------------- events */

    listEvents(range: { from: Date; to: Date }): Promise<CalendarEvent[]> {
      const query = new URLSearchParams({
        from: range.from.toISOString(),
        to: range.to.toISOString(),
      });
      return request(`/events?${query}`, { method: 'GET' }, parseEvents);
    },

    createEvent(input: EventInput): Promise<CalendarEvent> {
      return request('/events', { method: 'POST', body: JSON.stringify(input) }, parseEvent);
    },

    updateEvent(eventId: string, patch: EventPatch): Promise<CalendarEvent> {
      return request(
        `/events/${id(eventId)}`,
        { method: 'PATCH', body: JSON.stringify(patch) },
        parseEvent,
      );
    },

    deleteEvent(eventId: string): Promise<void> {
      return request(`/events/${id(eventId)}`, { method: 'DELETE' }, () => undefined);
    },

    /* ---------------------------------------------------------- categories */

    listCategories(): Promise<Category[]> {
      return request('/categories', { method: 'GET' }, parseCategories);
    },

    /** Event count per category id, for the delete-confirmation dialog. */
    categoryEventCounts(): Promise<Record<string, number>> {
      return request('/categories/counts', { method: 'GET' }, (data) =>
        recordOfNumbers.parse(data),
      );
    },

    createCategory(input: CategoryInput): Promise<Category> {
      return request(
        '/categories',
        { method: 'POST', body: JSON.stringify(input) },
        parseCategory,
      );
    },

    updateCategory(categoryId: string, patch: CategoryPatch): Promise<Category> {
      return request(
        `/categories/${id(categoryId)}`,
        { method: 'PATCH', body: JSON.stringify(patch) },
        parseCategory,
      );
    },

    deleteCategory(categoryId: string): Promise<void> {
      return request(
        `/categories/${id(categoryId)}`,
        { method: 'DELETE' },
        () => undefined,
      );
    },

    /* --------------------------------------------------------------- lists */

    listLists(): Promise<List[]> {
      return request('/lists', { method: 'GET' }, parseLists);
    },

    createList(input: ListInput): Promise<List> {
      return request('/lists', { method: 'POST', body: JSON.stringify(input) }, parseList);
    },

    updateList(listId: string, patch: ListPatch): Promise<List> {
      return request(
        `/lists/${id(listId)}`,
        { method: 'PATCH', body: JSON.stringify(patch) },
        parseList,
      );
    },

    deleteList(listId: string): Promise<void> {
      return request(`/lists/${id(listId)}`, { method: 'DELETE' }, () => undefined);
    },

    /** Every item in the space, across all lists — they are small enough. */
    listItems(): Promise<ListItem[]> {
      return request('/items', { method: 'GET' }, parseItems);
    },

    createItem(listId: string, input: ListItemInput): Promise<ListItem> {
      return request(
        `/lists/${id(listId)}/items`,
        { method: 'POST', body: JSON.stringify(input) },
        parseItem,
      );
    },

    updateItem(itemId: string, patch: ListItemPatch): Promise<ListItem> {
      return request(
        `/items/${id(itemId)}`,
        { method: 'PATCH', body: JSON.stringify(patch) },
        parseItem,
      );
    },

    deleteItem(itemId: string): Promise<void> {
      return request(`/items/${id(itemId)}`, { method: 'DELETE' }, () => undefined);
    },

    /** Add or remove your own "I'm keen" vote. */
    setItemVote(itemId: string, keen: boolean): Promise<ListItem> {
      return request(
        `/items/${id(itemId)}/vote`,
        { method: keen ? 'PUT' : 'DELETE' },
        parseItem,
      );
    },

    /**
     * Put an item on the calendar. Creates the event and links it, or moves the
     * existing event if the item is already scheduled.
     */
    scheduleItem(itemId: string, input: ScheduleItemInput): Promise<ScheduledItem> {
      return request(
        `/items/${id(itemId)}/schedule`,
        { method: 'POST', body: JSON.stringify(input) },
        (data) => scheduledItemSchema.parse(data),
      );
    },

    /** Take an item off the calendar, deleting its event but keeping the item. */
    unscheduleItem(itemId: string): Promise<ListItem> {
      return request(`/items/${id(itemId)}/schedule`, { method: 'DELETE' }, parseItem);
    },

    /** Candidate times to schedule an item at where neither of you is busy. */
    suggestItemSlots(
      itemId: string,
      options: { durationMinutes?: number; days?: number } = {},
    ): Promise<SuggestedSlot[]> {
      const query = new URLSearchParams();
      if (options.durationMinutes) query.set('duration', String(options.durationMinutes));
      if (options.days) query.set('days', String(options.days));
      const suffix = query.size > 0 ? `?${query}` : '';
      return request(`/items/${id(itemId)}/suggested-slots${suffix}`, { method: 'GET' }, (data) =>
        suggestedSlotSchema.array().parse(data),
      );
    },
  };
}

export type CalendarClient = ReturnType<typeof createCalendarClient>;
