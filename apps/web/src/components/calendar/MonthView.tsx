import { useMemo } from 'react';
import {
  eventColor,
  format,
  getMonthGrid,
  getWeekdayNames,
  layoutDaySegments,
  moveEventToDay,
  type CalendarDay,
  type CalendarEvent,
  type Category,
  type DaySegment,
  type EventTimes,
} from '@date-calendar/core';
import { useMonthEventDrag, type MonthDragState } from '../../hooks/useMonthEventDrag.js';
import {
  chipListEmoji,
  chipStatusIcon,
  chipTooltip,
  personAccent,
  type EventDecoration,
} from '../../lib/decorations.js';
import Icon from '../ui/Icon.js';

/**
 * Lanes of events per week row before the rest collapses into "+N more".
 *
 * A fixed cap rather than a measured row height on purpose: measuring would
 * make the "+N more" count change as the window resizes, and would put a pixel
 * measurement in charge of a decision the layout expresses in lane indices.
 */
const MAX_LANES = 3;

interface MonthViewProps {
  anchorDate: Date;
  today: Date;
  events: CalendarEvent[];
  categories: Map<string, Category>;
  /** Who owns each event, whether it's private, and which list it came from. */
  decorations: Map<string, EventDecoration>;
  onSelectEvent: (event: CalendarEvent) => void;
  onSelectDay: (day: Date) => void;
  onShowDay: (day: Date) => void;
  onMoveEvent: (eventId: string, times: EventTimes) => void;
}

