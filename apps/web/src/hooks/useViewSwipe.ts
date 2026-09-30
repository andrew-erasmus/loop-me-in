import { useRef } from 'react';

/**
 * Swipe sideways across the calendar to move between views.
 *
 * The calendar area is crowded with gestures already — the month and hour
 * grids scroll vertically, and an event can be dragged to a new time — so this
 * is deliberately conservative about what counts as a swipe. It never calls
 * `preventDefault`, and it decides only once the finger lifts, so a gesture
 * that turns out to be a scroll or a drag is one this hook never touched.
 */

/** How far the finger must travel before it counts as a swipe at all. */
const MIN_DISTANCE_PX = 60;

/**
 * How far off-axis a swipe may wander, as a fraction of its length. A scroll
 * that drifts sideways stays a scroll; only a decisively horizontal gesture
 * changes the view.
 */
const MAX_OFF_AXIS_RATIO = 0.6;

/**
 * Ignore gestures starting this close to either edge. That strip belongs to
 * iOS's own back/forward swipe, and competing with it means both happen.
 */
const EDGE_GUARD_PX = 24;

/** A slow drag across the screen is not a swipe; it's someone thinking. */
const MAX_DURATION_MS = 800;

interface ViewSwipeOptions {
  /** `1` for a swipe leftwards (towards the next view), `-1` for rightwards. */
  onSwipe: (direction: 1 | -1) => void;
  /** Off for the views this doesn't apply to, and for desktop. */
  enabled: boolean;
}

export function useViewSwipe({ onSwipe, enabled }: ViewSwipeOptions) {
  const start = useRef<{ x: number; y: number; at: number } | null>(null);

  return {
    onTouchStart: (event: React.TouchEvent) => {
      start.current = null;
      if (!enabled) return;

      // A second finger means a pinch, not a swipe.
      const touch = event.touches.length === 1 ? event.touches[0] : undefined;
      if (!touch) return;

      // An event chip or block is draggable: that gesture is the drag hooks'
      // to interpret, and stealing a horizontal drag would move the event and
      // change the view at the same time.
      if ((event.target as HTMLElement | null)?.closest?.('[data-event-id]')) return;

      if (
        touch.clientX < EDGE_GUARD_PX ||
        touch.clientX > window.innerWidth - EDGE_GUARD_PX
      ) {
        return;
      }

      start.current = { x: touch.clientX, y: touch.clientY, at: Date.now() };
    },

    onTouchMove: (event: React.TouchEvent) => {
      if (event.touches.length > 1) start.current = null;
    },

    onTouchEnd: (event: React.TouchEvent) => {
      const began = start.current;
      start.current = null;
      if (!began) return;

      const touch = event.changedTouches[0];
      if (!touch) return;

      if (Date.now() - began.at > MAX_DURATION_MS) return;

      const dx = touch.clientX - began.x;
      const dy = touch.clientY - began.y;
      if (Math.abs(dx) < MIN_DISTANCE_PX) return;
      if (Math.abs(dy) > Math.abs(dx) * MAX_OFF_AXIS_RATIO) return;

      // Swiping left pulls the next view in from the right, the way the
      // segmented control reads.
      onSwipe(dx < 0 ? 1 : -1);
    },

    onTouchCancel: () => {
      start.current = null;
    },
  };
}
