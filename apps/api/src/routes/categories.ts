import { randomUUID } from 'node:crypto';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { categoryInputSchema, categoryPatchSchema } from '../core.js';
import { db, schema } from '../db/index.js';
import type { CategoryRow } from '../db/schema.js';
import { bodySchemas, errorResponse, idParam, ref } from '../openapi.js';
import { notFound, parseBody } from './helpers.js';
import { toCategory } from './present.js';

/** Fetch one category from the caller's space, or 404. */
async function findInSpace(request: FastifyRequest, id: string): Promise<CategoryRow> {
  const category = await db
    .select()
    .from(schema.categories)
    .where(
      and(
        eq(schema.categories.id, id),
        eq(schema.categories.spaceId, request.auth.space.id),
      ),
    )
    .get();
  if (!category) throw notFound('Category not found');
  return category;
}

export default async function categoryRoutes(app: FastifyInstance) {
  app.get(
    '/categories',
    {
      schema: {
        tags: ['Categories'],
        summary: 'List all categories',
        description: 'Every category in your space, ordered by creation time, oldest first.',
        response: {
          200: {
            description: 'All categories, oldest first.',
            type: 'array',
            items: ref.category,
          },
        },
      },
    },
    async (request) => {
      const rows = await db
        .select()
        .from(schema.categories)
        .where(eq(schema.categories.spaceId, request.auth.space.id))
        .orderBy(asc(schema.categories.createdAt))
        .all();
      return rows.map(toCategory);
    },
  );

  /**
   * Declared before `/categories/:id` for readability; Fastify's router gives
   * static segments priority over parametric ones regardless of order.
   */
  app.get(
    '/categories/counts',
    {
      schema: {
        tags: ['Categories'],
        summary: 'Event count per category',
        description:
          'Maps category id to the number of events filed under it. Used by the delete-confirmation dialog to say how many events would be orphaned. Categories with no events are omitted.',
        response: {
          200: {
            description: 'Category id to event count. Unused categories are omitted.',
            type: 'object',
            additionalProperties: { type: 'integer' },
            examples: [{ '91574375-0046-4c52-8a37-c67ad24a4dad': 3 }],
          },
        },
      },
    },
    async (request) => {
      // Scoped to the space but deliberately not to visibility: this number
      // warns how many events a deletion would orphan, and quietly omitting
      // the other person's private ones would make that warning wrong. A bare
      // count discloses nothing about them.
      const rows = await db
        .select({
          categoryId: schema.events.categoryId,
          count: sql<number>`count(*)`,
        })
        .from(schema.events)
        .where(eq(schema.events.spaceId, request.auth.space.id))
        .groupBy(schema.events.categoryId)
        .all();

      return Object.fromEntries(
        rows
          .filter(
            (row): row is { categoryId: string; count: number } =>
              row.categoryId !== null,
          )
          .map((row) => [row.categoryId, row.count]),
      );
    },
  );

  app.post(
    '/categories',
    {
      schema: {
        tags: ['Categories'],
        summary: 'Create a category',
        body: bodySchemas.categoryInput,
        response: {
          201: ref.category,
          400: errorResponse('Missing name, or `color` is not a six-digit hex value.'),
        },
      },
    },
    async (request, reply) => {
      const input = parseBody(categoryInputSchema, request.body);
      const row = {
        id: randomUUID(),
        spaceId: request.auth.space.id,
        name: input.name,
        color: input.color.toLowerCase(),
        createdAt: new Date().toISOString(),
      };
      await db.insert(schema.categories).values(row);
      return reply.code(201).send(toCategory(row));
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/categories/:id',
    {
      schema: {
        tags: ['Categories'],
        summary: 'Rename or recolour a category',
        params: idParam,
        body: bodySchemas.categoryPatch,
        response: {
          200: ref.category,
          400: errorResponse('Empty patch, or `color` is not a six-digit hex value.'),
          401: errorResponse('Not signed in.'),
          404: errorResponse('No category with that id in your space.'),
        },
      },
    },
    async (request) => {
      const patch = parseBody(categoryPatchSchema, request.body);

      const existing = await findInSpace(request, request.params.id);

      const merged = {
        name: patch.name ?? existing.name,
        color: (patch.color ?? existing.color).toLowerCase(),
      };

      await db.update(schema.categories).set(merged).where(eq(schema.categories.id, existing.id));

      return toCategory({ ...existing, ...merged });
    },
  );

  /**
   * Deleting a category orphans its events rather than deleting them — the FK
   * is ON DELETE SET NULL.
   */
  app.delete<{ Params: { id: string } }>(
    '/categories/:id',
    {
      schema: {
        tags: ['Categories'],
        summary: 'Delete a category',
        description:
          'Events filed under this category are **kept**, with their `categoryId` set to `null`. Call `GET /api/categories/counts` first if you want to warn the user how many events that affects.',
        params: idParam,
        response: {
          204: { description: 'Deleted. Its events are kept with `categoryId: null`.', type: 'null' },
          401: errorResponse('Not signed in.'),
          404: errorResponse('No category with that id in your space.'),
        },
      },
    },
    async (request, reply) => {
      const existing = await findInSpace(request, request.params.id);
      await db.delete(schema.categories).where(eq(schema.categories.id, existing.id));
      return reply.code(204).send();
    },
  );
}
