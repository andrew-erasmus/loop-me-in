import { useCallback, useEffect, useRef, useState } from 'react';
import {
  isUnchanged,
  moveEventToDay,
  type CalendarEvent,
  type EventTimes,
} from '@date-calendar/core';

/**
 * Dragging an event chip onto another day in the month grid.
 *
 * The month grid has no hour axis, so a drop only changes the date — the time
 * of day and the duration ride along. Target resolution is by hit-testing for a
 * `data-day-key` attribute under the pointer, which keeps the grid cells
 * themselves free of drag wiring.
 */

const DRAG_THRESHOLD_PX = 4;

export interface MonthDragState {
  eventId: string;
  /** `yyyy-MM-dd` of the cell under the pointer, for highlighting. */
  overDayKey: string | null;
  /**
   * The same cell as a `Date`. Carried alongside the key so the view can build
   * its drag preview with `moveEventToDay` — the very function the drop will
   * commit — rather than parsing the key back into a date and re-deriving the
   * arithmetic itself.
   */
  overDate: Date | null;
}

interface UseMonthEventDragOptions {
  onCommit: (eventId: string, times: EventTimes) => void;
}

/** The day cell under these viewport coordinates, if any. */
function dayCellAt(clientX: number, clientY: number): { key: string; date: Date } | null {
  const element = document
    .elementFromPoint(clientX, clientY)
    ?.closest<HTMLElement>('[data-day-key]');
  if (!element) return null;

  const key = element.dataset['dayKey'];
  const iso = element.dataset['dayIso'];
  if (!key || !iso) return null;

  return { key, date: new Date(iso) };
}

export function useMonthEventDrag({ onCommit }: UseMonthEventDragOptions) {
  const [drag, setDrag] = useState<MonthDragState | null>(null);

  const gesture = useRef<{
    event: CalendarEvent;
    startX: number;
    startY: number;
    passedThreshold: boolean;
    target: { key: string; date: Date } | null;
  } | null>(null);

  const suppressClick = useRef(false);

  const begin = useCallback((event: CalendarEvent, pointerEvent: React.PointerEvent) => {
    // Clear any suppression left over from a previous gesture whose click was
    // stopped before it reached a handler that would have consumed the flag.
    suppressClick.current = false;

    if (pointerEvent.button !== 0) return;
    gesture.current = {
      event,
      startX: pointerEvent.clientX,
      startY: pointerEvent.clientY,
      passedThreshold: false,
      target: null,
    };
  }, []);

  useEffect(() => {
    const onPointerMove = (pointerEvent: PointerEvent) => {
      const current = gesture.current;
      if (!current) return;

      if (!current.passedThreshold) {
        const travel = Math.hypot(
          pointerEvent.clientX - current.startX,
          pointerEvent.clientY - current.startY,
        );
        if (travel < DRAG_THRESHOLD_PX) return;
        current.passedThreshold = true;
      }

      pointerEvent.preventDefault();

      const target = dayCellAt(pointerEvent.clientX, pointerEvent.clientY);
      current.target = target;
      setDrag({
        eventId: current.event.id,
        overDayKey: target?.key ?? null,
        overDate: target?.date ?? null,
      });
    };

    const onPointerUp = () => {
      const current = gesture.current;
      gesture.current = null;
      setDrag(null);
      if (!current || !current.passedThreshold) return;

      suppressClick.current = true;

      if (!current.target) return;
      const times = moveEventToDay(current.event, current.target.date);
      if (!isUnchanged(current.event, times)) {
        onCommit(current.event.id, times);
      }
    };

    const onKeyDown = (keyEvent: KeyboardEvent) => {
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
  }, [onCommit]);

  const consumeClickSuppression = useCallback(() => {
    if (!suppressClick.current) return false;
    suppressClick.current = false;
    return true;
  }, []);

  return { drag, begin, consumeClickSuppression };
}
