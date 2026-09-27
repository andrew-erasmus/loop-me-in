import { randomUUID } from 'node:crypto';
import { and, asc, eq, gte, lte, ne, or, type SQL } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { eventInputSchema, eventPatchSchema } from '../core.js';
import { db, schema } from '../db/index.js';
import type { EventRow } from '../db/schema.js';
import { bodySchemas, errorResponse, idParam, rangeQuery, ref } from '../openapi.js';
import { badRequest, forbidden, notFound, parseBody } from './helpers.js';
import { toEvent } from './present.js';

const rangeQuerySchema = z.object({
  from: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid `from`'),
  to: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid `to`'),
});

/**
 * The scope every event query runs inside: this space, and anything that isn't
 * someone else's `private` event.
 *
 * `surprise` events deliberately pass this filter for everyone — the other
 * person is *meant* to see the slot is taken. What they must not see is what it
 * is, and that redaction happens in `toEvent`.
 *
 * Applied to single-row lookups as well as the list route — a private event
 * that is merely absent from the list but still fetchable by id would not be
 * private at all.
 *
 * Exported for the scheduling-suggestions route in `lists.ts`, which needs
 * the exact same "what counts as busy for this viewer" rule: someone else's
 * `private` event must not even register as taking up time, or its mere
 * existence would leak through an otherwise-free slot going unsuggested.
 */
export function visible(request: FastifyRequest): SQL {
  return and(
    eq(schema.events.spaceId, request.auth.space.id),
    or(
      ne(schema.events.visibility, 'private'),
      eq(schema.events.createdBy, request.auth.user.id),
    ),
  )!;
}

/**
 * Guard for anything that changes an event.
 *
 * A surprise is the one thing in this calendar that isn't jointly owned: the
 * person it is for can see the slot, but must not be able to move it, rename
 * it or delete it. A 403 rather than a 404 because they can plainly see it
 * exists — pretending otherwise would just be confusing.
 */
function assertEditable(request: FastifyRequest, event: EventRow): void {
  if (
    event.visibility === 'surprise' &&
    event.createdBy !== request.auth.user.id
  ) {
    throw forbidden("That's a surprise — only the person who planned it can change it.");
  }
}

/** Fetch one event the caller is allowed to see, or 404. */
async function findVisible(request: FastifyRequest, id: string): Promise<EventRow> {
  const event = await db
    .select()
    .from(schema.events)
    .where(and(eq(schema.events.id, id), visible(request)))
    .get();

  // A 404 rather than a 403 for someone else's private event: distinguishing
  // "not yours" from "does not exist" would confirm it exists.
  if (!event) throw notFound('Event not found');
  return event;
}

/** Reject a category id that doesn't exist in this space, rather than letting SQLite raise. */
async function assertCategoryExists(
  request: FastifyRequest,
  categoryId: string | null | undefined,
): Promise<void> {
  if (!categoryId) return;
  const found = await db
    .select({ id: schema.categories.id })
    .from(schema.categories)
    .where(
      and(
        eq(schema.categories.id, categoryId),
        eq(schema.categories.spaceId, request.auth.space.id),
      ),
    )
    .get();
  if (!found) {
    throw badRequest(`No category with id ${categoryId}`);
  }
}

