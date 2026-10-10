import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { notificationPreferencesPatchSchema, pushDeviceInputSchema } from '../core.js';
import { db, schema } from '../db/index.js';
import { pushConfigured } from '../notifications/firebase.js';
import { preferencesFor, sendToUsers } from '../notifications/notify.js';
import { bodySchemas, errorResponse, ref } from '../openapi.js';
import { parseBody } from './helpers.js';

/**
 * Which notifications you want, and which of your browsers should get them.
 *
 * Preferences belong to the account; devices belong to a session. Saying yes
 * on your phone registers the phone, but switching "changes a plan" off
 * applies everywhere you're signed in.
 */
export default async function notificationRoutes(app: FastifyInstance) {
  app.get(
    '/notifications/settings',
    {
      schema: {
        tags: ['Notifications'],
        summary: 'Your notification preferences',
        response: { 200: ref.notificationSettings, 401: errorResponse('Not signed in.') },
      },
    },
    async (request) => ({
      preferences: await preferencesFor(request.auth.user.id),
      pushConfigured: pushConfigured(),
    }),
  );

  app.patch(
    '/notifications/settings',
    {
      schema: {
        tags: ['Notifications'],
        summary: 'Turn kinds of notification on or off',
        description: 'Accepts any subset of the switches; the rest are left as they were.',
        body: bodySchemas.notificationPreferencesPatch,
        response: {
          200: ref.notificationSettings,
          400: errorResponse('Empty patch, or a switch that is not true/false.'),
          401: errorResponse('Not signed in.'),
        },
      },
    },
    async (request) => {
      const patch = parseBody(notificationPreferencesPatchSchema, request.body);
      const userId = request.auth.user.id;
      const preferences = { ...(await preferencesFor(userId)), ...patch };

      await db
        .insert(schema.notificationSettings)
        .values({ userId, preferences, updatedAt: new Date().toISOString() })
        .onConflictDoUpdate({
          target: schema.notificationSettings.userId,
          set: { preferences, updatedAt: new Date().toISOString() },
        });

      return { preferences, pushConfigured: pushConfigured() };
    },
  );

  app.post(
    '/notifications/devices',
    {
      schema: {
        tags: ['Notifications'],
        summary: 'Register this browser for push notifications',
        description:
          'Idempotent. A token already registered — even to someone else, on a shared computer — moves to you and this session.',
        body: bodySchemas.pushDeviceInput,
        response: {
          204: { description: 'Registered.', type: 'null' },
          400: errorResponse('Missing token, or an unknown time zone.'),
          401: errorResponse('Not signed in.'),
        },
      },
    },
    async (request, reply) => {
      const { token, timeZone } = parseBody(pushDeviceInputSchema, request.body);
      const owner = {
        userId: request.auth.user.id,
        sessionId: request.auth.sessionId,
        timeZone,
      };

      await db
        .insert(schema.pushDevices)
        .values({ token, ...owner, createdAt: new Date().toISOString() })
        .onConflictDoUpdate({ target: schema.pushDevices.token, set: owner });

      return reply.code(204).send();
    },
  );

  app.delete<{ Params: { token: string } }>(
    '/notifications/devices/:token',
    {
      schema: {
        tags: ['Notifications'],
        summary: 'Stop sending notifications to a browser',
        params: {
          type: 'object',
          properties: { token: { type: 'string', description: 'The FCM token' } },
          required: ['token'],
        },
        response: {
          204: { description: 'Unregistered, or was never registered.', type: 'null' },
          401: errorResponse('Not signed in.'),
        },
      },
    },
    async (request, reply) => {
      await db
        .delete(schema.pushDevices)
        .where(
          and(
            eq(schema.pushDevices.token, request.params.token),
            eq(schema.pushDevices.userId, request.auth.user.id),
          ),
        );
      return reply.code(204).send();
    },
  );

  app.post(
    '/notifications/test',
    {
      schema: {
        tags: ['Notifications'],
        summary: 'Send yourself a test notification',
        description:
          'Pushes to every device you have turned notifications on for, regardless of your preferences. `sent` is how many accepted it.',
        response: {
          200: {
            description: 'How many of your devices Firebase accepted the push for.',
            type: 'object',
            properties: { sent: { type: 'integer' } },
            required: ['sent'],
          },
          401: errorResponse('Not signed in.'),
        },
      },
    },
    async (request) => ({
      sent: await sendToUsers(request.log, [request.auth.user.id], () => ({
        title: 'Loop Me In',
        body: 'Notifications are working. You’ll hear from us when something changes.',
        tag: 'test',
      })),
    }),
  );
}
