import { formatPeriodLabel, type DatedView } from '@date-calendar/core';
import { faChevronLeft, faChevronRight, faSliders } from '@fortawesome/free-solid-svg-icons';
import Icon from '../ui/Icon.js';

/**
 * The dated views offered at phone width.
 *
 * The hour grid appears here as `3day`, not `week`: seven columns on a 390pt
 * screen come out at about 45pt each, which is too compressed to read a title
 * in. Three columns are legible, and because `3day` pages three days at a
 * time the rest of the week is one tap away rather than lost. Desktop keeps
 * the full week, where the width is there for it.
 */
const MOBILE_VIEWS = ['month', '3day', 'day', 'agenda'] as const;
export type MobileCalendarView = (typeof MOBILE_VIEWS)[number];

const LABELS: Record<MobileCalendarView, string> = {
  month: 'Month',
  '3day': '3 days',
  day: 'Day',
  agenda: 'Agenda',
};

/**
 * The phone-width calendar sub-header: a period control, the view switcher,
 * and the way into filters.
 *
 * Filters live behind a button rather than in a bar of their own, the way the
 * desktop legend does — categories and people wrap to two or three rows once
 * there are a few of each, which is a lot of a phone screen spent on chrome
 * that is mostly idle. The badge is what keeps a filter from being invisible
 * while it's hiding things.
 */
export default function MobileCalendarBar({
  anchorDate,
  view,
  onNavigate,
  onToday,
  onViewChange,
  onOpenFilters,
  activeFilterCount,
}: {
  anchorDate: Date;
  // Only ever a dated calendar view in practice — this bar is rendered only
  // while the Calendar tab is active, never for Lists/Memories.
  view: DatedView;
  onNavigate: (direction: 1 | -1) => void;
  onToday: () => void;
  onViewChange: (view: MobileCalendarView) => void;
  onOpenFilters: () => void;
  /** How many filters are narrowing the calendar right now; 0 hides the badge. */
  activeFilterCount: number;
}) {
  return (
    <div className="border-b border-moss-200/80 bg-white md:hidden">
      <div className="flex items-center gap-1 px-2 py-2">
        <button
          type="button"
          onClick={() => onNavigate(-1)}
          aria-label="Previous period"
          className="rounded-md p-2 text-moss-500 transition hover:bg-moss-100"
        >
          <Icon icon={faChevronLeft} size="md" />
        </button>

        <button
          type="button"
          onClick={onToday}
          aria-label="Jump to today"
          className="flex-1 truncate py-1 text-center text-base font-semibold text-moss-950"
        >
          {formatPeriodLabel(anchorDate, view)}
        </button>

        <button
          type="button"
          onClick={() => onNavigate(1)}
          aria-label="Next period"
          className="rounded-md p-2 text-moss-500 transition hover:bg-moss-100"
        >
          <Icon icon={faChevronRight} size="md" />
        </button>
      </div>

      <div className="mx-3 mb-3 flex items-center gap-2">
        <div
          className="flex min-w-0 flex-1 items-center gap-0.5 rounded-xl bg-moss-100 p-1"
          role="tablist"
          aria-label="Calendar view"
        >
          {MOBILE_VIEWS.map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={view === option}
              onClick={() => onViewChange(option)}
              className={`min-w-0 flex-1 rounded-lg px-1.5 py-1.5 text-sm font-semibold transition ${
                view === option
                  ? 'bg-white text-primary shadow-sm ring-1 ring-moss-950/5'
                  : 'text-moss-500'
              }`}
            >
              {LABELS[option]}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onOpenFilters}
          aria-label={
            activeFilterCount > 0
              ? `Filters — ${activeFilterCount} active`
              : 'Filter events'
          }
          className={`relative shrink-0 rounded-xl p-2.5 transition ${
            activeFilterCount > 0
              ? 'bg-primary text-white'
              : 'bg-moss-100 text-moss-600'
          }`}
        >
          <Icon icon={faSliders} size="md" />
          {activeFilterCount > 0 && (
            <span
              aria-hidden
              className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-moss-950 px-1 text-[10px] font-bold text-white ring-2 ring-white"
            >
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
