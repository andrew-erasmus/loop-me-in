import { randomUUID } from 'node:crypto';
import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  listInputSchema,
  listItemInputSchema,
  listItemPatchSchema,
  listPatchSchema,
  scheduleItemSchema,
  suggestFreeSlots,
  type ListItem,
} from '../core.js';
import { db, schema } from '../db/index.js';
import type { ListItemRow, ListRow } from '../db/schema.js';
import { bodySchemas, errorResponse, idParam, ref, suggestSlotsQuery } from '../openapi.js';
import { badRequest, notFound, parseBody } from './helpers.js';
import { visible } from './events.js';
import { toEvent, toList, toListItem } from './present.js';

const suggestSlotsQuerySchema = z.object({
  duration: z.coerce.number().int().positive().max(24 * 60).default(120),
  days: z.coerce.number().int().positive().max(60).default(14),
});

/**
 * Lists and the things on them — films to watch, places to go, plans to make —
 * plus the link that puts one on the calendar.
 */

/* -------------------------------------------------------------------------- */
/* Loading                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Attach each item's votes and the start time of the event it is scheduled as.
 *
 * Two extra queries regardless of how many items came back, rather than a pair
 * per item. `scheduledAt` is denormalised onto the item here so the lists
 * screen can say "Fri 3 Oct" without fetching a calendar range of its own.
 */
async function hydrate(rows: ListItemRow[], viewerId: string): Promise<ListItem[]> {
  if (rows.length === 0) return [];

  const itemIds = rows.map((row) => row.id);
  const votesByItem = new Map<string, string[]>();
  const votes = await db
    .select()
    .from(schema.itemVotes)
    .where(inArray(schema.itemVotes.itemId, itemIds))
    .all();
  for (const vote of votes) {
    const existing = votesByItem.get(vote.itemId);
    if (existing) existing.push(vote.userId);
    else votesByItem.set(vote.itemId, [vote.userId]);
  }

  const eventIds = rows
    .map((row) => row.scheduledEventId)
    .filter((id): id is string => id !== null);

  /**
   * Linked events the viewer is allowed to know the date of.
   *
   * Someone else's surprise is deliberately left out. Otherwise the list
   * defeats the calendar: the grid shows an anonymous "Something planned" at
   * 18:00, the list shows "That Thai place on Kloof St — 18:00", and anyone
   * can put the two together in a second. To the person it is meant for, the
   * item simply reads as unscheduled.
   */
  const linkedEvents =
    eventIds.length === 0
      ? []
      : await db
          .select({
            id: schema.events.id,
            startsAt: schema.events.startsAt,
            visibility: schema.events.visibility,
            createdBy: schema.events.createdBy,
          })
          .from(schema.events)
          .where(inArray(schema.events.id, eventIds))
          .all();
  const startsByEvent = new Map<string, string>(
    linkedEvents
      .filter((row) => !(row.visibility === 'surprise' && row.createdBy !== viewerId))
      .map((row) => [row.id, row.startsAt] as const),
  );

  return rows.map((row) => {
    const scheduledAt = row.scheduledEventId
      ? (startsByEvent.get(row.scheduledEventId) ?? null)
      : null;

    // The link id goes too — leaving it would let a client ask about an event
    // it is not meant to connect to this item.
    return toListItem(
      { ...row, scheduledEventId: scheduledAt ? row.scheduledEventId : null },
      votesByItem.get(row.id) ?? [],
      scheduledAt,
    );
  });
}

/** Re-read one item with its votes and schedule attached. */
async function hydrateOne(id: string, viewerId: string): Promise<ListItem> {
  const row = await db
    .select()
    .from(schema.listItems)
    .where(eq(schema.listItems.id, id))
    .get();
  if (!row) throw notFound('Item not found');
  return (await hydrate([row], viewerId))[0]!;
}

async function findList(request: FastifyRequest, id: string): Promise<ListRow> {
  const list = await db
    .select()
    .from(schema.lists)
    .where(
      and(eq(schema.lists.id, id), eq(schema.lists.spaceId, request.auth.space.id)),
    )
    .get();
  if (!list) throw notFound('List not found');
  return list;
}