export default function MonthView({
  anchorDate,
  today,
  events,
  categories,
  decorations,
  onSelectEvent,
  onSelectDay,
  onShowDay,
  onMoveEvent,
}: MonthViewProps) {
  const weeks = useMemo(() => getMonthGrid(anchorDate, today), [anchorDate, today]);
  const weekdayNames = useMemo(() => getWeekdayNames(), []);

  const { drag, begin, consumeClickSuppression } = useMonthEventDrag({
    onCommit: onMoveEvent,
  });

  // Re-date the dragged event as the pointer moves, so it appears in the cell
  // it would land in rather than following the cursor as a detached ghost.
  //
  // `moveEventToDay` is the same function the drop commits, so the preview
  // cannot drift from the result — which matters more now than it did for
  // chips: get it wrong for a multi-day event and the bar is the wrong *width*,
  // not merely on the wrong day.
  const previewEvents = useMemo(() => {
    const target = drag?.overDate;
    if (!target) return events;
    return events.map((event) =>
      event.id === drag.eventId ? { ...event, ...moveEventToDay(event, target) } : event,
    );
  }, [events, drag]);

  return (
    <div className={`flex h-full min-h-0 flex-col ${drag ? 'select-none' : ''}`}>
      <div className="grid grid-cols-7 border-b border-moss-200 bg-white">
        {weekdayNames.map((name) => (
          <div
            key={name}
            className="px-2 py-2 text-center text-xs font-semibold tracking-wide text-moss-500 uppercase"
          >
            {name}
          </div>
        ))}
      </div>

      {/*
        Desktop divides the available height into six equal rows — a month is a
        shape you take in at a glance, and reflowing it would spoil that.

        A phone has nowhere near the height for that: six equal rows leave cells
        about 60px tall, which is both an unreliable tap target and too short to
        show an event's name. So below `md` a row gets a comfortable floor and
        grows past it when a day has more to show — three chips and a "+N more"
        need more room than three chips do — and the rest of the month scrolls
        into view rather than being squeezed into the fold.
      */}
      <div className="scroll-slim grid min-h-0 flex-1 auto-rows-[minmax(7rem,max-content)] overflow-y-auto md:auto-rows-auto md:grid-rows-6 md:overflow-hidden">
        {weeks.map((week, weekIndex) => (
          <WeekRow
            key={weekIndex}
            week={week}
            events={previewEvents}
            categories={categories}
            decorations={decorations}
            drag={drag}
            onBeginDrag={begin}
            onSelectEvent={onSelectEvent}
            onSelectDay={onSelectDay}
            onShowDay={onShowDay}
            consumeClickSuppression={consumeClickSuppression}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * One week of the month grid.
 *
 * The row is a CSS grid that the event segments are items *of*, rather than
 * seven independent cells each holding their own stack. That is what lets a
 * multi-day event be a single element spanning the columns it covers — a chip
 * per day could never join up — and CSS Grid does the spanning natively, so
 * there is no lane height in pixels to keep in step with the chip padding
 * (which legitimately differs between a phone and a desktop).
 *
 * Row 1 holds the date numbers, rows 2…n+1 are the lanes, the next row is the
 * "+N more" line, and a trailing `1fr` soaks up whatever is left.
 */
function WeekRow({
  week,
  events,
  categories,
  decorations,
  drag,
  onBeginDrag,
  onSelectEvent,
  onSelectDay,
  onShowDay,
  consumeClickSuppression,
}: {
  week: CalendarDay[];
  events: CalendarEvent[];
  categories: Map<string, Category>;
  decorations: Map<string, EventDecoration>;
  drag: MonthDragState | null;
  onBeginDrag: (event: CalendarEvent, pointerEvent: React.PointerEvent) => void;
  onSelectEvent: (event: CalendarEvent) => void;
  onSelectDay: (day: Date) => void;
  onShowDay: (day: Date) => void;
  consumeClickSuppression: () => boolean;
}) {
  const segments = useMemo(() => layoutDaySegments(events, week), [events, week]);

  const visible = segments.filter((segment) => segment.lane < MAX_LANES);
  const laneCount = Math.min(
    segments.reduce((most, segment) => Math.max(most, segment.lane + 1), 0),
    MAX_LANES,
  );

  /*
    What each day hides. A segment pushed past the cap counts as overflow on
    *every* column it crosses — count it only where it starts and a four-day bar
    would be missing from three days without anything saying so.
  */
  const overflowByColumn = week.map(() => 0);
  for (const segment of segments) {
    if (segment.lane < MAX_LANES) continue;
    for (let column = segment.startColumn; column < segment.startColumn + segment.span; column++) {
      overflowByColumn[column] = (overflowByColumn[column] ?? 0) + 1;
    }
  }

  // `repeat(0, …)` is invalid CSS, so a week with nothing in it gets no lane
  // tracks at all rather than an empty repeat.
  const laneTracks = laneCount > 0 ? ` repeat(${laneCount}, auto)` : '';
  const overflowRow = laneCount + 2;

  return (
    <div
      className="relative grid grid-cols-7 overflow-hidden"
      // The trailing `1fr` is load-bearing. On desktop the parent fixes this
      // row's height, so it is taller than its `auto` tracks; without a
      // flexible last track the day backgrounds — which carry the cell fill,
      // its hairlines and its create-event click target — would stop at the
      // last lane instead of reaching the bottom edge.
      style={{ gridTemplateRows: `auto${laneTracks} auto 1fr` }}
    >
      {/*
        The day cells: background, borders, and the click target that creates an
        event. Each spans every row, so the whole cell is clickable and so the
        drag hook's `[data-day-key]` hit-test still finds a full-height target.
      */}
      {week.map((day, column) => {
        const isDropTarget = drag?.overDayKey === day.key;
        return (
          <div
            key={day.key}
            // Read by the drag hook's hit-test to work out the drop target.
            data-day-key={day.key}
            data-day-iso={day.date.toISOString()}
            // The cell itself creates an event on the day it represents.
            onClick={() => {
              if (consumeClickSuppression()) return;
              onSelectDay(day.date);
            }}
            style={{ gridColumn: column + 1, gridRow: '1 / -1' }}
            className={`cursor-pointer border-r border-b border-moss-200/70 transition-colors ${
              isDropTarget
                ? 'bg-moss-100 ring-2 ring-primary ring-inset'
                : !day.inMonth
                  ? 'bg-moss-50/60 hover:bg-moss-100/60'
                  : day.isWeekend
                    ? 'bg-moss-50/70 hover:bg-moss-100/70'
                    : 'bg-white hover:bg-moss-50'
            }`}
          />
        );
      })}

      {/* Date numbers. `pointer-events-none` so they don't shadow the cell's
          own click target underneath them. */}
      {week.map((day, column) => (
        <div
          key={`date-${day.key}`}
          style={{ gridColumn: column + 1, gridRow: 1 }}
          className="pointer-events-none z-10 px-2 pt-1.5 pb-0.5"
        >
          <span
            className={`display flex h-7 w-7 items-center justify-center rounded-full text-sm md:h-6 md:w-6 md:text-xs ${
              day.isToday
                ? 'bg-primary text-white'
                : day.inMonth
                  ? 'text-moss-700'
                  : 'text-moss-400'
            }`}
          >
            {day.dayOfMonth}
          </span>
        </div>
      ))}

      {/* The events. A segment spanning more than one column is one element
          across all of them — this is the whole point of the row being a grid. */}
      {visible.map((segment) => (
        <div
          key={segment.event.id}
          style={{
            gridColumn: `${segment.startColumn + 1} / span ${segment.span}`,
            gridRow: segment.lane + 2,
          }}
          // The wrapper is only a gutter; it must not swallow clicks meant for
          // the day cell behind it. The chip itself takes them back.
          className="pointer-events-none z-10 min-w-0 px-1 pb-0.5"
        >
          <MonthChip
            segment={segment}
            color={eventColor(segment.event, categories)}
            decoration={decorations.get(segment.event.id)}
            isDragging={drag?.eventId === segment.event.id}
            isDragInFlight={drag !== null}
            onBeginDrag={onBeginDrag}
            onSelect={(selected) => {
              if (consumeClickSuppression()) return;
              onSelectEvent(selected);
            }}
          />
        </div>
      ))}

      {overflowByColumn.map((count, column) =>
        count > 0 ? (
          <button
            key={`more-${week[column]!.key}`}
            type="button"
            onClick={(clickEvent) => {
              clickEvent.stopPropagation();
              if (consumeClickSuppression()) return;
              onShowDay(week[column]!.date);
            }}
            style={{ gridColumn: column + 1, gridRow: overflowRow }}
            className="z-10 self-start px-2 py-1 text-left text-[11px] font-medium text-moss-500 hover:text-moss-900 hover:underline md:py-0"
          >
            +{count} more
          </button>
        ) : null,
      )}
    </div>
  );
}

function MonthChip({
  segment,
  color,
  decoration,
  isDragging,
  isDragInFlight,
  onBeginDrag,
  onSelect,
}: {
  segment: DaySegment;
  color: string;
  decoration: EventDecoration | undefined;
  isDragging: boolean;
  /** True while *any* month drag is in flight — see the pointer-events note. */
  isDragInFlight: boolean;
  onBeginDrag: (event: CalendarEvent, pointerEvent: React.PointerEvent) => void;
  onSelect: (event: CalendarEvent) => void;
}) {
  const { event, span, continuesBefore, continuesAfter } = segment;

  // A real <button>: it carries no nested controls, so it stays natively
  // focusable and keyboard-activatable. (The time-grid blocks can't do this —
  // they contain a resize handle, and interactive content inside a button is
  // invalid HTML.)
  // Someone else's surprise can be looked at but not moved — dropping the
  // pointer handler is what actually enforces that in the UI; the server
  // enforces it for real with a 403.
  const canDrag = decoration?.canEdit !== false;

  /*
    While a drag is in flight every chip stops being a hit target.

    `useMonthEventDrag` resolves the drop day with
    `elementFromPoint(…).closest('[data-day-key]')`, and a segment is a *sibling*
    of the day cells rather than a descendant of one — so with a chip under the
    pointer `closest` finds nothing and the drop silently does nothing. Letting
    the pointer fall through to the cell behind is both the fix and the right
    model: the thing you are dragging, and anything you drag it over, should not
    be competing to be the target.
  */
  const shared = {
    type: 'button' as const,
    'data-event-id': event.id,
    ...(canDrag
      ? {
          onPointerDown: (pointerEvent: React.PointerEvent) =>
            onBeginDrag(event, pointerEvent),
        }
      : {}),
    onClick: (clickEvent: React.MouseEvent) => {
      clickEvent.stopPropagation();
      onSelect(event);
    },
  };

  const pointerClasses = isDragInFlight ? 'pointer-events-none' : 'pointer-events-auto';

  const dragClasses = !canDrag
    ? 'cursor-pointer'
    : isDragging
      ? 'opacity-60 ring-2 ring-moss-900 cursor-grabbing'
      : 'cursor-grab';

  const statusIcon = chipStatusIcon(decoration);
  const listEmoji = chipListEmoji(decoration);

  /*
    A piece of a longer event, whether because it spans days or because it was
    clipped at this row's edge. It reads as a solid bar and squares off the end
    that continues, the same move the time grid makes for a block clipped at
    midnight — a rounded edge would claim the event starts or ends there.

    The owner's accent is dropped on a leading edge that isn't really the start,
    for the same reason.
  */
  const isContinuation = span > 1 || continuesBefore || continuesAfter;

  const edgeStyle = {
    borderTopLeftRadius: continuesBefore ? 0 : undefined,
    borderBottomLeftRadius: continuesBefore ? 0 : undefined,
    borderTopRightRadius: continuesAfter ? 0 : undefined,
    borderBottomRightRadius: continuesAfter ? 0 : undefined,
  };

  const accent = continuesBefore ? undefined : personAccent(decoration);

  // All-day events read as a solid bar; timed events as a dot plus the time,
  // which is the quickest way to tell the two apart at a glance. A multi-day
  // event is a bar either way — that *is* the thing being communicated — and a
  // timed one keeps its start time inline, since the bar's left edge is the
  // only place that information still exists.
  //
  // On a phone a single-day chip drops the time (`hidden md:inline` below) and
  // the dot alone carries the distinction. A cell is only about seven
  // characters wide there, and "09:00" spends five of them saying the one thing
  // the grid position already implies — what the event *is* is the part you
  // can't infer. A bar is wider than a cell, so it keeps its time.
  if (event.allDay || isContinuation) {
    const showsTime = !event.allDay && !continuesBefore;
    return (
      <button
        {...shared}
        title={`${event.title}${chipTooltip(decoration)}`}
        className={`flex w-full touch-none items-center gap-1 truncate rounded px-1.5 py-1 text-left text-[11px] font-medium text-white transition md:py-0.5 ${pointerClasses} ${dragClasses}`}
        style={{ backgroundColor: color, ...accent, ...edgeStyle }}
      >
        {statusIcon && <Icon icon={statusIcon} size="xs" className="shrink-0 text-white" />}
        {listEmoji && <span aria-hidden>{listEmoji}</span>}
        {showsTime && (
          <span className="shrink-0 tabular-nums text-white/80">
            {format(new Date(event.startsAt), 'HH:mm')}
          </span>
        )}
        <span className="truncate">{event.title}</span>
      </button>
    );
  }

  return (
    <button
      {...shared}
      title={`${format(new Date(event.startsAt), 'HH:mm')} ${event.title}${chipTooltip(decoration)}`}
      className={`flex w-full touch-none items-center gap-1 truncate rounded px-1 py-1 text-left text-[11px] text-moss-700 transition hover:bg-moss-100 md:py-0.5 ${pointerClasses} ${dragClasses}`}
      style={personAccent(decoration)}
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="hidden shrink-0 tabular-nums text-moss-500 md:inline">
        {format(new Date(event.startsAt), 'HH:mm')}
      </span>
      {statusIcon && <Icon icon={statusIcon} size="xs" className="shrink-0" />}
      {listEmoji && <span aria-hidden>{listEmoji}</span>}
      <span className="truncate">{event.title}</span>
    </button>
  );
}
