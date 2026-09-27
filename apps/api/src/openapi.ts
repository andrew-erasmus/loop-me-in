import type { FastifyInstance } from 'fastify';
import type { ZodSchema } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  calendarEventSchema,
  categoryInputSchema,
  categoryPatchSchema,
  categorySchema,
  eventInputSchema,
  eventPatchSchema,
  inviteSchema,
  listInputSchema,
  listItemInputSchema,
  listItemPatchSchema,
  listItemSchema,
  listPatchSchema,
  listSchema,
  meSchema,
  scheduleItemSchema,
  scheduledItemSchema,
  spaceRenameSchema,
  suggestedSlotSchema,
} from './core.js';

/**
 * OpenAPI definitions derived from the Zod schemas in @date-calendar/core.
 *
 * The point of generating rather than hand-writing these is that there is one
 * source of truth: the schema the server validates with is the schema the docs
 * describe. A hand-written spec drifts the first time a field is added.
 */

/**
 * Convert a Zod schema to JSON Schema for Fastify.
 *
 * `$refStrategy: 'none'` inlines everything — with refs, a schema reused in two
 * places emits a `definitions` block that Fastify's serializer cannot resolve.
 * The `$schema` key is stripped for the same reason: Fastify rejects it as an
 * unknown keyword when compiling response serializers.
 */
function toJsonSchema(schema: ZodSchema<unknown>): Record<string, unknown> {
  const { $schema, ...rest } = zodToJsonSchema(schema, {
    target: 'jsonSchema7',
    $refStrategy: 'none',
  }) as Record<string, unknown>;
  void $schema;
  return rest;
}

/** Entity schemas, registered as reusable OpenAPI components. */
export const componentIds = {
  category: 'Category',
  event: 'CalendarEvent',
  me: 'Session',
  invite: 'Invite',
  list: 'List',
  listItem: 'ListItem',
  scheduledItem: 'ScheduledItem',
  suggestedSlot: 'SuggestedSlot',
  error: 'Error',
} as const;

const errorSchema = {
  type: 'object',
  properties: {
    error: { type: 'string', description: 'Human-readable failure reason' },
    details: {
      type: 'object',
      additionalProperties: true,
      description: 'Field-level validation errors, when the failure was a bad body',
    },
  },
  required: ['error'],
} as const;

/**
 * Register the shared component schemas. Must run before any route that
 * references them by `$ref`.
 */
export function registerComponents(app: FastifyInstance): void {
  app.addSchema({
    $id: componentIds.category,
    title: 'Category',
    description: 'A colour-coded label that events can be filed under.',
    ...toJsonSchema(categorySchema),
  });

  app.addSchema({
    $id: componentIds.event,
    title: 'CalendarEvent',
    description:
      'A calendar entry. `startsAt`/`endsAt` are ISO 8601 UTC instants; clients render them in their own timezone.',
    ...toJsonSchema(calendarEventSchema),
  });

  app.addSchema({
    $id: componentIds.me,
    title: 'Session',
    description:
      'The signed-in account, the space it is currently looking at, and everyone in that space.',
    ...toJsonSchema(meSchema),
  });

  app.addSchema({
    $id: componentIds.invite,
    title: 'Invite',
    description: 'A single-use link that adds whoever redeems it to a space.',
    ...toJsonSchema(inviteSchema),
  });

  app.addSchema({
    $id: componentIds.list,
    title: 'List',
    description: 'A named collection of things to do, watch or visit.',
    ...toJsonSchema(listSchema),
  });

  app.addSchema({
    $id: componentIds.listItem,
    title: 'ListItem',
    description:
      'One thing on a list. `scheduledEventId` links it to a calendar event; deleting that event clears the link but never the item.',
    ...toJsonSchema(listItemSchema),
  });

  app.addSchema({
    $id: componentIds.scheduledItem,
    title: 'ScheduledItem',
    description: 'Both sides of a newly created link between an item and an event.',
    ...toJsonSchema(scheduledItemSchema),
  });

  app.addSchema({
    $id: componentIds.suggestedSlot,
    title: 'SuggestedSlot',
    description:
      'A candidate window for scheduling an item — nothing on either person\'s calendar overlaps it.',
    ...toJsonSchema(suggestedSlotSchema),
  });

  app.addSchema({
    $id: componentIds.error,
    title: 'Error',
    ...errorSchema,
  });
}

export const ref = {
  category: { $ref: `${componentIds.category}#` },
  event: { $ref: `${componentIds.event}#` },
  me: { $ref: `${componentIds.me}#` },
  invite: { $ref: `${componentIds.invite}#` },
  list: { $ref: `${componentIds.list}#` },
  listItem: { $ref: `${componentIds.listItem}#` },
  scheduledItem: { $ref: `${componentIds.scheduledItem}#` },
  suggestedSlot: { $ref: `${componentIds.suggestedSlot}#` },
  error: { $ref: `${componentIds.error}#` },
} as const;

/**
 * An error response with a real description — Swagger UI otherwise labels every
 * one of them "Default Response", which tells a reader nothing.
 */
export function errorResponse(description: string) {
  return { description, ...ref.error };
}

/**
 * Attach per-property examples to a generated schema.
 *
 * Without these, Swagger UI pre-fills "Try it out" with `"startsAt": "string"`,
 * which fails the moment you press Execute. Realistic values make the page
 * usable as a scratchpad rather than just a reference.
 */
