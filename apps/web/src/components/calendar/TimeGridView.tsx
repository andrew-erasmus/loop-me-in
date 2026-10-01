import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  THREE_DAY_SPAN,
  eventColor,
  eventsOnDay,
  format,
  fractionOfDay,
  getHourSlots,
  isSameDay,
  layoutDayEvents,
  layoutDaySegments,
  type CalendarDay,
  type CalendarEvent,
  type Category,
  type EventTimes,
} from '@date-calendar/core';
import { useEventDrag, type DragState } from '../../hooks/useEventDrag.js';
import { chipListEmoji, chipStatusIcon, chipTooltip, type EventDecoration } from '../../lib/decorations.js';
import Icon from '../ui/Icon.js';

/** Pixel height of one hour row. The only place fractions become pixels. */
const HOUR_HEIGHT = 48;
const DAY_HEIGHT = HOUR_HEIGHT * 24;

interface TimeGridViewProps {
  days: CalendarDay[];
  today: Date;
  events: CalendarEvent[];
  categories: Map<string, Category>;
  decorations: Map<string, EventDecoration>;
  onSelectEvent: (event: CalendarEvent) => void;
  onSelectSlot: (start: Date) => void;
  onMoveEvent: (eventId: string, times: EventTimes) => void;
  /**
   * Jump to a single day. Wired to the column headings in any multi-day span,
   * where a phone-width column has less room than an event may need — the
   * heading is the way out to the full-width Day view.
   */
  onShowDay?: (day: Date) => void;
}

/**
 * The hour-by-hour grid behind the Week, 3-day and Day views — they differ
 * only in how many day columns they render.
 *
 * Event geometry comes from `layoutDayEvents` in the shared core as fractions
 * of a day; this component multiplies those by HOUR_HEIGHT. Keeping the maths
 * in fractions is what keeps the layout code free of pixels.
 */
