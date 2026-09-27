import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { spaceRenameSchema } from '../core.js';
import { createInvite, redeemInvite } from '../auth/invites.js';
import {
  clearSessionCookie,
  destroySession,
  isMember,
  membersOfSpace,
  removeMember,
  renameSpace,
  setSessionSpace,
  spacesForUser,
} from '../auth/session.js';
import { bodySchemas, errorResponse, idParam, ref } from '../openapi.js';
import { badRequest, forbidden, notFound, parseBody } from './helpers.js';
import { toSpace, toUser } from './present.js';
import type { SpaceRow, UserRow } from '../db/schema.js';

/**
 * Session and space management. Everything here is behind the auth guard —
 * including `/auth/me`, whose 401 is precisely what tells the web app to show
 * the sign-in screen.
 */

const joinSchema = z.object({
  code: z.string().trim().min(1, 'An invite code is required').max(32),
});

const switchSpaceSchema = z.object({ spaceId: z.string().min(1) });

/** The `/auth/me` payload: who you are, where you are, who else is here. */
async function describeSession(user: UserRow, space: SpaceRow) {
  const [members, spaces] = await Promise.all([
    membersOfSpace(space.id),
    spacesForUser(user.id),
  ]);
  return {
    user: toUser(user),
    space: toSpace(space),
    members: members.map(toUser),
    spaces: spaces.map(toSpace),
  };
}

export default async function authRoutes(app: FastifyInstance) {
  app.get(
    '/auth/me',
    {
      schema: {
        tags: ['Auth'],
        summary: 'The current session',
        description:
          'Who you are signed in as, the space you are looking at, everyone else in it, and every space you belong to. A 401 here is how a client knows to show its sign-in screen.',
        response: {
          200: ref.me,
          401: errorResponse('Not signed in, or the session has expired.'),
        },
      },
    },
    async (request) => await describeSession(request.auth.user, request.auth.space),
  );

  app.post(
    '/auth/logout',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Sign out',
        description:
          'Revokes the session server-side and clears the cookie. Signing out on one device does not affect the others.',
        response: { 204: { description: 'Signed out.', type: 'null' } },
      },
    },
    async (request, reply) => {
      if (request.auth.sessionId) await destroySession(request.auth.sessionId);
      clearSessionCookie(reply);
      return reply.code(204).send();
    },
  );

  app.put(
    '/auth/space',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Switch the active space',
        description:
          'Points this session at a different space you belong to. The scope of every other endpoint follows.',
        body: {
          type: 'object',
          properties: { spaceId: { type: 'string' } },
          required: ['spaceId'],
        },
        response: {
          200: ref.me,
          403: errorResponse('You do not belong to that space.'),
        },
      },
    },
    async (request) => {
      const { spaceId } = parseBody(switchSpaceSchema, request.body);
      const { user, sessionId } = request.auth;

      if (!(await isMember(spaceId, user.id))) {
        // Deliberately not a 404: telling the caller whether an unknown id
        // exists would let them probe for other people's spaces.
        throw forbidden('You do not belong to that space');
      }

      const spaces = await spacesForUser(user.id);
      const space = spaces.find((candidate) => candidate.id === spaceId);
      if (!space) throw notFound('Space not found');

      // The dev bypass has no session row to update; it always resolves to the
      // user's first space, which is the only one it can be looking at.
      if (sessionId) await setSessionSpace(sessionId, spaceId);

      return describeSession(user, space);
    },
  );

  app.post(
    '/spaces/invites',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Create an invite link',
        description:
          'Mints a single-use code, valid for seven days, that adds whoever redeems it to your current space.',
        response: { 201: ref.invite },
      },
    },
    async (request, reply) => {
      const invite = await createInvite(request.auth.space.id, request.auth.user.id);
      return reply.code(201).send(invite);
    },
  );

  app.post(
    '/spaces/join',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Redeem an invite code',
        description:
          'Joins the invite\'s space and switches this session to it. Redeeming a code you have already used is a no-op rather than an error.',
        body: {
          type: 'object',
          properties: { code: { type: 'string' } },
          required: ['code'],
        },
        response: {
          200: ref.me,
          400: errorResponse('The code is unknown, expired, or already used.'),
        },
      },
    },
    async (request) => {
      const { code } = parseBody(joinSchema, request.body);
      const { user, sessionId } = request.auth;

      const space = await redeemInvite(code, user.id);
      if (!space) {
        throw badRequest('That invite link is no longer valid. Ask for a new one.');
      }

      if (sessionId) await setSessionSpace(sessionId, space.id);
      return describeSession(user, space);
    },
  );

  /** Rename a space you belong to. Anyone in it can — the same "no roles" rule as everything else here. */
  app.patch<{ Params: { id: string } }>(
    '/spaces/:id',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Rename a space',
        params: idParam,
        body: bodySchemas.spaceRename,
        response: {
          200: ref.me,
          400: errorResponse('Empty name.'),
          401: errorResponse('Not signed in.'),
          403: errorResponse('You do not belong to that space.'),
        },
      },
    },
    async (request) => {
      const { name } = parseBody(spaceRenameSchema, request.body);
      const { user } = request.auth;
      const targetId = request.params.id;

      if (!(await isMember(targetId, user.id))) {
        throw forbidden('You do not belong to that space');
      }

      await renameSpace(targetId, name);

      const spaces = await spacesForUser(user.id);
      const space = spaces.find((candidate) => candidate.id === targetId);
      if (!space) throw notFound('Space not found');

      return describeSession(user, space);
    },
  );

  /**
   * Take someone out of the space you are both in.
   *
   * No role check. This app is two people who trust each other — the same
   * reason there are no per-list permissions — so anyone in a space can remove
   * anyone else in it. What is not allowed is removing *yourself*: the session
   * would be left pointing at a space it no longer belongs to, and "leave this
   * space" is a different question (where do you land?) than "remove them".
   */
  app.delete<{ Params: { id: string } }>(
    '/spaces/members/:id',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Remove someone from your space',
        description:
          'Removes another member from the space you are currently in. Events you planned together are kept — only the material that left with them goes: their `private` events, and their `surprise` events, which would otherwise sit on your calendar as an anonymous "Something planned" that nobody is allowed to delete.',
        params: idParam,
        response: {
          200: ref.me,
          400: errorResponse('You cannot remove yourself from a space.'),
          401: errorResponse('Not signed in.'),
          404: errorResponse('That person is not in this space.'),
        },
      },
    },
    async (request) => {
      const { user, space } = request.auth;
      const targetId = request.params.id;

      if (targetId === user.id) {
        throw badRequest('You cannot remove yourself from a space.');
      }
      if (!(await isMember(space.id, targetId))) {
        throw notFound('That person is not in this space');
      }

      await removeMember(space.id, targetId);
      return describeSession(user, space);
    },
  );
}
