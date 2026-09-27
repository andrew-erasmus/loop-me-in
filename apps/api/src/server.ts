import { buildApp } from './app.js';
import { config } from './config.js';

/**
 * Entrypoint for local dev (`tsx watch`) and any traditional host that runs
 * this as a long-lived process. Vercel does not use this file — see
 * `api/[...slug].ts`, which drives the same `buildApp()` without a socket.
 */
const app = await buildApp();

try {
  await app.listen({ port: config.port, host: '0.0.0.0' });
  if (!config.isProduction) {
    app.log.info(`API docs on http://localhost:${config.port}/docs`);
  }
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