export default function TimeGridView({
  days,
  today,
  events,
  categories,
  decorations,
  onSelectEvent,
  onSelectSlot,
  onMoveEvent,
  onShowDay,
}: TimeGridViewProps) {
  // Week, 3 days and Day are the same grid with different column counts, and
  // each wants something different from a narrow screen.
  //
  // Any multi-day span makes its headings a way through to the full-width Day
  // view. Only a span wider than the phone's own `3day` has to give up the
  // in-block times as well — at three columns they still fit, which is the
  // whole reason the phone shows three rather than seven.
  const isMultiDay = days.length > 1;
  const isDense = days.length > THREE_DAY_SPAN;

  const hours = useMemo(() => getHourSlots(), []);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasScrolled = useRef(false);
  const columnRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Open on the working day rather than at midnight, but only once — later
  // renders must not yank the user back up the grid.
  useEffect(() => {
    if (hasScrolled.current || !scrollRef.current) return;
    scrollRef.current.scrollTop = 7.5 * HOUR_HEIGHT;
    hasScrolled.current = true;
  }, []);

  const getColumnRects = useCallback(
    () =>
      columnRefs.current
        .filter((node): node is HTMLDivElement => node !== null)
        .map((node) => node.getBoundingClientRect()),
    [],
  );

  const { drag, begin, consumeClickSuppression } = useEventDrag({
    dayHeightPx: DAY_HEIGHT,
    getColumnRects,
    onCommit: onMoveEvent,
  });

  /**
   * The all-day band, as segments across the day columns rather than a chip per
   * column — a three-day holiday is one event and should read as one bar.
   *
   * `layoutDaySegments` takes any run of consecutive days, which is what lets
   * the band reuse the month grid's engine across its 7, 3 or 1 columns.
   * Timed events stay out of it: the hour grid below already clips those per
   * column and flags the cut with `continuesFromPreviousDay` / `IntoNextDay`,
   * which is the right reading when there is an hour axis to place them on.
   */
  const allDaySegments = useMemo(
    () => layoutDaySegments(events.filter((event) => event.allDay), days),
    [days, events],
  );

  const allDayLaneCount = allDaySegments.reduce(
    (most, segment) => Math.max(most, segment.lane + 1),
    0,
  );
  const hasAllDayRow = allDaySegments.length > 0;
  const showsToday = days.some((day) => isSameDay(day.date, today));

  /**
   * While a drag is in flight the dragged event is re-timed in place, so every
   * column re-lays-out around it and the preview lands exactly where the drop
   * will put it — no separate ghost element that could disagree with reality.
   */
  const previewEvents = useMemo(() => {
    if (!drag) return events;
    return events.map((event) =>
      event.id === drag.eventId ? { ...event, ...drag.preview } : event,
    );
  }, [events, drag]);

  return (
    <div
      className={`flex h-full min-h-0 flex-col bg-white ${
        drag ? 'cursor-grabbing select-none' : ''
      }`}
    >
      {/* Day headings */}
      <div className="flex border-b border-moss-200">
        <div className="w-11 shrink-0 border-r border-moss-200 md:w-14" />
        {days.map((day, index) => {
          const heading = (
            <>
              <div
                className={`text-[10px] font-bold tracking-[0.1em] uppercase ${
                  day.isToday ? 'text-moss-950' : 'text-moss-400'
                }`}
              >
                {format(day.date, 'EEE')}
              </div>
              <div
                className={`display mx-auto mt-1 flex h-8 w-8 items-center justify-center rounded-full text-base ${
                  day.isToday ? 'bg-primary text-white' : 'text-moss-800'
                }`}
              >
                {day.dayOfMonth}
              </div>
            </>
          );

          const cellClasses = `min-w-0 flex-1 border-r border-moss-200/70 px-0.5 pt-2 pb-2.5 text-center transition-colors last:border-r-0 md:px-2 ${
            drag?.dayIndex === index
              ? 'bg-moss-100'
              : day.isWeekend
                ? 'bg-moss-50/80'
                : ''
          }`;

          return isMultiDay && onShowDay ? (
            <button
              key={day.key}
              type="button"
              onClick={() => onShowDay(day.date)}
              aria-label={`Show ${format(day.date, 'EEEE d MMMM')}`}
              className={`${cellClasses} cursor-pointer hover:bg-moss-100/70`}
            >
              {heading}
            </button>
          ) : (
            <div key={day.key} className={cellClasses}>
              {heading}
            </div>
          );
        })}
      </div>

      {/* All-day band, only rendered when something is in it */}
      {hasAllDayRow && (
        <div className="flex border-b border-moss-200 bg-moss-50/60">
          <div className="flex w-11 shrink-0 items-center justify-end border-r border-moss-200 pr-1.5 text-[10px] font-medium text-moss-400 md:w-14 md:pr-2 md:text-[11px]">
            All day
          </div>
          <div
            className="grid min-w-0 flex-1 gap-y-0.5 py-1"
            style={{
              gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${allDayLaneCount}, auto)`,
            }}
          >
            {/* Column hairlines, behind the bars so one can cross them. */}
            {days.map((day, index) => (
              <div
                key={day.key}
                aria-hidden
                style={{ gridColumn: index + 1, gridRow: '1 / -1' }}
                className="border-r border-moss-200 last:border-r-0"
              />
            ))}

            {allDaySegments.map((segment) => {
              const decoration = decorations.get(segment.event.id);
              return (
                <div
                  key={segment.event.id}
                  style={{
                    gridColumn: `${segment.startColumn + 1} / span ${segment.span}`,
                    gridRow: segment.lane + 1,
                  }}
                  className="min-w-0 px-1"
                >
                  <button
                    type="button"
                    data-event-id={segment.event.id}
                    onClick={() => onSelectEvent(segment.event)}
                    title={`${segment.event.title}${chipTooltip(decoration)}`}
                    className="flex w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium text-white"
                    style={{
                      backgroundColor: eventColor(segment.event, categories),
                      // The owner's accent goes on a leading edge only when the
                      // event really starts here, not where it was clipped.
                      ...(decoration?.personColor && !segment.continuesBefore
                        ? { boxShadow: `inset 2px 0 0 0 ${decoration.personColor}` }
                        : {}),
                      // A clipped bar shouldn't look like it starts or ends here.
                      borderTopLeftRadius: segment.continuesBefore ? 0 : undefined,
                      borderBottomLeftRadius: segment.continuesBefore ? 0 : undefined,
                      borderTopRightRadius: segment.continuesAfter ? 0 : undefined,
                      borderBottomRightRadius: segment.continuesAfter ? 0 : undefined,
                    }}
                  >
                    {chipStatusIcon(decoration) && (
                      <Icon
                        icon={chipStatusIcon(decoration)!}
                        size="xs"
                        className="shrink-0 text-white"
                      />
                    )}
                    {chipListEmoji(decoration) && (
                      <span aria-hidden>{chipListEmoji(decoration)}</span>
                    )}
                    <span className="truncate">{segment.event.title}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Scrolling hour grid */}
      <div ref={scrollRef} className="scroll-slim min-h-0 flex-1 overflow-y-auto">
        <div className="flex" style={{ height: DAY_HEIGHT }}>
          {/* Hour gutter */}
          <div className="w-11 shrink-0 border-r border-moss-200 md:w-14">
            {hours.map((slot) => (
              <div
                key={slot.hour}
                style={{ height: HOUR_HEIGHT }}
                className="relative border-b border-moss-100"
              >
                <span className="absolute -top-2 right-1.5 text-[10px] font-medium tabular-nums text-moss-400 md:right-2">
                  {slot.hour === 0 ? '' : slot.label}
                </span>
              </div>
            ))}
          </div>

          {days.map((day, index) => (
            <DayColumn
              key={day.key}
              ref={(node) => {
                columnRefs.current[index] = node;
              }}
              day={day}
              dayIndex={index}
              today={today}
              showsToday={showsToday}
              isDense={isDense}
              events={previewEvents}
              categories={categories}
              decorations={decorations}
              hours={hours}
              drag={drag}
              onBeginDrag={begin}
              onSelectEvent={onSelectEvent}
              onSelectSlot={onSelectSlot}
              consumeClickSuppression={consumeClickSuppression}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function DayColumn({
  ref,
  day,
  dayIndex,
  today,
  showsToday,
  isDense,
  events,
  categories,
  decorations,
  hours,
  drag,
  onBeginDrag,
  onSelectEvent,
  onSelectSlot,
  consumeClickSuppression,
}: {
  ref: (node: HTMLDivElement | null) => void;
  day: CalendarDay;
  dayIndex: number;
  today: Date;
  showsToday: boolean;
  /** True in Week view: the column is a seventh of the width, not a third. */
  isDense: boolean;
  events: CalendarEvent[];
  categories: Map<string, Category>;
  decorations: Map<string, EventDecoration>;
  hours: { hour: number; label: string }[];
  drag: DragState | null;
  onBeginDrag: (args: {
    event: CalendarEvent;
    mode: 'move' | 'resize';
    pointerEvent: React.PointerEvent;
    dayIndex: number;
  }) => void;
  onSelectEvent: (event: CalendarEvent) => void;
  onSelectSlot: (start: Date) => void;
  consumeClickSuppression: () => boolean;
}) {
  const positioned = useMemo(
    () => layoutDayEvents(eventsOnDay(events, day.date), day.date),
    [events, day.date],
  );

  const isToday = showsToday && isSameDay(day.date, today);

  /**
   * How much of this column is already behind us: all of it for a day that has
   * been and gone, the part above "now" for today, none of it for the future.
   *
   * Drawn as one veil rather than by restyling each hour cell — it has to stop
   * partway down the current hour, which a per-cell background cannot do.
   */
  const spentFraction = isToday
    ? fractionOfDay(today)
    : day.date < today && !isSameDay(day.date, today)
      ? 1
      : 0;

  return (
    <div
      ref={ref}
      className={`relative min-w-0 flex-1 border-r border-moss-200/70 transition-colors last:border-r-0 ${
        drag?.dayIndex === dayIndex
          ? 'bg-moss-100/60'
          : day.isWeekend
            ? 'bg-moss-50/70'
            : ''
      }`}
    >
      {spentFraction > 0 && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-0 bg-moss-100/50"
          style={{ height: spentFraction * DAY_HEIGHT }}
        />
      )}
      {/* Clickable half-hour slots behind the events */}
      {hours.map((slot) => (
        <div key={slot.hour} style={{ height: HOUR_HEIGHT }} className="border-b border-moss-100/80">
          {[0, 30].map((minute) => (
            <div
              key={minute}
              onClick={() => {
                // A drag that ended over empty space must not also create an event.
                if (consumeClickSuppression()) return;
                const start = new Date(day.date);
                start.setHours(slot.hour, minute, 0, 0);
                onSelectSlot(start);
              }}
              style={{ height: HOUR_HEIGHT / 2 }}
              className="cursor-pointer transition hover:bg-moss-100/70"
            />
          ))}
        </div>
      ))}

      {isToday && <CurrentTimeIndicator today={today} />}

      {positioned.map((item) => {
        const color = eventColor(item.event, categories);
        const decoration = decorations.get(item.event.id);
        const widthPercent = 100 / item.columnCount;
        const isDragging = drag?.eventId === item.event.id;

        return (
          <div
            key={item.event.id}
            // Stable handle for tests and for hit-testing, so neither depends
            // on the element's tag or styling.
            data-event-id={item.event.id}
            onPointerDown={(pointerEvent) => {
              // Someone else's surprise is visible but immovable.
              if (decoration?.canEdit === false) return;
              onBeginDrag({
                event: item.event,
                mode: 'move',
                pointerEvent,
                dayIndex,
              });
            }}
            onClick={() => {
              if (consumeClickSuppression()) return;
              onSelectEvent(item.event);
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(keyEvent) => {
              if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
                keyEvent.preventDefault();
                onSelectEvent(item.event);
              }
            }}
            title={`${format(new Date(item.event.startsAt), 'HH:mm')}–${format(
              new Date(item.event.endsAt),
              'HH:mm',
            )}  ${item.event.title}${chipTooltip(decoration)}`}
            className={`group absolute touch-none overflow-hidden rounded-md border-l-[3px] px-1 py-0.5 text-left text-[11px] leading-tight shadow-sm transition-shadow md:px-1.5 ${
              decoration?.canEdit === false
                ? 'cursor-pointer hover:z-10 hover:shadow-md'
                : isDragging
                  ? 'z-30 cursor-grabbing opacity-90 shadow-lg ring-2 ring-moss-900'
                  : 'cursor-grab hover:z-10 hover:shadow-md'
            }`}
            style={{
              // Fractions from the shared core, turned into pixels/percentages here.
              top: item.top * DAY_HEIGHT,
              height: Math.max(item.height * DAY_HEIGHT - 2, 14),
              left: `calc(${item.column * widthPercent}% + 2px)`,
              width: `calc(${widthPercent}% - 4px)`,
              borderLeftColor: color,
              backgroundColor: `${color}1f`,
              // The left border is already the category's; the owner goes on
              // the trailing edge so the two never compete for the same strip.
              ...(decoration?.personColor
                ? { boxShadow: `inset -3px 0 0 0 ${decoration.personColor}` }
                : {}),
              // A clipped event shouldn't look like it starts/ends at midnight.
              borderTopLeftRadius: item.continuesFromPreviousDay ? 0 : undefined,
              borderTopRightRadius: item.continuesFromPreviousDay ? 0 : undefined,
              borderBottomLeftRadius: item.continuesIntoNextDay ? 0 : undefined,
              borderBottomRightRadius: item.continuesIntoNextDay ? 0 : undefined,
            }}
          >
            <div className="flex items-center gap-1 truncate font-semibold text-moss-800">
              {chipStatusIcon(decoration) && (
                <Icon icon={chipStatusIcon(decoration)!} size="xs" className="shrink-0" />
              )}
              {chipListEmoji(decoration) && <span aria-hidden>{chipListEmoji(decoration)}</span>}
              <span className="truncate">{item.event.title}</span>
            </div>
            {item.height * DAY_HEIGHT > 30 && (
              // A week column on a phone is ~45px wide: a start–end pair spends
              // all of it and pushes the title into an ellipsis, so there the
              // block keeps only the name and the grid position says the rest.
              // The phone's 3-day and Day views have the width and show both.
              <div
                className={`truncate tabular-nums text-moss-500 ${
                  isDense ? 'hidden md:block' : ''
                }`}
              >
                {format(new Date(item.event.startsAt), 'HH:mm')} –{' '}
                {format(new Date(item.event.endsAt), 'HH:mm')}
              </div>
            )}

            {/* Bottom edge: drag to change the end time. Hidden on events too
                short to show it without covering the title, and on someone
                else's surprise, which must not be resized either. */}
            {decoration?.canEdit !== false &&
              !item.continuesIntoNextDay &&
              item.height * DAY_HEIGHT > 24 && (
              <div
                onPointerDown={(pointerEvent) => {
                  // Don't let the move handler on the parent also fire.
                  pointerEvent.stopPropagation();
                  onBeginDrag({
                    event: item.event,
                    mode: 'resize',
                    pointerEvent,
                    dayIndex,
                  });
                }}
                onClick={(clickEvent) => clickEvent.stopPropagation()}
                role="presentation"
                // Hover can't reveal this on touch, so it's always visible
                // below `md` and hover-gated above it, where a mouse can find it.
                className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100"
              >
                <div className="mx-auto h-0.5 w-6 rounded-full bg-moss-400/70" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** The red "now" line. Re-renders itself every minute. */
function CurrentTimeIndicator({ today }: { today: Date }) {
  const top = fractionOfDay(today) * DAY_HEIGHT;
  return (
    <div
      className="pointer-events-none absolute right-0 left-0 z-20 flex items-center"
      style={{ top }}
      aria-hidden
    >
      <div className="h-2 w-2 shrink-0 rounded-full bg-red-500" />
      <div className="h-px flex-1 bg-red-500" />
    </div>
  );
}
