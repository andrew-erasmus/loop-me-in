import { z } from 'zod';

/**
 * Shared domain types and validation schemas.
 *
 * These are the contract between the API and every client. The server parses
 * incoming bodies with the same schemas the client uses to build them, so the
 * two cannot drift apart.
 */

export const CALENDAR_VIEWS = ['month', 'week', 'day', 'agenda', 'lists', 'memories'] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];

/** Views that show a date range and respond to period navigation. */
export const DATED_VIEWS = ['month', 'week', 'day', 'agenda'] as const;
export type DatedView = (typeof DATED_VIEWS)[number];

export function isDatedView(view: CalendarView): view is DatedView {
  return (DATED_VIEWS as readonly string[]).includes(view);
}

/** Hex colour, e.g. `#3b82f6`. Lowercase six-digit form only, for simplicity. */
export const hexColor = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i, 'Must be a hex colour like #3b82f6');

const isoInstant = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Must be an ISO 8601 date-time');

/* -------------------------------------------------------------------------- */
/* Identity                                                                    */
/* -------------------------------------------------------------------------- */

export const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  /** Hex colour identifying this person across events and list items. */
  color: hexColor,
});

export const spaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
});

/** What `GET /auth/me` returns: who you are, where you are, and who else is here. */
export const meSchema = z.object({
  user: userSchema,
  space: spaceSchema,
  members: userSchema.array(),
  /** Every space this account belongs to, for the space switcher. */
  spaces: spaceSchema.array(),
});

export const spaceRenameSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60),
});
export type SpaceRename = z.infer<typeof spaceRenameSchema>;

export const inviteSchema = z.object({
  code: z.string(),
  /** Absolute URL to hand to the other person. */
  url: z.string(),
  expiresAt: z.string(),
});

export type User = z.infer<typeof userSchema>;
export type Space = z.infer<typeof spaceSchema>;
export type Me = z.infer<typeof meSchema>;
export type Invite = z.infer<typeof inviteSchema>;

/* -------------------------------------------------------------------------- */
/* Categories                                                                  */
/* -------------------------------------------------------------------------- */

export const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  color: hexColor,
  createdAt: z.string(),
});

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(40),
  color: hexColor,
});

/** PATCH accepts any subset of the writable fields, but not an empty object. */
export const categoryPatchSchema = categoryInputSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'No fields to update');

export type Category = z.infer<typeof categorySchema>;
export type CategoryInput = z.infer<typeof categoryInputSchema>;
export type CategoryPatch = z.infer<typeof categoryPatchSchema>;

/* -------------------------------------------------------------------------- */
/* Events                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Who can see an event, and how much of it.
 *
 * - `shared`   — everyone in the space sees it in full. The default.
 * - `surprise` — everyone sees that the time is taken, but only the person who
 *   created it sees what it actually is. The point is to be able to book a
 *   Saturday afternoon for someone's birthday without either hiding it (and
 *   having them schedule over it) or spoiling it.
 * - `private`  — only the creator sees it at all; for everyone else it does not
 *   exist.
 */
export const EVENT_VISIBILITY = ['shared', 'surprise', 'private'] as const;
export type EventVisibility = (typeof EVENT_VISIBILITY)[number];

/**
 * The title the server substitutes for a surprise's real one.
 *
 * Redaction happens on the server, never in the client: the real title must not
 * travel to a browser that isn't allowed to show it, because "hidden in the UI"
 * is not hidden at all to anyone who opens devtools.
 */
export const SURPRISE_TITLE = 'Something planned';

export const calendarEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  notes: z.string().nullable(),
  /** ISO 8601 UTC instant, e.g. `2026-09-18T09:00:00.000Z`. */
  startsAt: z.string(),
  endsAt: z.string(),
  allDay: z.boolean(),
  /**
   * `private` events are visible only to `createdBy`; `surprise` events are
   * visible to everyone but arrive redacted for anyone else.
   */
  visibility: z.enum(EVENT_VISIBILITY),
  categoryId: z.string().nullable(),
  /** Server-assigned: the account that created this event. */
  createdBy: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const eventInputSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(200),
    notes: z.string().max(2000).nullish(),
    startsAt: isoInstant,
    endsAt: isoInstant,
    allDay: z.boolean().default(false),
    visibility: z.enum(EVENT_VISIBILITY).default('shared'),
    categoryId: z.string().nullish(),
  })
  .refine((v) => Date.parse(v.endsAt) >= Date.parse(v.startsAt), {
    message: 'End must not be before start',
    path: ['endsAt'],
  });

/**
 * Partial updates are validated field-by-field; the start/end ordering check
 * runs on the server against the merged row, since a patch may carry only one
 * of the two timestamps.
 */
export const eventPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    notes: z.string().max(2000).nullish(),
    startsAt: isoInstant.optional(),
    endsAt: isoInstant.optional(),
    allDay: z.boolean().optional(),
    visibility: z.enum(EVENT_VISIBILITY).optional(),
    categoryId: z.string().nullish(),
  })
  .refine((v) => Object.keys(v).length > 0, 'No fields to update');

