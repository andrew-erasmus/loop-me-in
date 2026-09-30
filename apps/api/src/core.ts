/**
 * Re-exports `@date-calendar/core` through a relative import instead of the
 * bare package specifier.
 *
 * `@date-calendar/core` ships raw TypeScript with no build step — Vite and
 * `tsx` both transpile it directly, which is deliberate: it keeps the shared
 * package editable without a watch task standing between a change and the app
 * that uses it.
 * Vercel's serverless bundler resolves a *bare* import of it through plain
 * node_modules `exports`, lands on that unbuilt `.ts` entry point, and has no
 * loader for it at runtime — the deployed function crashes on
 * `ERR_MODULE_NOT_FOUND`. A *relative* import doesn't go through package
 * resolution at all: Vercel's bundler treats it exactly like this package's
 * own source, transpiles it to real `.js`, and the emitted import keeps
 * working at runtime. One file carries the relative path so the rest of this
 * package's source can import `../core.js` (or `./core.js`) without having
 * to know how many directories deep it is.
 */
export * from '../../../packages/core/src/index.js';
