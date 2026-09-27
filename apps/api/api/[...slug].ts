import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

/**
 * Vercel's Node runtime entrypoint. Any path under `/api/*` on this project's
 * domain lands here — the `[...slug]` catch-all just gives Vercel a file to
 * route to; the actual routing happens inside Fastify exactly as it always
 * has, since every route in this app is already declared with its own
 * leading `/api/...` path.
 *
 * `buildApp()` registers plugins asynchronously, which is too slow to redo on
 * every request. Vercel reuses a warm function instance across nearby
 * invocations, so the built app is cached on the module scope and only
 * rebuilt when a fresh instance cold-starts.
 */
let appPromise: Promise<FastifyInstance> | null = null;

function getApp(): Promise<FastifyInstance> {
  if (!appPromise) appPromise = buildApp().then((app) => app.ready().then(() => app));
  return appPromise;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await getApp();
  app.server.emit('request', req, res);
}