export default async function eventRoutes(app: FastifyInstance) {
  /**
   * Events overlapping `[from, to]`. An event counts as inside the window if it
   * ends at or after `from` and starts at or before `to` — which correctly
   * includes multi-day events that straddle the edges of the view.
   */
  app.get(
    '/events',
    {
      schema: {
        tags: ['Events'],
        summary: 'List events in a time window',
        description:
          'Returns every event in your space overlapping `[from, to]` — an event counts as inside the window if it ends at or after `from` and starts at or before `to`, so multi-day events straddling the edges are included. Other people\'s `private` events are never returned, and their `surprise` events arrive with the title, notes and category stripped.',
        querystring: rangeQuery,
        response: {
          200: {
            description: 'Events overlapping the window, earliest first.',
            type: 'array',
            items: ref.event,
          },
          400: errorResponse('`from` or `to` is not a valid ISO 8601 date-time.'),
          401: errorResponse('Not signed in.'),
        },
      },
    },
    async (request) => {
      const query = rangeQuerySchema.safeParse(request.query);
      if (!query.success) {
        throw badRequest('Invalid range', query.error.flatten());
      }

      const from = new Date(query.data.from).toISOString();
      const to = new Date(query.data.to).toISOString();

      const rows = await db
        .select()
        .from(schema.events)
        .where(
          and(
            visible(request),
            gte(schema.events.endsAt, from),
            lte(schema.events.startsAt, to),
          ),
        )
        .orderBy(asc(schema.events.startsAt))
        .all();
      return rows.map((row) => toEvent(row, request.auth.user.id));
    },
  );

  app.post(
    '/events',
    {
      schema: {
        tags: ['Events'],
        summary: 'Create an event',
        body: bodySchemas.eventInput,
        response: {
          201: ref.event,
          400: errorResponse('Invalid body, or `categoryId` does not exist.'),
          401: errorResponse('Not signed in.'),
        },
      },
    },
    async (request, reply) => {
      const input = parseBody(eventInputSchema, request.body);
      await assertCategoryExists(request, input.categoryId);

      const now = new Date().toISOString();
      const row = {
        id: randomUUID(),
        spaceId: request.auth.space.id,
        title: input.title,
        notes: input.notes ?? null,
        startsAt: new Date(input.startsAt).toISOString(),
        endsAt: new Date(input.endsAt).toISOString(),
        allDay: input.allDay,
        visibility: input.visibility,
        createdBy: request.auth.user.id,
        categoryId: input.categoryId ?? null,
        createdAt: now,
        updatedAt: now,
      };

      await db.insert(schema.events).values(row);
      return reply.code(201).send(toEvent(row, request.auth.user.id));
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/events/:id',
    {
      schema: {
        tags: ['Events'],
        summary: 'Update an event',
        description:
          'Accepts any subset of the writable fields. The start/end ordering rule is checked against the merged row, so sending only one of the two timestamps is valid.',
        params: idParam,
        body: bodySchemas.eventPatch,
        response: {
          200: ref.event,
          400: errorResponse(
            'Invalid body, unknown `categoryId`, or the merged row would end before it starts.',
          ),
          401: errorResponse('Not signed in.'),
          403: errorResponse("It is someone else's surprise."),
          404: errorResponse('No event with that id in your space.'),
        },
      },
    },
    async (request) => {
      const patch = parseBody(eventPatchSchema, request.body);
      const existing = await findVisible(request, request.params.id);
      assertEditable(request, existing);

      if (patch.categoryId !== undefined) {
        await assertCategoryExists(request, patch.categoryId);
      }

      /**
       * Both restrictive visibilities are defined relative to `createdBy`:
       * `private` means "only its creator sees it", `surprise` means "only its
       * creator sees what it is". Applying one to an event somebody else
       * created would therefore hide it from the wrong person — marking her
       * event private hides it from you and leaves it plainly visible to her,
       * which is the exact opposite of what was asked for.
       *
       * So the act of making something secret takes ownership of it. The
       * secret belongs to whoever is keeping it.
       */
      const takesOwnership =
        patch.visibility !== undefined &&
        patch.visibility !== 'shared' &&
        existing.createdBy !== request.auth.user.id;

      const merged = {
        title: patch.title ?? existing.title,
        createdBy: takesOwnership ? request.auth.user.id : existing.createdBy,
        notes: patch.notes === undefined ? existing.notes : (patch.notes ?? null),
        startsAt: patch.startsAt
          ? new Date(patch.startsAt).toISOString()
          : existing.startsAt,
        endsAt: patch.endsAt ? new Date(patch.endsAt).toISOString() : existing.endsAt,
        allDay: patch.allDay ?? existing.allDay,
        visibility: patch.visibility ?? existing.visibility,
        categoryId:
          patch.categoryId === undefined
            ? existing.categoryId
            : (patch.categoryId ?? null),
        updatedAt: new Date().toISOString(),
      };

      // A patch may carry only one of the two timestamps, so the ordering rule
      // is checked here against the merged row rather than in the request schema.
      if (Date.parse(merged.endsAt) < Date.parse(merged.startsAt)) {
        throw badRequest('End must not be before start');
      }

      await db.update(schema.events).set(merged).where(eq(schema.events.id, existing.id));

      return toEvent({ ...existing, ...merged }, request.auth.user.id);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/events/:id',
    {
      schema: {
        tags: ['Events'],
        summary: 'Delete an event',
        description:
          'If a list item was scheduled as this event, the item survives and simply becomes unscheduled again.',
        params: idParam,
        response: {
          204: { description: 'Deleted.', type: 'null' },
          401: errorResponse('Not signed in.'),
          403: errorResponse("It is someone else's surprise."),
          404: errorResponse('No event with that id in your space.'),
        },
      },
    },
    async (request, reply) => {
      const existing = await findVisible(request, request.params.id);
      assertEditable(request, existing);
      await db.delete(schema.events).where(eq(schema.events.id, existing.id));
      return reply.code(204).send();
    },
  );
}
