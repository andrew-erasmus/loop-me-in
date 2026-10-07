import { eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { config, devAuthEnabled } from '../config.js';
import { db, schema } from '../db/index.js';
import { unauthorized } from '../routes/helpers.js';
import {
  ensureSpaceForUser,
  isMember,
  loadSession,
  readSessionCookie,
  spacesForUser,
  type AuthContext,
} from './session.js';

/**
 * The guard every `/api` route sits behind.
 *
 * Registered as an `onRequest` hook inside the `/api` plugin scope, so the
 * Google entry and callback routes — which are registered at the root scope —
 * are outside it by construction rather than by an exclusion list that someone
 * has to remember to keep in step.
 */

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * Who is making this request and which space they are looking at. Present
     * on every route behind the guard; the scope for every query.
     */
    auth: AuthContext;
  }
}

/**
 * The space the dev bypass is looking at, by user id.
 *
 * The bypass has no session row to keep it in, so without this every request
 * landed back in the user's first space and switching could not be tried out
 * locally at all. In memory is enough: it is dev-only, and a restart dropping
 * you back into your first space is harmless.
 */
const devActiveSpace = new Map<string, string>();

/** Point the dev bypass at another space. A no-op for real sessions. */
export function setDevActiveSpace(userId: string, spaceId: string): void {
  if (devAuthEnabled()) devActiveSpace.set(userId, spaceId);
}

/**
 * Development sign-in: resolve `AUTH_DEV_USER` to a real user row.
 *
 * This is the only way to use the app before Google credentials exist, and the
 * only way Swagger's "Try it out" works at all. `devAuthEnabled()` refuses
 * outright when NODE_ENV is production.
 */
async function devAuth(): Promise<AuthContext> {
  const user = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, config.devUserEmail))
    .get();

  if (!user) {
    throw unauthorized(
      `AUTH_DEV_USER is set to "${config.devUserEmail}" but no such user exists. Run \`npm run seed\` to create the demo accounts.`,
    );
  }

  // Re-checked like a real session's would be: a space you were switched into
  // and have since been removed from must not keep answering.
  const activeId = devActiveSpace.get(user.id);
  if (activeId && (await isMember(activeId, user.id))) {
    const space = (await spacesForUser(user.id)).find((row) => row.id === activeId);
    if (space) return { user, space, sessionId: null };
  }

  return { user, space: await ensureSpaceForUser(user), sessionId: null };
}

export async function requireAuth(request: FastifyRequest): Promise<void> {
  if (devAuthEnabled()) {
    request.auth = await devAuth();
    return;
  }

  const sessionId = readSessionCookie(request);
  const auth = sessionId ? await loadSession(sessionId) : null;
  if (!auth) throw unauthorized();

  request.auth = auth;
}
