import { FontAwesomeIcon, type FontAwesomeIconProps } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';

/**
 * The one place every icon on the web app passes through.
 *
 * A thin wrapper rather than calling `FontAwesomeIcon` directly everywhere:
 * `size` here is a `className`-friendly token instead of FA's own `xs`/`lg`/…
 * scale, so an icon's size follows the same Tailwind text-size scale as the
 * text sitting next to it, and `aria-hidden` defaults on — icons in this app
 * are always paired with visible text or an explicit `aria-label` on the
 * interactive element around them, never the only description of what a
 * control does.
 */

const SIZES = {
  xs: 'h-3 w-3',
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
} as const;

interface IconProps extends Omit<FontAwesomeIconProps, 'icon' | 'size'> {
  icon: IconDefinition;
  size?: keyof typeof SIZES;
}

export default function Icon({ icon, size = 'md', className = '', ...rest }: IconProps) {
  return (
    <FontAwesomeIcon
      icon={icon}
      aria-hidden
      className={`${SIZES[size]} ${className}`}
      {...rest}
    />
  );
}
