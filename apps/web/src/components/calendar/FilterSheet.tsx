import { faMagnifyingGlass, faPlus, faXmark } from '@fortawesome/free-solid-svg-icons';
import type { Category, User } from '@date-calendar/core';
import Avatar from '../ui/Avatar.js';
import Icon from '../ui/Icon.js';
import Modal from '../ui/Modal.js';

interface FilterSheetProps {
  categories: Category[];
  hiddenCategoryIds: ReadonlySet<string>;
  onToggleCategory: (categoryId: string) => void;
  members: User[];
  hiddenUserIds: ReadonlySet<string>;
  onTogglePerson: (userId: string) => void;
  query: string;
  onQueryChange: (query: string) => void;
  /** Resets every filter at once — the way back to "show me everything". */
  onClearAll: () => void;
  /** Opens the category manager, where categories are added and renamed. */
  onManageCategories: () => void;
  onClose: () => void;
  /** How many events survive the current filters, and how many there were. */
  matchCount: number;
  totalCount: number;
}

/**
 * Filtering, as a sheet.
 *
 * The desktop legend (`CategoryFilterBar`) is a permanent strip because there
 * is width to spare for it; a phone has none, so the same three axes — what it
 * is, whose it is, and what it's called — live behind the button in
 * `MobileCalendarBar` instead. The count line at the bottom is the honest
 * feedback a filter needs: it's how you tell an empty week from a week you
 * have filtered into emptiness.
 */
export default function FilterSheet({
  categories,
  hiddenCategoryIds,
  onToggleCategory,
  members,
  hiddenUserIds,
  onTogglePerson,
  query,
  onQueryChange,
  onClearAll,
  onManageCategories,
  onClose,
  matchCount,
  totalCount,
}: FilterSheetProps) {
  const hasFilters =
    hiddenCategoryIds.size > 0 || hiddenUserIds.size > 0 || query.trim() !== '';

  return (
    <Modal title="Filter events" onClose={onClose}>
      <div className="space-y-5 px-5 py-4">
        <div>
          <label
            htmlFor="filter-search"
            className="mb-1.5 block text-[10px] font-bold tracking-[0.12em] text-moss-400 uppercase"
          >
            Search
          </label>
          <div className="relative">
            <Icon
              icon={faMagnifyingGlass}
              size="sm"
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-moss-400"
            />
            <input
              id="filter-search"
              type="search"
              value={query}
              onChange={(changeEvent) => onQueryChange(changeEvent.target.value)}
              placeholder="Title or notes"
              autoComplete="off"
              className="w-full rounded-lg border border-moss-300 py-2.5 pr-9 pl-9 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
            {query !== '' && (
              <button
                type="button"
                onClick={() => onQueryChange('')}
                aria-label="Clear search"
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1.5 text-moss-400 transition hover:bg-moss-100 hover:text-moss-700"
              >
                <Icon icon={faXmark} size="sm" />
              </button>
            )}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-bold tracking-[0.12em] text-moss-400 uppercase">
              Categories
            </span>
            {/* Adding a category used to mean finding it behind the avatars in
                the space sheet. It belongs here too: the moment you notice a
                category is missing is the moment you are looking at the list
                of them. */}
            <button
              type="button"
              onClick={onManageCategories}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-primary transition hover:bg-moss-100"
            >
              <Icon icon={faPlus} size="xs" />
              New category
            </button>
          </div>

          {categories.length === 0 ? (
            <p className="rounded-lg bg-moss-50 px-3 py-3 text-sm text-moss-500">
              No categories yet — add one to start colouring your events.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => {
                const hidden = hiddenCategoryIds.has(category.id);
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => onToggleCategory(category.id)}
                    aria-pressed={!hidden}
                    className={`flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition ${
                      hidden
                        ? 'bg-white text-moss-400 ring-1 ring-moss-200'
                        : 'bg-moss-100 text-moss-800'
                    }`}
                  >
                    <span
                      aria-hidden
                      className="h-3 w-3 rounded-full border-2 transition"
                      style={{
                        backgroundColor: hidden ? 'transparent' : category.color,
                        borderColor: category.color,
                      }}
                    />
                    <span className={hidden ? 'line-through' : undefined}>
                      {category.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* One person in the space means there is nothing to filter between. */}
        {members.length > 1 && (
          <div>
            <span className="mb-2 block text-[10px] font-bold tracking-[0.12em] text-moss-400 uppercase">
              Who
            </span>
            <div className="flex flex-wrap gap-2">
              {members.map((member) => {
                const hidden = hiddenUserIds.has(member.id);
                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => onTogglePerson(member.id)}
                    aria-pressed={!hidden}
                    className={`flex items-center gap-2 rounded-full py-1.5 pr-3 pl-1.5 text-sm font-semibold transition ${
                      hidden
                        ? 'bg-white text-moss-400 ring-1 ring-moss-200'
                        : 'bg-moss-100 text-moss-800'
                    }`}
                  >
                    <Avatar user={member} size="sm" muted={hidden} />
                    <span className={hidden ? 'line-through' : undefined}>
                      {member.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-moss-100 px-5 py-4">
        <p className="text-sm text-moss-500">
          {hasFilters ? (
            <>
              Showing{' '}
              <span className="font-semibold text-moss-800 tabular-nums">{matchCount}</span>{' '}
              of <span className="tabular-nums">{totalCount}</span>
            </>
          ) : (
            <>
              <span className="tabular-nums">{totalCount}</span>{' '}
              {totalCount === 1 ? 'event' : 'events'} this period
            </>
          )}
        </p>

        <div className="flex items-center gap-2">
          {hasFilters && (
            <button
              type="button"
              onClick={onClearAll}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-moss-600 transition hover:bg-moss-100"
            >
              Clear all
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-pressed"
          >
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}
