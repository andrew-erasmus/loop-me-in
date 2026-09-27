import { useCallback, useEffect, useRef, useState } from 'react';
import {
  isUnchanged,
  moveEvent,
  pixelsToMinutes,
  resizeEventEnd,
  type CalendarEvent,
  type EventTimes,
} from '@date-calendar/core';

/**
 * Pointer plumbing for dragging events on the time grid.
 *
 * This hook owns only the web-specific half of the gesture: listening to
 * pointer events, deciding when a press becomes a drag, and working out which
 * day column the pointer is over. The moment it has "N days sideways, M minutes
 * vertically" it hands off to @date-calendar/core, which does the actual date
 * arithmetic. React Native will replace this file with a PanResponder and reuse
 * the same core functions untouched.
 */

/** Pointer travel before a press counts as a drag rather than a click. */
const DRAG_THRESHOLD_PX = 4;

export type DragMode = 'move' | 'resize';

export interface DragState {
  eventId: string;
  mode: DragMode;
  /** Times the drag would produce, recomputed on every pointer move. */
  preview: EventTimes;
  /** Column the pointer is currently over, for highlighting. */
  dayIndex: number;
}

interface StartArgs {
  event: CalendarEvent;
  mode: DragMode;
  pointerEvent: React.PointerEvent;
  /** Index of the column the event currently sits in. */
  dayIndex: number;
}

interface UseEventDragOptions {
  /** Pixel height of one full day column — the px-to-minutes scale. */
  dayHeightPx: number;
  /** Live bounding rects of the day columns, for horizontal hit-testing. */
  getColumnRects: () => DOMRect[];
  /** Commit the finished drag. */
  onCommit: (eventId: string, times: EventTimes) => void;
}

export function useEventDrag({
  dayHeightPx,
  getColumnRects,
  onCommit,
}: UseEventDragOptions) {
  const [drag, setDrag] = useState<DragState | null>(null);

  // Everything the move/up handlers need, kept in a ref so the listeners can
  // stay stable and not be torn down and rebuilt on every pointer move.
  const gesture = useRef<{
    event: CalendarEvent;
    mode: DragMode;
    startX: number;
    startY: number;
    startDayIndex: number;
    columnRects: DOMRect[];
    passedThreshold: boolean;
    latest: EventTimes | null;
  } | null>(null);

  /** Set by a completed drag so the ensuing click doesn't open the modal. */
  const suppressClick = useRef(false);

  const begin = useCallback(
    ({ event, mode, pointerEvent, dayIndex }: StartArgs) => {
      // Clear any suppression left over from the previous gesture. A drag that
      // ends on an element which stops click propagation — the resize handle
      // does exactly that — leaves the flag set with no click to consume it,
      // and it would otherwise swallow the next genuine click.
      suppressClick.current = false;

      // Ignore secondary buttons; let them fall through to normal behaviour.
      if (pointerEvent.button !== 0) return;

      gesture.current = {
        event,
        mode,
        startX: pointerEvent.clientX,
        startY: pointerEvent.clientY,
        startDayIndex: dayIndex,
        // Captured once at gesture start: re-measuring mid-drag would fight
        // with the preview re-rendering the very elements being measured.
        columnRects: getColumnRects(),
        passedThreshold: false,
        latest: null,
      };
    },
    [getColumnRects],
  );

  useEffect(() => {
    const onPointerMove = (pointerEvent: PointerEvent) => {
      const current = gesture.current;
      if (!current) return;

      const dx = pointerEvent.clientX - current.startX;
      const dy = pointerEvent.clientY - current.startY;

      if (!current.passedThreshold) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        current.passedThreshold = true;
      }

      // Stop the browser selecting text once a real drag is under way.
      pointerEvent.preventDefault();

      const minuteDelta = pixelsToMinutes(dy, dayHeightPx);

      if (current.mode === 'resize') {
        const preview = resizeEventEnd(current.event, { minuteDelta });
        current.latest = preview;
        setDrag({
          eventId: current.event.id,
          mode: 'resize',
          preview,
          dayIndex: current.startDayIndex,
        });
        return;
      }

      // Which column is the pointer over? Falls back to the starting column
      // when the pointer strays outside the grid, so the event doesn't jump.
      const hoveredIndex = current.columnRects.findIndex(
        (rect) => pointerEvent.clientX >= rect.left && pointerEvent.clientX < rect.right,
      );
      const dayIndex = hoveredIndex === -1 ? current.startDayIndex : hoveredIndex;

      const preview = moveEvent(current.event, {
        dayDelta: dayIndex - current.startDayIndex,
        minuteDelta,
      });
      current.latest = preview;
      setDrag({ eventId: current.event.id, mode: 'move', preview, dayIndex });
    };

    const onPointerUp = () => {
      const current = gesture.current;
      gesture.current = null;
      setDrag(null);
      if (!current || !current.passedThreshold) return;

      // A real drag happened, so swallow the click that follows it.
      suppressClick.current = true;

      if (current.latest && !isUnchanged(current.event, current.latest)) {
        onCommit(current.event.id, current.latest);
      }
    };

    const onKeyDown = (keyEvent: KeyboardEvent) => {
      // Escape abandons the drag and leaves the event where it was.
      if (keyEvent.key !== 'Escape' || !gesture.current) return;
      gesture.current = null;
      setDrag(null);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [dayHeightPx, onCommit]);

  /** True if this click is the tail of a drag and should be ignored. */
  const consumeClickSuppression = useCallback(() => {
    if (!suppressClick.current) return false;
    suppressClick.current = false;
    return true;
  }, []);

  return { drag, begin, consumeClickSuppression };
}
