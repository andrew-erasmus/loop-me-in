import type { Category, User } from '@date-calendar/core';
import Avatar from '../ui/Avatar.js';

interface CategoryFilterBarProps {
  categories: Category[];
  hiddenCategoryIds: ReadonlySet<string>;
  onToggle: (categoryId: string) => void;
  members: User[];
  hiddenUserIds: ReadonlySet<string>;
  onTogglePerson: (userId: string) => void;
}

/**
 * The colour legend, doubling as a visibility filter.
 *
 * Two independent axes over the same events — what it is, and whose it is —
 * built from the same chip so they read as one control rather than two
 * different ideas. The people row appears only once there is more than one
 * person to filter between.
 */
export default function CategoryFilterBar({
  categories,
  hiddenCategoryIds,
  onToggle,
  members,
  hiddenUserIds,
  onTogglePerson,
}: CategoryFilterBarProps) {
  if (categories.length === 0 && members.length < 2) return null;

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
    </div>
  );
}
