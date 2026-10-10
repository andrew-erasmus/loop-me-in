import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { spaceCreateSchema, spaceRenameSchema } from '../core.js';
import { createInvite, redeemInvite } from '../auth/invites.js';
import { setDevActiveSpace } from '../auth/guard.js';
import {
  clearSessionCookie,
  createSpace,
  deleteSpace,
  destroySession,
  leaveSpace,
  ownerOf,
  isMember,
  membersOfSpace,
  removeMember,
  renameSpace,
  setSessionSpace,
  spacesForUser,
} from '../auth/session.js';
import { memberJoined, memberLeft, spaceDeleted } from '../notifications/activity.js';
import { bodySchemas, errorResponse, idParam, ref } from '../openapi.js';
import { badRequest, forbidden, notFound, parseBody } from './helpers.js';
import { toSpace, toSpaceSummary, toUser } from './present.js';
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

/**
 * The `/auth/me` payload: who you are, where you are, who else is here — and
 * who is in each of your other spaces, which is what the Spaces page lists.
 * One query per space; an account belongs to a handful at most.
 */
async function describeSession(user: UserRow, space: SpaceRow) {
  const spaces = await spacesForUser(user.id);
  const summaries = await Promise.all(
    spaces.map(async (row) =>
      toSpaceSummary(row, await membersOfSpace(row.id), await ownerOf(row.id)),
    ),
  );
  const current = summaries.find((summary) => summary.id === space.id);
  return {
    user: toUser(user),
    space: toSpace(space),
    members: current?.members ?? (await membersOfSpace(space.id)).map(toUser),
    spaces: summaries,
  };
}

/** Point the caller at a space: their session row, or the dev bypass's memory. */
async function enterSpace(sessionId: string | null, userId: string, spaceId: string) {
  if (sessionId) await setSessionSpace(sessionId, spaceId);
  else setDevActiveSpace(userId, spaceId);
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

      await enterSpace(sessionId, user.id, spaceId);
      return describeSession(user, space);
    },
  );

  app.post(
    '/spaces',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Create a space',
        description:
          'Starts a new, empty space with you as its only member, and switches this session to it. Invite someone into it with `POST /spaces/invites`.',
        body: bodySchemas.spaceCreate,
        response: {
          201: ref.me,
          400: errorResponse('Empty name.'),
          401: errorResponse('Not signed in.'),
        },
      },
    },
    async (request, reply) => {
      const { name } = parseBody(spaceCreateSchema, request.body);
      const { user, sessionId } = request.auth;

      const space = await createSpace(name, user.id);
      await enterSpace(sessionId, user.id, space.id);
      return reply.code(201).send(await describeSession(user, space));
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

      const redeemed = await redeemInvite(code, user.id);
      if (!redeemed) {
        throw badRequest('That invite link is no longer valid. Ask for a new one.');
      }
      const { space, joined } = redeemed;
      if (joined) {
        memberJoined({ log: request.log, actorId: user.id, spaceId: space.id }, user, space);
      }

      await enterSpace(sessionId, user.id, space.id);
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
   * Delete a space, for everyone in it. The one thing in a space that needs a
   * role: only its owner — whoever created it — can, because it takes
   * everyone else's plans with it, not just their own.
   */
  app.delete<{ Params: { id: string } }>(
    '/spaces/:id',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Delete a space you own',
        description:
          'Deletes the space and everything in it — events, lists, categories, invites — for every member. Anyone looking at it is moved to another space they belong to, or to a fresh one if it was their only one; nobody is signed out. The other members are notified.',
        params: idParam,
        response: {
          200: ref.me,
          401: errorResponse('Not signed in.'),
          403: errorResponse('You do not belong to that space, or did not create it.'),
        },
      },
    },
    async (request) => {
      const { user, sessionId } = request.auth;
      const targetId = request.params.id;

      const target = (await spacesForUser(user.id)).find((space) => space.id === targetId);
      if (!target) throw forbidden('You do not belong to that space');
      if (target.role !== 'owner') {
        throw forbidden('Only the person who created this calendar can delete it.');
      }

      const memberIds = (await membersOfSpace(targetId)).map((member) => member.id);
      const landing = await deleteSpace(targetId);
      spaceDeleted(
        { log: request.log, actorId: user.id, spaceId: targetId },
        user,
        target,
        memberIds,
      );

      // Deleting the space you're looking at lands you wherever deleteSpace
      // moved your session; deleting another one leaves you where you are.
      if (request.auth.space.id !== targetId) {
        return describeSession(user, request.auth.space);
      }
      const next = landing.get(user.id)!;
      await enterSpace(sessionId, user.id, next.id);
      return describeSession(user, next);
    },
  );

  /**
   * Leave a space someone else created. Its owner can't leave — they can
   * delete it instead — because a space nobody created is a space nobody can
   * ever delete.
   */
  app.post<{ Params: { id: string } }>(
    '/spaces/:id/leave',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Leave a space you did not create',
        description:
          'Takes you out of the space. Like being removed, your `private` and `surprise` events in it go and everything shared stays. Unlike being removed, nobody is signed out: your sessions move to another space you belong to, or a fresh one if it was your only one. The others are notified.',
        params: idParam,
        response: {
          200: ref.me,
          401: errorResponse('Not signed in.'),
          403: errorResponse('You do not belong to that space, or you created it.'),
        },
      },
    },
    async (request) => {
      const { user, sessionId } = request.auth;
      const targetId = request.params.id;

      const target = (await spacesForUser(user.id)).find((space) => space.id === targetId);
      if (!target) throw forbidden('You do not belong to that space');
      if (target.role === 'owner') {
        throw forbidden('You created this calendar, so you can’t leave it — delete it instead.');
      }

      const next = await leaveSpace(targetId, user);
      // Told after leaving, so the leaver isn't among the people told.
      memberLeft({ log: request.log, actorId: user.id, spaceId: targetId }, user, target);

      if (request.auth.space.id !== targetId) {
        return describeSession(user, request.auth.space);
      }
      await enterSpace(sessionId, user.id, next.id);
      return describeSession(user, next);
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
          403: errorResponse('That person created the space.'),
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
      // A space with no owner could never be deleted by anyone.
      if ((await ownerOf(space.id)) === targetId) {
        throw forbidden('You can’t remove the person who created this calendar.');
      }

      await removeMember(space.id, targetId);
      return describeSession(user, space);
    },
  );
}
