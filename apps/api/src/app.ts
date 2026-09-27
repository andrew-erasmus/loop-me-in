import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import googleAuthRoutes from './auth/google.js';
import { requireAuth } from './auth/guard.js';
import { config, devAuthEnabled, googleConfigured } from './config.js';
import { openapiDocument, registerComponents } from './openapi.js';
import authRoutes from './routes/auth.js';
import categoryRoutes from './routes/categories.js';
import eventRoutes from './routes/events.js';
import listRoutes from './routes/lists.js';

/**
 * Builds and configures the Fastify app, but does not `.listen()`.
 *
 * Separated from `server.ts` so the same app can be driven two ways: a real
 * listening socket for local dev and traditional hosts (`server.ts`), or
 * handed raw request/response objects one at a time by a serverless runtime
 * that never calls `.listen()` itself (`api/[...slug].ts`, for Vercel).
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.isProduction
      ? true
      : {
          transport: {
            target: 'pino-pretty',
            options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
          },
        },
  });

  /**
   * Route schemas exist to document the API and to serialize responses — not to
   * validate requests. Validation stays with the Zod schemas in the handlers,
   * which are the source those JSON Schemas are generated from and which express
   * rules JSON Schema cannot: `.trim()` before a length check, and the
   * cross-field rule that an event may not end before it starts.
   *
   * Running both would mean two validators racing to reject the same request,
   * with the error wording depending on which won. This pass-through keeps one
   * validation path and one set of messages.
   */
  app.setValidatorCompiler(() => (data) => ({ value: data }));

  /**
   * Surface errors as `{ error, details? }` so the shared client can present a
   * useful message instead of a bare status code.
   *
   * This must be installed before the routes are registered — a plugin captures
   * the error handler in force at the time it boots, so registering it later
   * leaves the routes on Fastify's default `{ statusCode, error, message }`
   * shape and the real message never reaches the client.
   */
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 500) {
      request.log.error(error);
    }

    // Zod does the validating (see the validator compiler above), so this branch
    // should not fire. It is kept as a safety net: if a schema ever is validated
    // by Fastify, its errors still come out in the same
    // `{ error, details: { fieldErrors } }` shape clients already handle.
    if (error.validation) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of error.validation) {
        const path =
          issue.instancePath.replace(/^\//, '').replace(/\//g, '.') ||
          String(issue.params?.['missingProperty'] ?? '_');
        (fieldErrors[path] ??= []).push(issue.message ?? 'Invalid value');
      }
      return reply.code(400).send({
        error: 'Validation failed',
        details: { formErrors: [], fieldErrors },
      });
    }

    reply.code(statusCode).send({
      error: error.message,
      details: (error as { details?: unknown }).details,
    });
  });

  /**
   * `origin: true` reflects the caller's origin, which is what lets a session
   * cookie travel on a cross-origin request — `credentials: true` is refused by
   * browsers alongside a wildcard. In development the web app comes through
   * Vite's proxy and is same-origin anyway; this is for a device or a deployed
   * front end on its own domain.
   */
  await app.register(cors, { origin: true, credentials: true });

  /**
   * Signs the session cookie. A random per-boot secret is fine in development —
   * it just means restarting the API signs everyone out — but in production it
   * would invalidate every session on each deploy, so it has to be set.
   */
  if (config.isProduction && !config.sessionSecret) {
    app.log.error('SESSION_SECRET must be set when NODE_ENV=production.');
    throw new Error('SESSION_SECRET must be set when NODE_ENV=production.');
  }

  // A cross-site cookie is only honoured over HTTPS. Catching it here beats
  // shipping a build where sign-in appears to succeed and then does nothing.
  if (config.crossSiteCookie && !config.isProduction) {
    app.log.warn(
      'COOKIE_SAMESITE=none forces a Secure cookie, which browsers refuse over plain http. Use it only with HTTPS.',
    );
  }

  await app.register(cookie, {
    secret: config.sessionSecret || randomBytes(32).toString('hex'),
  });

  await app.register(swagger, {
    openapi: openapiDocument,
    // Without this, shared schemas registered via addSchema are published as
    // `def-0`, `def-1`… in the components block. Use their `$id` instead so the
    // docs show `Category` and `CalendarEvent` by name.
    refResolver: {
      buildLocalReference: (json, _baseUri, _fragment, i) =>
        (json.$id as string | undefined) ?? `def-${i}`,
    },
  });

  // The browsable UI only, not the OpenAPI JSON itself (`swagger` above stays
  // registered either way — `registerComponents` needs it). Skipped in
  // production for two reasons: nobody but the two of you can reach this API
  // anyway, so there's no audience for it there, and `@fastify/swagger-ui`
  // pulls in `@fastify/static`, whose installed `content-disposition`
  // dependency ships ESM-only — a `require()` of it crashes Vercel's
  // serverless function outright (it doesn't surface locally, since Node
  // there never eagerly evaluates that require the way the bundled function
  // does). Skipping the plugin sidesteps the broken dependency entirely
  // rather than trying to pin around it.
  if (!config.isProduction) {
    await app.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: {
        // Endpoints listed alphabetically within each tag rather than in
        // registration order, which is arbitrary from a reader's point of view.
        docExpansion: 'list',
        operationsSorter: 'alpha',
        tagsSorter: 'alpha',
        persistAuthorization: true,
      },
    });
  }

  // Component schemas must exist before any route references them by $ref.
  registerComponents(app);

  // Sign-in lives at the root scope, deliberately outside the guarded plugin
  // below — so the routes that exist to get you a session are not themselves
  // behind one, without an exclusion list anyone has to remember to maintain.
  await app.register(googleAuthRoutes);

  await app.register(
    async (api) => {
      // Everything registered inside this plugin is behind the guard, including
      // `/auth/me` — whose 401 is exactly how the web app knows to show its
      // sign-in screen.
      api.addHook('onRequest', requireAuth);

      await api.register(authRoutes);
      await api.register(categoryRoutes);
      await api.register(eventRoutes);
      await api.register(listRoutes);
    },
    { prefix: '/api' },
  );

  app.get(
    '/api/health',
    {
      schema: {
        tags: ['System'],
        summary: 'Liveness check',
        response: {
          200: {
            description: 'The server is up.',
            type: 'object',
            properties: { ok: { type: 'boolean' } },
            required: ['ok'],
          },
        },
      },
    },
    async () => ({ ok: true }),
  );

  if (devAuthEnabled()) {
    app.log.warn(
      `AUTH_DEV_USER is set — every request is signed in as ${config.devUserEmail}. Never do this in production.`,
    );
  } else if (!googleConfigured()) {
    app.log.warn(
      'No sign-in method is configured: set GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET, or AUTH_DEV_USER for local work.',
    );
  }

  return app;
}