function withExamples(
  schema: Record<string, unknown>,
  examples: Record<string, unknown>,
): Record<string, unknown> {
  const properties = { ...(schema['properties'] as Record<string, object>) };
  for (const [field, example] of Object.entries(examples)) {
    if (properties[field]) {
      properties[field] = { ...properties[field], examples: [example] };
    }
  }
  return { ...schema, properties };
}

const EVENT_EXAMPLES = {
  title: 'Sprint planning',
  notes: 'Bring the roadmap',
  startsAt: '2026-09-21T14:00:00.000Z',
  endsAt: '2026-09-21T15:30:00.000Z',
  allDay: false,
  categoryId: null,
};

const CATEGORY_EXAMPLES = { name: 'Work', color: '#3b82f6' };

const LIST_EXAMPLES = { name: 'Movies to watch', emoji: '🎬', color: '#8b5cf6' };

const LIST_ITEM_EXAMPLES = {
  title: 'Dune: Part Two',
  notes: 'The one with the sandworms',
  url: 'https://www.imdb.com/title/tt15239678/',
};

const SCHEDULE_EXAMPLES = {
  startsAt: '2026-10-03T18:00:00.000Z',
  endsAt: '2026-10-03T21:00:00.000Z',
  allDay: false,
  categoryId: null,
};

/** Request body schemas, generated from the same Zod schemas the handlers use. */
export const bodySchemas = {
  categoryInput: withExamples(toJsonSchema(categoryInputSchema), CATEGORY_EXAMPLES),
  categoryPatch: withExamples(toJsonSchema(categoryPatchSchema), CATEGORY_EXAMPLES),
  eventInput: withExamples(toJsonSchema(eventInputSchema), EVENT_EXAMPLES),
  eventPatch: withExamples(toJsonSchema(eventPatchSchema), EVENT_EXAMPLES),
  listInput: withExamples(toJsonSchema(listInputSchema), LIST_EXAMPLES),
  listPatch: withExamples(toJsonSchema(listPatchSchema), LIST_EXAMPLES),
  listItemInput: withExamples(toJsonSchema(listItemInputSchema), LIST_ITEM_EXAMPLES),
  listItemPatch: withExamples(toJsonSchema(listItemPatchSchema), LIST_ITEM_EXAMPLES),
  scheduleItem: withExamples(toJsonSchema(scheduleItemSchema), SCHEDULE_EXAMPLES),
  spaceRename: withExamples(toJsonSchema(spaceRenameSchema), { name: 'Loop Me In' }),
};

/** `:id` path parameter, shared by every single-resource route. */
export const idParam = {
  type: 'object',
  properties: { id: { type: 'string', description: 'Resource id (UUID)' } },
  required: ['id'],
} as const;

/** The `from`/`to` window every calendar view queries with. */
export const rangeQuery = {
  type: 'object',
  properties: {
    from: {
      type: 'string',
      description: 'Start of the window, ISO 8601. Inclusive.',
      examples: ['2026-09-01T00:00:00.000Z'],
    },
    to: {
      type: 'string',
      description: 'End of the window, ISO 8601. Inclusive.',
      examples: ['2026-09-30T23:59:59.999Z'],
    },
  },
  required: ['from', 'to'],
} as const;

/** Query params for a scheduling-suggestions request. Both optional. */
export const suggestSlotsQuery = {
  type: 'object',
  properties: {
    duration: {
      type: 'integer',
      description: 'How long the plan needs, in minutes. Defaults to 120.',
      examples: [120],
    },
    days: {
      type: 'integer',
      description: 'How many days ahead to look. Defaults to 14.',
      examples: [14],
    },
  },
} as const;

// Not `as const`: @fastify/swagger expects mutable arrays for `servers`/`tags`.
export const openapiDocument = {
  openapi: '3.1.0' as const,
  info: {
    title: 'Calendar API',
    description: [
      'Backend for the calendar app.',
      '',
      '**Timestamps** are ISO 8601 UTC instants (`2026-09-21T09:00:00.000Z`). Storage is',
      'timezone-independent; rendering into local time is the client\'s job.',
      '',
      '**Deleting a category does not delete its events.** The foreign key is',
      '`ON DELETE SET NULL`, so events survive with `categoryId: null` and clients show them',
      'in a neutral colour until they are re-categorised. The same rule links list items to',
      'the calendar: deleting a scheduled event un-schedules its item rather than losing it.',
      '',
      '**Everything is scoped to a space.** Every request is answered in terms of the space',
      'your session is currently looking at, and events marked `private` are returned only to',
      'the person who created them. Sign in at `/api/auth/google`, or set `AUTH_DEV_USER` on',
      'the server to work locally without Google credentials.',
    ].join('\n'),
    version: '1.0.0',
  },
  servers: [{ url: 'http://localhost:3031', description: 'Local development' }],
  components: {
    securitySchemes: {
      cookieAuth: {
        type: 'apiKey' as const,
        in: 'cookie',
        name: 'calendar_session',
        description:
          'Session cookie, set by the Google sign-in flow. Browsers send it automatically; "Try it out" works once you are signed in to the web app, or with AUTH_DEV_USER set on the server.',
      },
    },
  },
  // Applied to every operation. The two OAuth routes are registered outside the
  // guarded scope and are hidden from these docs anyway.
  security: [{ cookieAuth: [] }],
  tags: [
    { name: 'Auth', description: 'Sessions, spaces and invites' },
    { name: 'Events', description: 'Calendar entries' },
    { name: 'Categories', description: 'Colour-coded labels for events' },
    { name: 'Lists', description: 'Things to watch, visit and do — and their dates' },
    { name: 'System', description: 'Health and diagnostics' },
  ],
};
