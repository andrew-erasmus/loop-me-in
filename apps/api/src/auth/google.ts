import oauth2, { type OAuth2Namespace } from '@fastify/oauth2';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config, googleConfigured } from '../config.js';
import { redeemInvite } from './invites.js';
import {
  createSession,
  ensureSpaceForUser,
  setSessionCookie,
  upsertGoogleUser,
} from './session.js';

/**
 * Google sign-in, registered at the root scope so it sits outside the
 * authentication guard protecting everything else under `/api`.
 */

declare module 'fastify' {
  interface FastifyInstance {
    /** Decorated by @fastify/oauth2 under the `name` given at registration. */
    googleOAuth2: OAuth2Namespace;
  }
}

const PENDING_INVITE_COOKIE = 'calendar_pending_invite';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

/**
 * Copied from `@fastify/oauth2`'s own `GOOGLE_CONFIGURATION` preset rather than
 * referenced as `oauth2.GOOGLE_CONFIGURATION` — that property is declared on a
 * type the package's own `.d.ts` doesn't actually attach to the value it
 * exports (an `export =` / namespace-merging quirk), so accessing it type-checks
 * under some TypeScript versions and not others. These four URLs are Google's
 * well-known OAuth endpoints and do not change.
 */
const GOOGLE_OAUTH_ENDPOINTS = {
  authorizeHost: 'https://accounts.google.com',
  authorizePath: '/o/oauth2/v2/auth',
  tokenHost: 'https://www.googleapis.com',
  tokenPath: '/oauth2/v4/token',
};

/**
 * Google's userinfo response, of which we want four fields.
 *
 * Fetched by hand rather than through the plugin's `userinfo()` helper: that
 * requires OIDC discovery, which performs a network call at boot and would mean
 * the API refusing to start whenever Google's metadata endpoint is slow.
 */
const googleProfileSchema = z.object({
  sub: z.string(),
  email: z.string().email(),
  name: z.string().optional(),
  given_name: z.string().optional(),
  picture: z.string().optional(),
});

async function fetchProfile(accessToken: string) {
  const response = await fetch(USERINFO_URL, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`Google userinfo failed with ${response.status}`);
  }

  const profile = googleProfileSchema.parse(await response.json());
  return {
    sub: profile.sub,
    email: profile.email,
    name: profile.name ?? profile.given_name ?? profile.email,
    picture: profile.picture ?? null,
  };
}

/** Send the browser back to the web app, optionally with an error to show. */
function backToApp(error?: string): string {
  if (!error) return config.webOrigin;
  return `${config.webOrigin}/?auth_error=${encodeURIComponent(error)}`;
}

export default async function googleAuthRoutes(app: FastifyInstance) {
  if (!googleConfigured()) {
    // Booting without credentials is normal — `AUTH_DEV_USER` covers local
    // work. Fail at the point someone actually clicks sign in, with a message
    // saying what is missing, rather than refusing to start.
    app.log.warn(
      'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are unset — Google sign-in is disabled.',
    );
    app.get('/api/auth/google', { schema: { hide: true } }, async (_request, reply) =>
      reply.redirect(backToApp('Google sign-in is not configured on this server.')),
    );
    return;
  }

  await app.register(oauth2, {
    name: 'googleOAuth2',
    scope: ['openid', 'profile', 'email'],
    credentials: {
      client: { id: config.google.clientId, secret: config.google.clientSecret },
      auth: GOOGLE_OAUTH_ENDPOINTS,
    },
    callbackUri: config.google.callbackUrl,
    // No `startRedirectPath`: the entry point below is ours, so that an invite
    // code can be stashed before control passes to Google.
  });

  /**
   * Entry point. `?join=CODE` arrives here when someone follows an invite link
   * while signed out — Google has nowhere to carry it, so it rides in a
   * short-lived cookie and is redeemed on the way back.
   */
  app.get<{ Querystring: { join?: string } }>(
    '/api/auth/google',
    { schema: { hide: true } },
    async (request, reply) => {
      if (request.query.join) {
        reply.setCookie(PENDING_INVITE_COOKIE, request.query.join, {
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
          secure: config.isProduction,
          signed: true,
          maxAge: 10 * 60,
        });
      }

      const uri = await app.googleOAuth2.generateAuthorizationUri(request, reply);
      return reply.redirect(uri);
    },
  );

  app.get(
    '/api/auth/google/callback',
    { schema: { hide: true } },
    async (request, reply) => {
      let profile: Awaited<ReturnType<typeof fetchProfile>>;
      try {
        const { token } =
          await app.googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(request, reply);
        profile = await fetchProfile(token.access_token);
      } catch (error) {
        request.log.error(error, 'Google sign-in failed');
        return reply.redirect(backToApp('Google sign-in failed. Please try again.'));
      }

      const user = await upsertGoogleUser(profile);

      // An invite decides which space a brand-new account lands in, so it is
      // redeemed before falling back to creating one of their own — otherwise
      // the two of you end up in separate spaces with nothing to merge them.
      const pending = request.cookies[PENDING_INVITE_COOKIE];
      const code = pending ? request.unsignCookie(pending) : null;
      reply.clearCookie(PENDING_INVITE_COOKIE, { path: '/' });

      const invited =
        code?.valid && code.value ? await redeemInvite(code.value, user.id) : null;
      const space = invited ?? (await ensureSpaceForUser(user));

      setSessionCookie(reply, await createSession(user.id, space.id));
      return reply.redirect(config.webOrigin);
    },
  );
}
