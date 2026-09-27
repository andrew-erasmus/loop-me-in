import { formatPeriodLabel, type DatedView } from '@date-calendar/core';
import { faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import Icon from '../ui/Icon.js';

/** The dated views that fit a phone screen — Week is RN's call, not ours. */
const MOBILE_VIEWS = ['month', 'day', 'agenda'] as const;
export type MobileCalendarView = (typeof MOBILE_VIEWS)[number];

const LABELS: Record<MobileCalendarView, string> = {
  month: 'Month',
  day: 'Day',
  agenda: 'Agenda',
};

/**
 * The phone-width calendar sub-header: a period control and a Month/Day/
 * Agenda switcher. Mirrors RN's `CalendarScreen` `bar` + `switcher` — same
 * three views, same reason Week is missing (seven columns is too narrow to
 * tap reliably).
 */
export default function MobileCalendarBar({
  anchorDate,
  view,
  onNavigate,
  onToday,
  onViewChange,
}: {
  anchorDate: Date;
  // Only ever a dated calendar view in practice — this bar is rendered only
  // while the Calendar tab is active, never for Lists/Memories.
  view: DatedView;
  onNavigate: (direction: 1 | -1) => void;
  onToday: () => void;
  onViewChange: (view: MobileCalendarView) => void;
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

      <div
        className="mx-4 mb-3 flex items-center gap-0.5 rounded-xl bg-moss-100 p-1"
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
            className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              view === option
                ? 'bg-white text-primary shadow-sm ring-1 ring-moss-950/5'
                : 'text-moss-500'
            }`}
          >
            {LABELS[option]}
          </button>
        ))}
      </div>
    </div>
  );
}
