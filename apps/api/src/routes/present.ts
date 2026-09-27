import {
  SURPRISE_TITLE,
  type CalendarEvent,
  type Category,
  type List,
  type ListItem,
  type Space,
  type User,
} from '../core.js';
import type {
  CategoryRow,
  EventRow,
  ListItemRow,
  ListRow,
  SpaceRow,
  UserRow,
} from '../db/schema.js';

/**
 * Database rows → the shapes declared in `@date-calendar/core`.
 *
 * Two things are stripped on the way out. `spaceId` is never sent: the client
 * cannot choose it, every response is already scoped to one space, and echoing
 * it back only invites someone to try passing a different one. `googleSub` is
 * an identity secret that no client has any use for.
 */

export function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatarUrl,
    color: row.color,
  };
}

export function toSpace(row: SpaceRow): Space {
  return { id: row.id, name: row.name, createdAt: row.createdAt };
}

export function toCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    createdAt: row.createdAt,
  };
}

/**
 * An event as a particular viewer is allowed to see it.
 *
 * A `surprise` belonging to someone else is redacted here, and *only* here —
 * every route returns events through this function, so there is one place to
 * get right rather than one per endpoint. The times survive (that is the whole
 * point: the slot still reads as busy), but the title, the notes and the
 * category do not. The category is dropped because its colour and name leak
 * the answer — "Health" on a Saturday afternoon gives the game away.
 */
export function toEvent(row: EventRow, viewerId: string): CalendarEvent {
  const redacted = row.visibility === 'surprise' && row.createdBy !== viewerId;

  return {
    id: row.id,
    title: redacted ? SURPRISE_TITLE : row.title,
    notes: redacted ? null : row.notes,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    allDay: row.allDay,
    visibility: row.visibility,
    categoryId: redacted ? null : row.categoryId,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toList(row: ListRow): List {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    color: row.color,
    position: row.position,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

/**
 * Items carry two pieces of joined state: who is keen, and when the linked
 * event starts. `scheduledAt` is denormalised here so the lists screen can
 * render "Fri 3 Oct" without fetching a calendar range of its own.
 */
export function toListItem(
  row: ListItemRow,
  votes: string[],
  scheduledAt: string | null,
): ListItem {
  return {
    id: row.id,
    listId: row.listId,
    title: row.title,
    notes: row.notes,
    url: row.url,
    doneAt: row.doneAt,
    effort: row.effort as ListItem['effort'],
    cost: row.cost as ListItem['cost'],
    position: row.position,
    scheduledEventId: row.scheduledEventId,
    scheduledAt,
    votes,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
