/**
 * Asset imports, for TypeScript's benefit.
 *
 * Metro turns `import font from './x.ttf'` into an asset handle (a number);
 * TypeScript has no idea what a .ttf is without being told.
 *
 * This lives here rather than in `expo-env.d.ts` because Expo owns that file
 * and regenerates it — a declaration added there disappears on the next
 * `expo install`.
 */
declare module '*.ttf' {
  const asset: number;
  export default asset;
}

declare module '*.otf' {
  const asset: number;
  export default asset;
}
