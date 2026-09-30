import { faMagnifyingGlass, faXmark } from '@fortawesome/free-solid-svg-icons';
import type { Category, User } from '@date-calendar/core';
import Avatar from '../ui/Avatar.js';
import Icon from '../ui/Icon.js';

interface CategoryFilterBarProps {
  categories: Category[];
  hiddenCategoryIds: ReadonlySet<string>;
  onToggle: (categoryId: string) => void;
  members: User[];
  hiddenUserIds: ReadonlySet<string>;
  onTogglePerson: (userId: string) => void;
  query: string;
  onQueryChange: (query: string) => void;
}

/**
 * The colour legend, doubling as a visibility filter.
 *
 * Three independent axes over the same events — what it is, whose it is, and
 * what it's called — built from the same chip so they read as one control
 * rather than three different ideas. The people row appears only once there is
 * more than one person to filter between. The phone shows the same three axes
 * in `FilterSheet` instead, where there is no width for a permanent strip.
 */
export default function CategoryFilterBar({
  categories,
  hiddenCategoryIds,
  onToggle,
  members,
  hiddenUserIds,
  onTogglePerson,
  query,
  onQueryChange,
}: CategoryFilterBarProps) {
  return (
    <div className="hidden flex-wrap items-center gap-1.5 border-b border-moss-200/80 bg-white px-5 py-2.5 md:flex">
      {categories.length > 0 && (
        <>
          <span className="mr-1.5 text-[10px] font-bold tracking-[0.12em] text-moss-400 uppercase">
            Categories
          </span>
          {categories.map((category) => {
            const hidden = hiddenCategoryIds.has(category.id);
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => onToggle(category.id)}
                aria-pressed={!hidden}
                title={hidden ? `Show ${category.name}` : `Hide ${category.name}`}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                  hidden
                    ? 'bg-transparent text-moss-300 hover:bg-moss-50'
                    : 'bg-moss-100 text-moss-800 hover:bg-moss-200'
                }`}
              >
                <span
                  aria-hidden
                  className="h-2 w-2 rounded-full border-2 transition"
                  style={{
                    backgroundColor: hidden ? 'transparent' : category.color,
                    borderColor: category.color,
                  }}
                />
                <span className={hidden ? 'line-through' : undefined}>{category.name}</span>
              </button>
            );
          })}
        </>
      )}

      {members.length > 1 && (
        <>
          <span className="mr-1.5 ml-3 text-[10px] font-bold tracking-[0.12em] text-moss-400 uppercase">
            Who
          </span>
          {members.map((member) => {
            const hidden = hiddenUserIds.has(member.id);
            return (
              <button
                key={member.id}
                type="button"
                onClick={() => onTogglePerson(member.id)}
                aria-pressed={!hidden}
                title={hidden ? `Show ${member.name}'s events` : `Hide ${member.name}'s events`}
                className={`flex items-center gap-1.5 rounded-full py-0.5 pr-2.5 pl-0.5 text-xs font-semibold transition ${
                  hidden
                    ? 'bg-transparent text-moss-300 hover:bg-moss-50'
                    : 'bg-moss-100 text-moss-800 hover:bg-moss-200'
                }`}
              >
                <Avatar user={member} size="xs" muted={hidden} />
                <span className={hidden ? 'line-through' : undefined}>{member.name}</span>
              </button>
            );
          })}
        </>
      )}

      {/* Pushed to the trailing edge: it's a filter like the chips, but one you
          type into rather than toggle, so it sits apart from them. */}
      <div className="relative ml-auto">
        <Icon
          icon={faMagnifyingGlass}
          size="xs"
          className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-moss-400"
        />
        <input
          type="search"
          value={query}
          onChange={(changeEvent) => onQueryChange(changeEvent.target.value)}
          placeholder="Search events"
          aria-label="Search events"
          autoComplete="off"
          className="w-44 rounded-full border border-moss-200 bg-moss-50 py-1 pr-7 pl-7 text-xs outline-none transition focus:w-56 focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/15"
        />
        {query !== '' && (
          <button
            type="button"
            onClick={() => onQueryChange('')}
            aria-label="Clear search"
            className="absolute top-1/2 right-1 -translate-y-1/2 rounded-full p-1 text-moss-400 transition hover:bg-moss-200 hover:text-moss-700"
          >
            <Icon icon={faXmark} size="xs" />
          </button>
        )}
      </div>
    </div>
  );
}
