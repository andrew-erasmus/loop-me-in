const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

/**
 * Metro, taught about the monorepo.
 *
 * Three things differ from a standalone Expo app:
 *
 * 1. `watchFolders` — @date-calendar/core lives outside this directory, and
 *    Metro will not notice edits to files it is not watching. Without the repo
 *    root here, changing a shared type means restarting the bundler.
 *
 * 2. `nodeModulesPaths` — npm hoists most dependencies to the root
 *    node_modules, so resolution has to look in both places.
 *
 * 3. `disableHierarchicalLookup` — left ON (the default) deliberately. Turning
 *    it off is common advice for monorepos, but it makes Metro walk every
 *    parent directory, which in a workspace is how you end up resolving two
 *    copies of React and getting "Invalid hook call" with no useful trace.
 *
 * `@date-calendar/core` ships raw TypeScript rather than a build artefact.
 * Metro transpiles it through babel-preset-expo like any other source file, so
 * no extra configuration is needed — but that is exactly why point 1 matters.
 */

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

/**
 * Resolve ESM-style `./thing.js` specifiers onto the `./thing.ts` that actually
 * exists.
 *
 * `packages/core` is written for Node and Vite, both of which require (or
 * happily accept) an explicit `.js` extension pointing at a TypeScript source
 * file. Metro does not do that rewrite, so every internal import in core fails
 * to resolve.
 *
 * Fixing it here rather than in core is deliberate: core's specifiers are
 * correct for its other two consumers, and Metro is the one with the unusual
 * rule. The real extension is tried first so that a genuine `.js` file in
 * node_modules still wins — only when nothing is there do we retry without it.
 */
const upstreamResolve = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = upstreamResolve ?? context.resolveRequest;

  if (moduleName.startsWith('.') && moduleName.endsWith('.js')) {
    try {
      return resolve(context, moduleName, platform);
    } catch {
      return resolve(context, moduleName.slice(0, -'.js'.length), platform);
    }
  }

  return resolve(context, moduleName, platform);
};

module.exports = config;
