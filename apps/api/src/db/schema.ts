import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/**
 * Timestamps are stored as ISO 8601 UTC strings (`2026-09-21T09:00:00.000Z`).
 *
 * SQLite has no native date type, and text ISO-8601 sorts correctly as a
 * string, so range queries with `>=` / `<=` work directly on the column.
 * Rendering into the viewer's local timezone is the client's job.
 */

const createdAt = () =>
  text('created_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`);

/* -------------------------------------------------------------------------- */
/* Identity                                                                    */
/* -------------------------------------------------------------------------- */

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  /** Google's stable subject claim. The only safe join key — email can change. */
  googleSub: text('google_sub').notNull().unique(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  /** Hex colour from CATEGORY_PALETTE, used for this person's avatar dot. */
  color: text('color').notNull(),
  createdAt: createdAt(),
});

/**
 * A space is the shared container two (or more) people put a calendar in.
 * Every domain row below is scoped to exactly one.
 */
export const spaces = sqliteTable('spaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: createdAt(),
});

export const spaceMembers = sqliteTable(
  'space_members',
  {
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['owner', 'member'] })
      .notNull()
      .default('member'),
    joinedAt: text('joined_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    primaryKey({ columns: [table.spaceId, table.userId] }),
    index('space_members_user_idx').on(table.userId),
  ],
);

/**
 * Server-side sessions rather than JWTs: signing out has to actually revoke,
 * and a stateless token would need this table anyway to do that.
 *
 * `spaceId` is the space this session is currently looking at, so the scope of
 * every request is resolved server-side and a space switcher never has to be
 * trusted from the client.
 */
export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    expiresAt: text('expires_at').notNull(),
    createdAt: createdAt(),
  },
  (table) => [index('sessions_user_idx').on(table.userId)],
);

export const spaceInvites = sqliteTable(
  'space_invites',
  {
    /** Short human-typable code; also the primary key, so it must be unguessable. */
    code: text('code').primaryKey(),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    expiresAt: text('expires_at').notNull(),
    usedAt: text('used_at'),
    usedBy: text('used_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (table) => [index('space_invites_space_idx').on(table.spaceId)],
);

/* -------------------------------------------------------------------------- */
/* Calendar                                                                    */
/* -------------------------------------------------------------------------- */

export const categories = sqliteTable(
  'categories',
  {
    id: text('id').primaryKey(),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Hex colour, e.g. `#3b82f6`. */
    color: text('color').notNull(),
    createdAt: createdAt(),
  },
  (table) => [index('categories_space_idx').on(table.spaceId)],
);

export const events = sqliteTable(
  'events',
  {
    id: text('id').primaryKey(),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    notes: text('notes'),
    startsAt: text('starts_at').notNull(),
    endsAt: text('ends_at').notNull(),
    allDay: integer('all_day', { mode: 'boolean' }).notNull().default(false),
    /**
     * `private` events are returned only to their creator. `surprise` events are
     * returned to everyone, but redacted for anyone but their creator — the
     * other person sees the time is taken without seeing what it is, so they
     * won't book over their own birthday dinner or find out what it is.
     */
    visibility: text('visibility', { enum: ['shared', 'surprise', 'private'] })
      .notNull()
      .default('shared'),
    /**
     * Nullable with ON DELETE SET NULL for the same reason as `categoryId`
     * below: an account leaving must never take the appointments with it.
     */
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    /**
     * Deliberately nullable with ON DELETE SET NULL: deleting a category must
     * never delete the appointments filed under it. Orphaned events render in
     * a neutral grey until they are re-categorised.
     */
    categoryId: text('category_id').references(() => categories.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    // Every view fetches one space's events by instant range, so the space
    // column has to lead the index or none of these queries can use it.
    index('events_space_range_idx').on(table.spaceId, table.startsAt, table.endsAt),
  ],
);

/* -------------------------------------------------------------------------- */
/* Lists                                                                       */
/* -------------------------------------------------------------------------- */

export const lists = sqliteTable(
  'lists',
  {
    id: text('id').primaryKey(),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** A single emoji shown on the list and on any event scheduled from it. */
    emoji: text('emoji'),
    color: text('color').notNull(),
    position: integer('position').notNull().default(0),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (table) => [index('lists_space_idx').on(table.spaceId, table.position)],
);

export const listItems = sqliteTable(
  'list_items',
  {
    id: text('id').primaryKey(),
    spaceId: text('space_id')
      .notNull()
      .references(() => spaces.id, { onDelete: 'cascade' }),
    listId: text('list_id')
      .notNull()
      .references(() => lists.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    notes: text('notes'),
    /** Optional link — a trailer, a menu, a map pin. */
    url: text('url'),
    /** Null until ticked off; an instant rather than a boolean so "when" survives. */
    doneAt: text('done_at'),
    /** 'low' | 'medium' | 'high', or null — how much doing this actually takes. */
    effort: text('effort'),
    /** 'low' | 'medium' | 'high', or null — shown as $ / $$ / $$$. */
    cost: text('cost'),
    position: integer('position').notNull().default(0),
    /**
     * The link to the calendar. ON DELETE SET NULL is the whole point: deleting
     * the event un-schedules the item, it never deletes it. Losing "that Thai
     * place on Kloof St" because a Friday was cancelled would be the same class
     * of bug as losing an appointment because a category was tidied up.
     */
    scheduledEventId: text('scheduled_event_id').references(() => events.id, {
      onDelete: 'set null',
    }),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  },
  (table) => [
    index('list_items_list_idx').on(table.listId, table.position),
    index('list_items_space_idx').on(table.spaceId),
    // The calendar looks items up by the event they are scheduled as.
    uniqueIndex('list_items_event_idx').on(table.scheduledEventId),
  ],
);

/** One row per person who is keen on an item. Two rows means you both are. */
export const itemVotes = sqliteTable(
  'item_votes',
  {
    itemId: text('item_id')
      .notNull()
      .references(() => listItems.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.itemId, table.userId] })],
);

export type UserRow = typeof users.$inferSelect;
export type SpaceRow = typeof spaces.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type CategoryRow = typeof categories.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type ListRow = typeof lists.$inferSelect;
export type ListItemRow = typeof listItems.$inferSelect;
