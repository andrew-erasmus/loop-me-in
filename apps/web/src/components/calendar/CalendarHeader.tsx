import {
  CALENDAR_VIEWS,
  formatPeriodLabel,
  isDatedView,
  type CalendarView,
  type Me,
} from '@date-calendar/core';
import {
  faArrowsRotate,
  faChevronDown,
  faChevronLeft,
  faChevronRight,
} from '@fortawesome/free-solid-svg-icons';
import Avatar from '../ui/Avatar.js';
import Icon from '../ui/Icon.js';

const VIEW_LABELS: Record<CalendarView, string> = {
  month: 'Month',
  week: 'Week',
  day: 'Day',
  agenda: 'Agenda',
  lists: 'Lists',
  memories: 'Memories',
};

/** Keyboard hint shown in each view button's tooltip. */
const VIEW_KEYS: Record<CalendarView, string> = {
  month: 'M',
  week: 'W',
  day: 'D',
  agenda: 'A',
  lists: 'L',
  memories: 'Y',
};

interface CalendarHeaderProps {
  anchorDate: Date;
  view: CalendarView;
  me: Me;
  onViewChange: (view: CalendarView) => void;
  onNavigate: (direction: 1 | -1) => void;
  onToday: () => void;
  onNewEvent: () => void;
  onManageCategories: () => void;
  /** Opens the spaces / people / invite dialog. */
  onManageSpace: () => void;
  onSignOut: () => void;
  onRefresh: () => void;
  isFetching: boolean;
}

export default function CalendarHeader({
  anchorDate,
  view,
  me,
  onViewChange,
  onNavigate,
  onToday,
  onNewEvent,
  onManageCategories,
  onManageSpace,
  onSignOut,
  onRefresh,
  isFetching,
}: CalendarHeaderProps) {
  // The lists screen has no period, so the date controls would have nothing to
  // act on. Hiding them beats showing controls that do nothing.
  const dated = isDatedView(view);

  return (
    <header className="hidden flex-wrap items-center gap-3 border-b border-moss-200/80 bg-white px-5 py-3.5 md:flex">
      {dated ? (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onNavigate(-1)}
            aria-label="Previous period"
            title="Previous (←)"
            className="rounded-md px-2 py-1.5 text-moss-500 transition hover:bg-moss-100 hover:text-moss-900"
          >
            <Icon icon={faChevronLeft} size="sm" />
          </button>
          <button
            type="button"
            onClick={() => onNavigate(1)}
            aria-label="Next period"
            title="Next (→)"
            className="rounded-md px-2 py-1.5 text-moss-500 transition hover:bg-moss-100 hover:text-moss-900"
          >
            <Icon icon={faChevronRight} size="sm" />
          </button>
          <button
            type="button"
            onClick={onToday}
            title="Jump to today (T)"
            className="ml-1 rounded-md border border-moss-200 px-3 py-1.5 text-sm font-medium text-moss-700 transition hover:bg-moss-100"
          >
            Today
          </button>
        </div>
      ) : null}

      <h1 className="display min-w-0 flex-1 text-2xl leading-none text-moss-950 sm:text-[1.75rem]">
        {dated ? formatPeriodLabel(anchorDate, view) : me.space.name}
        {/* A quiet dot rather than a spinner — background refetches shouldn't
            pull the eye away from the grid. */}
        <span
          aria-hidden
          className={`ml-2 inline-block h-1.5 w-1.5 rounded-full bg-moss-400 align-middle transition-opacity ${
            isFetching ? 'opacity-100' : 'opacity-0'
          }`}
        />
      </h1>

      <div
        className="flex items-center gap-0.5 rounded-xl bg-moss-100 p-1"
        role="tablist"
        aria-label="Calendar view"
      >
        {CALENDAR_VIEWS.map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={view === option}
            title={`${VIEW_LABELS[option]} view (${VIEW_KEYS[option]})`}
            onClick={() => onViewChange(option)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              view === option
                ? 'bg-white text-primary shadow-sm ring-1 ring-moss-950/5'
                : 'text-moss-500 hover:text-moss-900'
            }`}
          >
            {VIEW_LABELS[option]}
          </button>
        ))}
      </div>

      {dated && (
        <>
          <button
            type="button"
            onClick={onManageCategories}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold text-moss-600 transition hover:bg-moss-100 hover:text-moss-950"
          >
            Categories
          </button>

          <button
            type="button"
            onClick={onNewEvent}
            title="New event (N)"
            className="rounded-lg bg-primary px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-primary-pressed"
          >
            New event
          </button>
        </>
      )}

      <div className="flex items-center gap-2 border-l border-moss-200 pl-3">
        <button
          type="button"
          onClick={onRefresh}
          disabled={isFetching}
          aria-label="Refresh"
          title="Refresh"
          className="rounded-lg p-2 text-moss-400 transition hover:bg-moss-100 hover:text-moss-700 disabled:opacity-50"
        >
          <Icon icon={faArrowsRotate} size="sm" className={isFetching ? 'animate-spin' : ''} />
        </button>

        {/* The avatars are the control: who is in this calendar is the same
            question as which calendar this is, so tapping the people opens the
            place where you switch space, invite and remove. */}
        <button
          type="button"
          onClick={onManageSpace}
          title={`${me.space.name} — ${me.members.map((m) => m.name).join(', ')}`}
          aria-label="Your calendars and who is in them"
          className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition hover:bg-moss-100"
        >
          <span className="flex -space-x-2">
            {me.members.map((member) => (
              <Avatar key={member.id} user={member} size="md" />
            ))}
          </span>
          <Icon icon={faChevronDown} size="xs" className="text-moss-400" />
        </button>

        {/* One person in the space means the calendar isn't shared with anyone
            yet, which is the moment inviting is worth putting in front of them
            rather than leaving it a click deep. */}
        {me.members.length === 1 && (
          <button
            type="button"
            onClick={onManageSpace}
            className="rounded-lg bg-primary px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-primary-pressed"
          >
            Invite
          </button>
        )}

        <button
          type="button"
          onClick={onSignOut}
          title={`Signed in as ${me.user.email}`}
          className="rounded-lg px-2 py-1.5 text-sm font-medium text-moss-400 transition hover:bg-moss-100 hover:text-moss-900"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}

