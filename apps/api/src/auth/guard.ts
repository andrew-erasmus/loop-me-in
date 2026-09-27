import { eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { config, devAuthEnabled } from '../config.js';
import { db, schema } from '../db/index.js';
import { unauthorized } from '../routes/helpers.js';
import {
  ensureSpaceForUser,
  loadSession,
  readSessionCookie,
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
