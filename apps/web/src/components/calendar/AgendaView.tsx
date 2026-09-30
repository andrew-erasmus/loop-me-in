import { useMemo } from 'react';
import { faFilterCircleXmark, faSun } from '@fortawesome/free-solid-svg-icons';
import {
  dayKey,
  eventColor,
  format,
  getMonthGrid,
  groupByDay,
  isSameDay,
  type CalendarEvent,
  type Category,
} from '@date-calendar/core';
import {
  chipListEmoji,
  chipStatusIcon,
  chipTooltip,
  type EventDecoration,
} from '../../lib/decorations.js';
import Icon from '../ui/Icon.js';

interface AgendaViewProps {
  anchorDate: Date;
  today: Date;
  events: CalendarEvent[];
  categories: Map<string, Category>;
  decorations: Map<string, EventDecoration>;
  onSelectEvent: (event: CalendarEvent) => void;
  /**
   * True when the month does have events but a filter is hiding all of them —
   * so the empty state can say which kind of empty this is. Not simply "a
   * filter is on": a genuinely empty month is still a clear month.
   */
  isFiltered?: boolean;
  onClearFilters?: () => void;
}

/**
 * A flat chronological list of everything in the current month's window.
 * Empty days are skipped entirely — that is the point of an agenda.
 */
export default function AgendaView({
  anchorDate,
  today,
  events,
  categories,
  decorations,
  onSelectEvent,
  isFiltered = false,
  onClearFilters,
}: AgendaViewProps) {
  const days = useMemo(() => {
    const byDay = groupByDay(events);
    // Walk the same window the month grid shows, so Agenda and Month always
    // agree about which events belong to the current period.
    return getMonthGrid(anchorDate, today)
      .flat()
      .filter((day) => day.inMonth)
      .map((day) => ({ day, events: byDay.get(day.key) ?? [] }))
      .filter((entry) => entry.events.length > 0);
  }, [anchorDate, today, events]);

  if (days.length === 0) {
    // "Nothing scheduled" and "nothing left after filtering" look identical on
    // screen and are entirely different facts — saying the wrong one sends
    // someone looking for an event that was there all along.
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <Icon
          icon={isFiltered ? faFilterCircleXmark : faSun}
          size="lg"
          className="mx-auto h-10 w-10 text-moss-300"
        />
        {isFiltered ? (
          <>
            <p className="display text-xl text-moss-950">Nothing matches</p>
            <p className="max-w-xs text-sm text-moss-400">
              This month has events, but none of them get past the filters you
              have on.
            </p>
            {onClearFilters && (
              <button
                type="button"
                onClick={onClearFilters}
                className="mt-1 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-pressed"
              >
                Clear filters
              </button>
            )}
          </>
        ) : (
          <>
            <p className="display text-xl text-moss-950">A clear month</p>
            <p className="max-w-xs text-sm text-moss-400">
              Nothing scheduled yet. Press <Key>N</Key> to add something, or{' '}
              <Key>L</Key> to see what you have been meaning to do.
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="scroll-slim h-full overflow-y-auto bg-white">
      <ol className="mx-auto max-w-3xl divide-y divide-moss-100 px-4 py-2">
        {days.map(({ day, events: dayEvents }) => (
          <li key={day.key} className="flex gap-4 py-3">
            <div className="w-16 shrink-0 text-right">
              <div
                className={`text-xs font-medium uppercase ${
                  day.isToday ? 'text-moss-950' : 'text-moss-400'
                }`}
              >
                {format(day.date, 'EEE')}
              </div>
              <div
                className={`text-xl font-semibold tabular-nums ${
                  day.isToday ? 'text-moss-950' : 'text-moss-800'
                }`}
              >
                {day.dayOfMonth}
              </div>
              {isSameDay(day.date, today) && (
                <div className="text-[10px] font-bold tracking-[0.12em] text-moss-950 uppercase">
                  Today
                </div>
              )}
            </div>

            <ul className="min-w-0 flex-1 space-y-1">
              {dayEvents.map((event) => (
                <li key={`${dayKey(day.date)}-${event.id}`}>
                  <button
                    type="button"
                    onClick={() => onSelectEvent(event)}
                    title={`${event.title}${chipTooltip(decorations.get(event.id))}`}
                    className="flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-moss-50"
                    style={
                      decorations.get(event.id)?.personColor
                        ? {
                            boxShadow: `inset 3px 0 0 0 ${decorations.get(event.id)!.personColor}`,
                          }
                        : undefined
                    }
                  >
                    <span
                      aria-hidden
                      className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: eventColor(event, categories) }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 truncate font-medium text-moss-800">
                        {chipStatusIcon(decorations.get(event.id)) && (
                          <Icon icon={chipStatusIcon(decorations.get(event.id))!} size="xs" className="shrink-0" />
                        )}
                        {chipListEmoji(decorations.get(event.id)) && (
                          <span aria-hidden>{chipListEmoji(decorations.get(event.id))}</span>
                        )}
                        <span className="truncate">{event.title}</span>
                      </span>
                      {event.notes && (
                        <span className="mt-0.5 block truncate text-xs text-moss-500">
                          {event.notes}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-moss-500">
                      {event.allDay
                        ? 'All day'
                        : `${format(new Date(event.startsAt), 'HH:mm')} – ${format(
                            new Date(event.endsAt),
                            'HH:mm',
                          )}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** A keyboard key, rendered as one. */
function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-moss-200 bg-moss-50 px-1.5 py-0.5 font-sans text-[11px] font-semibold text-moss-600">
      {children}
    </kbd>
  );
}
