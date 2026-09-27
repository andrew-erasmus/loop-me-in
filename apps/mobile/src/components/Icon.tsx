import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { colors } from '../theme';

/**
 * The one place every icon on the mobile app passes through — the RN sibling
 * of the web app's own `Icon.tsx`, same idea, different renderer underneath
 * (`react-native-svg` here instead of the DOM).
 *
 * `size` is a small token scale rather than a raw pixel number, so an icon's
 * size follows the same handful of steps as the rest of `theme.ts` instead of
 * every call site picking its own number.
 */

const SIZES = { xs: 11, sm: 14, md: 16, lg: 22 } as const;

export default function Icon({
  icon,
  size = 'md',
  color = colors.ink,
}: {
  icon: IconDefinition;
  size?: keyof typeof SIZES;
  color?: string;
}) {
  return <FontAwesomeIcon icon={icon} size={SIZES[size]} color={color} />;
}
