import { faArrowsRotate, faChevronDown } from '@fortawesome/free-solid-svg-icons';
import type { Me } from '@date-calendar/core';
import Avatar from '../ui/Avatar.js';
import Icon from '../ui/Icon.js';

/**
 * The phone-width header: space name and the people in it, nothing else.
 *
 * Mirrors the RN app's `Shell` header exactly — Categories and Sign out live
 * in the space sheet instead of up here, the same trade RN already made by
 * not having a header control for them at all.
 */
export default function MobileHeader({
  me,
  onManageSpace,
  onRefresh,
  isFetching,
}: {
  me: Me;
  onManageSpace: () => void;
  onRefresh: () => void;
  isFetching: boolean;
}) {
  return (
    <header
      // The status bar is drawn *over* the page in standalone/installed PWA
      // mode on iOS (that's what `black-translucent` means) rather than
      // pushing content down like a normal browser tab bar does — without
      // this, the clock/notch sits on top of the title and avatars instead
      // of above them.
      className="flex items-center justify-between gap-2 border-b border-moss-200/80 bg-white px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] md:hidden"
    >
      <h1 className="display min-w-0 flex-1 truncate text-xl text-moss-950">{me.space.name}</h1>

      <button
        type="button"
        onClick={onRefresh}
        disabled={isFetching}
        aria-label="Refresh"
        title="Refresh"
        className="shrink-0 rounded-lg p-2 text-moss-400 transition hover:bg-moss-100 hover:text-moss-700 disabled:opacity-50"
      >
        <Icon icon={faArrowsRotate} size="sm" className={isFetching ? 'animate-spin' : ''} />
      </button>

      <button
        type="button"
        onClick={onManageSpace}
        aria-label="Your calendars and who is in them"
        className="flex shrink-0 items-center gap-2 rounded-lg py-1 pl-2"
      >
        <span className="flex -space-x-2">
          {me.members.map((member) => (
            <Avatar key={member.id} user={member} size="md" />
          ))}
        </span>
        <Icon icon={faChevronDown} size="xs" className="text-moss-400" />
      </button>
    </header>
  );
}