async function findItem(request: FastifyRequest, id: string): Promise<ListItemRow> {
  const item = await db
    .select()
    .from(schema.listItems)
    .where(
      and(
        eq(schema.listItems.id, id),
        eq(schema.listItems.spaceId, request.auth.space.id),
      ),
    )
    .get();
  if (!item) throw notFound('Item not found');
  return item;
}

/** Next position at the end of a list, so new things land at the bottom. */
async function nextPosition(listId: string): Promise<number> {
  const row = await db
    .select({ max: sql<number | null>`max(${schema.listItems.position})` })
    .from(schema.listItems)
    .where(eq(schema.listItems.listId, listId))
    .get();
  return (row?.max ?? -1) + 1;
}

/** An empty-string URL from a cleared form field means "no link", not "". */
function normaliseUrl(url: string | null | undefined): string | null {
  if (url === undefined || url === null) return null;
  const trimmed = url.trim();
  return trimmed === '' ? null : trimmed;
}

/* -------------------------------------------------------------------------- */
/* Routes                                                                      */
/* -------------------------------------------------------------------------- */

export default async function listRoutes(app: FastifyInstance) {
  app.get(
    '/lists',
    {
      schema: {
        tags: ['Lists'],
        summary: 'List every list in your space',
        response: {
          200: { description: 'Lists in display order.', type: 'array', items: ref.list },
          401: errorResponse('Not signed in.'),
        },
      },
    },
    async (request) => {
      const rows = await db
        .select()
        .from(schema.lists)
        .where(eq(schema.lists.spaceId, request.auth.space.id))
        .orderBy(asc(schema.lists.position), asc(schema.lists.createdAt))
        .all();
      return rows.map(toList);
    },
  );

  app.post(
    '/lists',
    {
      schema: {
        tags: ['Lists'],
        summary: 'Create a list',
        body: bodySchemas.listInput,
        response: {
          201: ref.list,
          400: errorResponse('Missing name, or `color` is not a six-digit hex value.'),
          401: errorResponse('Not signed in.'),
        },
      },
    },
    async (request, reply) => {
      const input = parseBody(listInputSchema, request.body);

      const position = await db
        .select({ max: sql<number | null>`max(${schema.lists.position})` })
        .from(schema.lists)
        .where(eq(schema.lists.spaceId, request.auth.space.id))
        .get();

      const row = {
        id: randomUUID(),
        spaceId: request.auth.space.id,
        name: input.name,
        emoji: input.emoji?.trim() || null,
        color: input.color.toLowerCase(),
        position: (position?.max ?? -1) + 1,
        createdBy: request.auth.user.id,
        createdAt: new Date().toISOString(),
      };

      await db.insert(schema.lists).values(row);
      return reply.code(201).send(toList(row));
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/lists/:id',
    {
      schema: {
        tags: ['Lists'],
        summary: 'Rename, recolour or reorder a list',
        params: idParam,
        body: bodySchemas.listPatch,
        response: {
          200: ref.list,
          400: errorResponse('Empty patch, or an invalid field.'),
          401: errorResponse('Not signed in.'),
          404: errorResponse('No list with that id in your space.'),
        },
      },
    },
    async (request) => {
      const patch = parseBody(listPatchSchema, request.body);
      const existing = await findList(request, request.params.id);

      const merged = {
        name: patch.name ?? existing.name,
        emoji:
          patch.emoji === undefined ? existing.emoji : (patch.emoji?.trim() || null),
        color: (patch.color ?? existing.color).toLowerCase(),
        position: patch.position ?? existing.position,
      };

      await db.update(schema.lists).set(merged).where(eq(schema.lists.id, existing.id));
      return toList({ ...existing, ...merged });
    },
  );

  /**
   * Deleting a list deletes its items — unlike categories, a list *is* the
   * thing its items belong to, and an item with no list has nowhere to appear.
   * Any events already scheduled from those items survive on the calendar:
   * the plan was made, and cancelling it should be a separate decision.
   */
  app.delete<{ Params: { id: string } }>(
    '/lists/:id',
    {
      schema: {
        tags: ['Lists'],
        summary: 'Delete a list and its items',
        description:
          'The items on the list are deleted with it. Events already scheduled from those items are **kept** on the calendar — cancelling a plan you have already made is a separate decision from tidying up a list.',
        params: idParam,
        response: {
          204: { description: 'Deleted.', type: 'null' },
          401: errorResponse('Not signed in.'),
          404: errorResponse('No list with that id in your space.'),
        },
      },
    },
    async (request, reply) => {
      const existing = await findList(request, request.params.id);
      await db.delete(schema.lists).where(eq(schema.lists.id, existing.id));
      return reply.code(204).send();
    },
  );

  /* ------------------------------------------------------------------ items */

  app.get(
    '/items',
    {
      schema: {
        tags: ['Lists'],
        summary: 'Every item in your space, across all lists',
        description:
          'Returned whole rather than per-list: lists are small, and the calendar needs the full set anyway to tell which events came from an item.',
        response: {
          200: { description: 'All items.', type: 'array', items: ref.listItem },
          401: errorResponse('Not signed in.'),
        },
      },
    },
    async (request) => {
      const rows = await db
        .select()
        .from(schema.listItems)
        .where(eq(schema.listItems.spaceId, request.auth.space.id))
        .orderBy(asc(schema.listItems.position))
        .all();
      return hydrate(rows, request.auth.user.id);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/lists/:id/items',
    {
      schema: {
        tags: ['Lists'],
        summary: 'Add an item to a list',
        params: idParam,
        body: bodySchemas.listItemInput,
        response: {
          201: ref.listItem,
          400: errorResponse('Missing title, or `url` is not a valid URL.'),
          401: errorResponse('Not signed in.'),
          404: errorResponse('No list with that id in your space.'),
        },
      },
    },
    async (request, reply) => {
      const list = await findList(request, request.params.id);
      const input = parseBody(listItemInputSchema, request.body);

      const now = new Date().toISOString();
      const row = {
        id: randomUUID(),
        spaceId: request.auth.space.id,
        listId: list.id,
        title: input.title,
        notes: input.notes ?? null,
        url: normaliseUrl(input.url),
        doneAt: null,
        effort: input.effort ?? null,
        cost: input.cost ?? null,
        position: await nextPosition(list.id),
        scheduledEventId: null,
        createdBy: request.auth.user.id,
        createdAt: now,
        updatedAt: now,
      };

      await db.insert(schema.listItems).values(row);
      return reply.code(201).send(toListItem(row, [], null));
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/items/:id',
    {
      schema: {
        tags: ['Lists'],
        summary: 'Edit, tick off, reorder or move an item',
        description:
          'Set `doneAt` to an instant to tick an item off, or to `null` to un-tick it. Passing a different `listId` moves the item to another list.',
        params: idParam,
        body: bodySchemas.listItemPatch,
        response: {
          200: ref.listItem,
          400: errorResponse('Empty patch, or an invalid field.'),
          401: errorResponse('Not signed in.'),
          404: errorResponse('No item, or no target list, with that id in your space.'),
        },
      },
    },
    async (request) => {
      const patch = parseBody(listItemPatchSchema, request.body);
      const existing = await findItem(request, request.params.id);

      // Moving lists is validated against the caller's space, so an item can
      // never be parked on a list belonging to someone else.
      if (patch.listId !== undefined && patch.listId !== existing.listId) {
        await findList(request, patch.listId);
      }

      const merged = {
        listId: patch.listId ?? existing.listId,
        title: patch.title ?? existing.title,
        notes: patch.notes === undefined ? existing.notes : (patch.notes ?? null),
        url: patch.url === undefined ? existing.url : normaliseUrl(patch.url),
        doneAt: patch.doneAt === undefined ? existing.doneAt : (patch.doneAt ?? null),
        effort: patch.effort === undefined ? existing.effort : (patch.effort ?? null),
        cost: patch.cost === undefined ? existing.cost : (patch.cost ?? null),
        position: patch.position ?? existing.position,
        updatedAt: new Date().toISOString(),
      };

      await db.update(schema.listItems).set(merged).where(eq(schema.listItems.id, existing.id));

      return hydrateOne(existing.id, request.auth.user.id);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/items/:id',
    {
      schema: {
        tags: ['Lists'],
        summary: 'Delete an item',
        description:
          'If the item was scheduled, its calendar event is left in place — deleting a note about a plan should not silently cancel the plan.',
        params: idParam,
        response: {
          204: { description: 'Deleted.', type: 'null' },
          401: errorResponse('Not signed in.'),
          404: errorResponse('No item with that id in your space.'),
        },
      },
    },
    async (request, reply) => {
      const existing = await findItem(request, request.params.id);
      await db.delete(schema.listItems).where(eq(schema.listItems.id, existing.id));
      return reply.code(204).send();
    },
  );

  /* ------------------------------------------------------------------ votes */

  app.put<{ Params: { id: string } }>(
    '/items/:id/vote',
    {
      schema: {
        tags: ['Lists'],
        summary: "Add your “I'm keen” vote",
        description: 'Idempotent — voting twice leaves you with one vote.',
        params: idParam,
        response: {
          200: ref.listItem,
          401: errorResponse('Not signed in.'),
          404: errorResponse('No item with that id in your space.'),
        },
      },
    },
    async (request) => {
      const item = await findItem(request, request.params.id);
      await db
        .insert(schema.itemVotes)
        .values({
          itemId: item.id,
          userId: request.auth.user.id,
          createdAt: new Date().toISOString(),
        })
        .onConflictDoNothing();
      return hydrateOne(item.id, request.auth.user.id);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/items/:id/vote',
    {
      schema: {
        tags: ['Lists'],
        summary: 'Withdraw your vote',
        params: idParam,
        response: {
          200: ref.listItem,
          401: errorResponse('Not signed in.'),
          404: errorResponse('No item with that id in your space.'),
        },
      },
    },
    async (request) => {
      const item = await findItem(request, request.params.id);
      await db
        .delete(schema.itemVotes)
        .where(
          and(
            eq(schema.itemVotes.itemId, item.id),
            eq(schema.itemVotes.userId, request.auth.user.id),
          ),
        );
      return hydrateOne(item.id, request.auth.user.id);
    },
  );

  /* -------------------------------------------------------------- scheduling */

  /**
   * Put an item on the calendar.
   *
   * Creating the event and linking it are one transaction: an event with no
   * item pointing at it would be an orphan nobody could find their way back
   * from, and a link to an event that was never written would be worse.
   *
   * Re-scheduling moves the existing event rather than creating a second one,
   * so changing your mind about Friday doesn't leave a ghost on Thursday.
   */
  app.post<{ Params: { id: string } }>(
    '/items/:id/schedule',
    {
      schema: {
        tags: ['Lists'],
        summary: 'Give an item a date',
        description:
          'Creates a calendar event for the item and links the two. If the item is already scheduled, its existing event is moved instead of a second one being created. The item stays on its list either way.',
        params: idParam,
        body: bodySchemas.scheduleItem,
        response: {
          200: ref.scheduledItem,
          400: errorResponse('Invalid times, or `categoryId` does not exist.'),
          401: errorResponse('Not signed in.'),
          404: errorResponse('No item with that id in your space.'),
        },
      },
    },
    async (request) => {
      const item = await findItem(request, request.params.id);
      const input = parseBody(scheduleItemSchema, request.body);

      if (input.categoryId) {
        const category = await db
          .select({ id: schema.categories.id })
          .from(schema.categories)
          .where(
            and(
              eq(schema.categories.id, input.categoryId),
              eq(schema.categories.spaceId, request.auth.space.id),
            ),
          )
          .get();
        if (!category) throw badRequest(`No category with id ${input.categoryId}`);
      }

      const now = new Date().toISOString();
      const times = {
        startsAt: new Date(input.startsAt).toISOString(),
        endsAt: new Date(input.endsAt).toISOString(),
        allDay: input.allDay,
        categoryId: input.categoryId ?? null,
        updatedAt: now,
      };

      // Only reuse the linked event if it is still there and still ours — the
      // FK nulls the link on deletion, but a stale id is cheap to guard against.
      const linked = item.scheduledEventId
        ? await db
            .select()
            .from(schema.events)
            .where(
              and(
                eq(schema.events.id, item.scheduledEventId),
                eq(schema.events.spaceId, request.auth.space.id),
              ),
            )
            .get()
        : undefined;

      const eventId = linked?.id ?? randomUUID();

      await db.transaction(async (tx) => {
        if (linked) {
          await tx
            .update(schema.events)
            .set({ ...times, title: item.title })
            .where(eq(schema.events.id, linked.id));
        } else {
          await tx.insert(schema.events).values({
            id: eventId,
            spaceId: request.auth.space.id,
            title: item.title,
            notes: item.notes,
            ...times,
            visibility: 'shared',
            createdBy: request.auth.user.id,
            createdAt: now,
          });
        }

        await tx
          .update(schema.listItems)
          .set({ scheduledEventId: eventId, updatedAt: now })
          .where(eq(schema.listItems.id, item.id));
      });

      const event = (await db
        .select()
        .from(schema.events)
        .where(eq(schema.events.id, eventId))
        .get())!;

      return {
        item: await hydrateOne(item.id, request.auth.user.id),
        event: toEvent(event, request.auth.user.id),
      };
    },
  );

  /**
   * Candidate times to schedule an item at — windows where neither of you has
   * anything else on.
   *
   * Busy time comes from exactly the same `visible()` rule the calendar itself
   * uses: someone else's `private` event must not even register as taking up
   * time, or an otherwise-free slot quietly never being suggested would leak
   * that something is there. A `surprise` does count as busy for everyone,
   * same as it does on the grid — the point of a surprise is that the time is
   * visibly taken, just not what it is.
   */
  app.get<{ Params: { id: string } }>(
    '/items/:id/suggested-slots',
    {
      schema: {
        tags: ['Lists'],
        summary: 'Suggest free times to schedule an item',
        description:
          'Looks `days` ahead (default 14) for windows at least `duration` minutes long (default 120) where neither of you has a conflicting event. At most one suggestion per day, earliest first.',
        params: idParam,
        querystring: suggestSlotsQuery,
        response: {
          200: {
            description: 'Candidate slots, earliest first. May be empty.',
            type: 'array',
            items: ref.suggestedSlot,
          },
          400: errorResponse('`duration` or `days` is not a positive integer.'),
          401: errorResponse('Not signed in.'),
          404: errorResponse('No item with that id in your space.'),
        },
      },
    },
    async (request) => {
      await findItem(request, request.params.id);
      const query = parseBody(suggestSlotsQuerySchema, request.query);

      const from = new Date();
      const to = new Date(from.getTime() + query.days * 24 * 60 * 60 * 1000);

      const busy = await db
        .select({ startsAt: schema.events.startsAt, endsAt: schema.events.endsAt })
        .from(schema.events)
        .where(
          and(
            visible(request),
            gte(schema.events.endsAt, from.toISOString()),
            lte(schema.events.startsAt, to.toISOString()),
          ),
        )
        .all();

      return suggestFreeSlots(busy, { durationMinutes: query.duration, from, to });
    },
  );

  /**
   * Take an item off the calendar. The event goes, the item stays — the same
   * rule as deleting the event directly, just reached from the other side.
   */
  app.delete<{ Params: { id: string } }>(
    '/items/:id/schedule',
    {
      schema: {
        tags: ['Lists'],
        summary: 'Take an item off the calendar',
        description:
          'Deletes the linked event and clears the link. The item itself stays on its list, unscheduled.',
        params: idParam,
        response: {
          200: ref.listItem,
          401: errorResponse('Not signed in.'),
          404: errorResponse('No item with that id in your space.'),
        },
      },
    },
    async (request) => {
      const item = await findItem(request, request.params.id);

      if (item.scheduledEventId) {
        // The FK is ON DELETE SET NULL, so removing the event clears the link
        // on its own — which is exactly what happens when the event is deleted
        // from the calendar instead. One rule, reachable from both directions.
        await db
          .delete(schema.events)
          .where(
            and(
              eq(schema.events.id, item.scheduledEventId),
              eq(schema.events.spaceId, request.auth.space.id),
            ),
          );
      }

      return hydrateOne(item.id, request.auth.user.id);
    },
  );
}
