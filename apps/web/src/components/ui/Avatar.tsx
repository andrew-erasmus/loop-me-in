import type { User } from '@date-calendar/core';

/** First initial, or the first letter of the email if the name is unhelpful. */
function initial(user: Pick<User, 'name' | 'email'>): string {
  return (user.name.trim()[0] ?? user.email[0] ?? '?').toUpperCase();
}

interface AvatarProps {
  user: Pick<User, 'name' | 'email' | 'avatarUrl' | 'color'>;
  size?: 'xs' | 'sm' | 'md';
  /** Dim it, for a person whose events are filtered out. */
  muted?: boolean;
}

const SIZES = {
  xs: 'h-5 w-5 text-[10px]',
  sm: 'h-7 w-7 text-xs',
  md: 'h-9 w-9 text-sm',
} as const;

/**
 * A person, as a coloured disc. Their Google picture when there is one, their
 * initial in their space colour when there isn't — the colour is the same one
 * that marks their events on the grid, so the two read as the same person.
 */
export default function Avatar({ user, size = 'sm', muted = false }: AvatarProps) {
  const className = `${SIZES[size]} shrink-0 rounded-full ring-2 ring-white transition ${
    muted ? 'opacity-40 grayscale' : ''
  }`;

  // Bricolage on an initial reads as a monogram rather than a letter dropped in
  // a circle, which is most of what makes an avatar look deliberate.
  const glyph = 'font-display font-extrabold tracking-tight';

  if (user.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt={user.name}
        title={user.name}
        className={`${className} object-cover`}
        // A Google avatar URL can 404 once the account changes its picture;
        // falling back to the initial beats a broken-image glyph.
        onError={(event) => {
          event.currentTarget.style.display = 'none';
        }}
      />
    );
  }

  return (
    <span
      title={user.name}
      aria-label={user.name}
      className={`${className} ${glyph} inline-flex items-center justify-center text-white`}
      style={{ backgroundColor: user.color }}
    >
      {initial(user)}
    </span>
  );
}