export type CalendarEvent = z.infer<typeof calendarEventSchema>;
export type EventInput = z.infer<typeof eventInputSchema>;
export type EventPatch = z.infer<typeof eventPatchSchema>;

/* -------------------------------------------------------------------------- */
/* Lists                                                                       */
/* -------------------------------------------------------------------------- */

export const listSchema = z.object({
  id: z.string(),
  name: z.string(),
  emoji: z.string().nullable(),
  color: hexColor,
  position: z.number(),
  createdBy: z.string().nullable(),
  createdAt: z.string(),
});

export const listInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60),
  // One emoji, but counted in code points — `[...'🎬'].length` is 1 while
  // `'🎬'.length` is 2, so a plain .max(2) would reject half of them.
  emoji: z
    .string()
    .trim()
    .refine((v) => [...v].length <= 2, 'Use one emoji')
    .nullish(),
  color: hexColor,
});

export const listPatchSchema = listInputSchema
  .extend({ position: z.number().int().min(0) })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'No fields to update');

export type List = z.infer<typeof listSchema>;
export type ListInput = z.infer<typeof listInputSchema>;
export type ListPatch = z.infer<typeof listPatchSchema>;

/**
 * A rough three-tier scale, reused for both effort and cost so an item carries
 * at most "how much of a thing is this" rather than two unrelated vocabularies.
 * Both are optional — most items (a film, a book) don't need either.
 */
export const TIERS = ['low', 'medium', 'high'] as const;
export type Tier = (typeof TIERS)[number];

export const listItemSchema = z.object({
  id: z.string(),
  listId: z.string(),
  title: z.string(),
  notes: z.string().nullable(),
  url: z.string().nullable(),
  /** Null until ticked off; an instant so "when did we do this" survives. */
  doneAt: z.string().nullable(),
  /** How much doing this actually takes — planning, travel, effort to pull off. */
  effort: z.enum(TIERS).nullable(),
  /** Roughly how much it costs, shown as $ / $$ / $$$. */
  cost: z.enum(TIERS).nullable(),
  position: z.number(),
  /**
   * The calendar event this item is scheduled as, if any. Deleting that event
   * sets this back to null — the item is never lost with it.
   */
  scheduledEventId: z.string().nullable(),
  /**
   * The scheduled event's start instant, denormalised onto the item so the
   * lists screen can read "Fri 3 Oct" without fetching a calendar range.
   * Read-only: it follows the event, and `scheduleItem` is what changes it.
   */
  scheduledAt: z.string().nullable(),
  /** User ids of everyone who is keen on this. */
  votes: z.string().array(),
  createdBy: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const listItemInputSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  notes: z.string().max(2000).nullish(),
  url: z.string().trim().url('Must be a URL').max(2000).nullish().or(z.literal('')),
  effort: z.enum(TIERS).nullish(),
  cost: z.enum(TIERS).nullish(),
});

export const listItemPatchSchema = listItemInputSchema
  .extend({
    /** An instant to tick off, `null` to un-tick. */
    doneAt: isoInstant.nullish(),
    position: z.number().int().min(0),
    /** Moving an item between lists. */
    listId: z.string(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'No fields to update');

/** Body of `POST /items/:id/schedule` — the times to put it on the calendar at. */
export const scheduleItemSchema = z
  .object({
    startsAt: isoInstant,
    endsAt: isoInstant,
    allDay: z.boolean().default(false),
    categoryId: z.string().nullish(),
  })
  .refine((v) => Date.parse(v.endsAt) >= Date.parse(v.startsAt), {
    message: 'End must not be before start',
    path: ['endsAt'],
  });

/** `POST /items/:id/schedule` returns both sides of the new link. */
export const scheduledItemSchema = z.object({
  item: listItemSchema,
  event: calendarEventSchema,
});

export type ListItem = z.infer<typeof listItemSchema>;
export type ListItemInput = z.infer<typeof listItemInputSchema>;
export type ListItemPatch = z.infer<typeof listItemPatchSchema>;
export type ScheduleItemInput = z.infer<typeof scheduleItemSchema>;
export type ScheduledItem = z.infer<typeof scheduledItemSchema>;

/** A candidate window with nothing in the way for either of you. */
export const suggestedSlotSchema = z.object({
  startsAt: z.string(),
  endsAt: z.string(),
});
export type SuggestedSlot = z.infer<typeof suggestedSlotSchema>;

/* -------------------------------------------------------------------------- */
/* Palettes                                                                    */
/* -------------------------------------------------------------------------- */

/** Colour used for events whose category was deleted. Neutral zinc-400. */
export const ORPHAN_EVENT_COLOR = '#a1a1aa';

/** Palette offered by the category colour picker, and by list colours. */
export const CATEGORY_PALETTE = [
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#06b6d4',
  '#64748b',
] as const;
