import { useFonts } from 'expo-font';
// Imported from the per-weight subpaths, not the package root. The root index
// re-exports all seven weights, and Metro bundles every one it can see — that
// is 637KB of TTF for the two faces actually used.
import BricolageGrotesque_600SemiBold from '@expo-google-fonts/bricolage-grotesque/600SemiBold/BricolageGrotesque_600SemiBold.ttf';
import BricolageGrotesque_800ExtraBold from '@expo-google-fonts/bricolage-grotesque/800ExtraBold/BricolageGrotesque_800ExtraBold.ttf';

/**
 * Loads the display face.
 *
 * Bundled with the app rather than fetched like the web's <link> — a phone
 * should not need the network to render its own type, and there is no
 * equivalent of `font-display: swap` worth relying on here.
 */
export function useAppFonts(): boolean {
  const [loaded] = useFonts({
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_800ExtraBold,
  });
  return loaded;
}
