import { useMemo } from 'react';
import {
  eventColor,
  format,
  getMonthGrid,
  getWeekdayNames,
  groupByDay,
  type CalendarEvent,
  type Category,
  type EventTimes,
} from '@date-calendar/core';
import { useMonthEventDrag } from '../../hooks/useMonthEventDrag.js';
import {
  chipListEmoji,
  chipStatusIcon,
  chipTooltip,
  personAccent,
  type EventDecoration,
} from '../../lib/decorations.js';
import Icon from '../ui/Icon.js';

/** Event chips per cell before collapsing the rest into a "+N more" row. */
const MAX_CHIPS_PER_DAY = 3;

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
  const previewEvents = useMemo(() => {
    if (!drag?.overDayKey) return events;
    const target = drag.overDayKey;
    return events.map((event) => {
      if (event.id !== drag.eventId) return event;
      const start = new Date(event.startsAt);
      const [year, month, day] = target.split('-').map(Number);
      const newStart = new Date(year!, month! - 1, day!, start.getHours(), start.getMinutes());
      const duration = Date.parse(event.endsAt) - Date.parse(event.startsAt);
      return {
        ...event,
        startsAt: newStart.toISOString(),
        endsAt: new Date(newStart.getTime() + duration).toISOString(),
      };
    });
  }, [events, drag]);

  const byDay = useMemo(() => groupByDay(previewEvents), [previewEvents]);

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

      <div className="grid min-h-0 flex-1 grid-rows-6">
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="grid grid-cols-7">
            {week.map((day) => {
              const dayEvents = byDay.get(day.key) ?? [];
              const visible = dayEvents.slice(0, MAX_CHIPS_PER_DAY);
              const overflow = dayEvents.length - visible.length;
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
                  className={`flex min-h-0 cursor-pointer flex-col gap-0.5 border-r border-b border-moss-200/70 p-1.5 transition-colors ${
                    isDropTarget
                      ? 'bg-moss-100 ring-2 ring-primary ring-inset'
                      : !day.inMonth
                        ? 'bg-moss-50/60 hover:bg-moss-100/60'
                        : day.isWeekend
                          ? 'bg-moss-50/70 hover:bg-moss-100/70'
                          : 'bg-white hover:bg-moss-50'
                  }`}
                >
                  <div className="flex items-center justify-between px-0.5">
                    <span
                      className={`display flex h-6 w-6 items-center justify-center rounded-full text-xs ${
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

                  <div className="flex min-h-0 flex-col gap-0.5 overflow-hidden">
                    {visible.map((event) => (
                      <MonthChip
                        key={event.id}
                        event={event}
                        color={eventColor(event, categories)}
                        decoration={decorations.get(event.id)}
                        isDragging={drag?.eventId === event.id}
                        onBeginDrag={begin}
                        onSelect={(selected) => {
                          if (consumeClickSuppression()) return;
                          onSelectEvent(selected);
                        }}
                      />
                    ))}

                    {overflow > 0 && (
                      <button
                        type="button"
                        onClick={(clickEvent) => {
                          clickEvent.stopPropagation();
                          if (consumeClickSuppression()) return;
                          onShowDay(day.date);
                        }}
                        className="px-1 text-left text-[11px] font-medium text-moss-500 hover:text-moss-900 hover:underline"
                      >
                        +{overflow} more
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function MonthChip({
  event,
  color,
  decoration,
  isDragging,
  onBeginDrag,
  onSelect,
}: {
  event: CalendarEvent;
  color: string;
  decoration: EventDecoration | undefined;
  isDragging: boolean;
  onBeginDrag: (event: CalendarEvent, pointerEvent: React.PointerEvent) => void;
  onSelect: (event: CalendarEvent) => void;
}) {
  // A real <button>: it carries no nested controls, so it stays natively
  // focusable and keyboard-activatable. (The time-grid blocks can't do this —
  // they contain a resize handle, and interactive content inside a button is
  // invalid HTML.)
  // Someone else's surprise can be looked at but not moved — dropping the
  // pointer handler is what actually enforces that in the UI; the server
  // enforces it for real with a 403.
  const canDrag = decoration?.canEdit !== false;

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

  const dragClasses = !canDrag
    ? 'cursor-pointer'
    : isDragging
      ? 'opacity-60 ring-2 ring-moss-900 cursor-grabbing'
      : 'cursor-grab';

  // All-day events read as a solid bar; timed events as a dot plus the time,
  // which is the quickest way to tell the two apart at a glance.
  const statusIcon = chipStatusIcon(decoration);
  const listEmoji = chipListEmoji(decoration);

  if (event.allDay) {
    return (
      <button
        {...shared}
        title={`${event.title}${chipTooltip(decoration)}`}
        className={`flex touch-none items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium text-white transition ${dragClasses}`}
        style={{ backgroundColor: color, ...personAccent(decoration) }}
      >
        {statusIcon && <Icon icon={statusIcon} size="xs" className="shrink-0 text-white" />}
        {listEmoji && <span aria-hidden>{listEmoji}</span>}
        <span className="truncate">{event.title}</span>
      </button>
    );
  }

  return (
    <button
      {...shared}
      title={`${format(new Date(event.startsAt), 'HH:mm')} ${event.title}${chipTooltip(decoration)}`}
      className={`flex touch-none items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[11px] text-moss-700 transition hover:bg-moss-100 ${dragClasses}`}
      style={personAccent(decoration)}
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="shrink-0 tabular-nums text-moss-500">
        {format(new Date(event.startsAt), 'HH:mm')}
      </span>
      {statusIcon && <Icon icon={statusIcon} size="xs" className="shrink-0" />}
      {listEmoji && <span aria-hidden>{listEmoji}</span>}
      <span className="truncate">{event.title}</span>
    </button>
  );
}
