import { useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { faGift } from '@fortawesome/free-solid-svg-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Icon from './Icon';
import {
  moveEvent,
  pixelsToMinutes,
  resizeEventEnd,
  type CalendarEvent,
  type EventTimes,
  type PositionedEvent,
} from '@date-calendar/core';
import { colors, radius, space } from '../theme';

/**
 * One event block in the Day view: draggable to move, with a handle to resize.
 *
 * **Why long-press, not an immediate drag.** The web equivalent
 * (`useEventDrag.ts`) tells a click from a drag by a few pixels of pointer
 * travel — trivial there, because a mouse click and a drag are the same input
 * device doing two different things. On a touchscreen, "touch and move" is
 * also what *scrolling the day* looks like, and the block sits inside a
 * `ScrollView`. `activateAfterLongPress` resolves the ambiguity with timing
 * instead of pixels: the gesture only activates once the hold has lasted
 * `LONG_PRESS_MS`, and fails outright if the finger travels before then — at
 * which point the ScrollView is free to treat the same touch as a scroll. A
 * quick swipe scrolls; a deliberate hold picks the event up.
 *
 * **Why the block moves through `Animated`, not React state.** The first cut
 * of this called back into the day screen on every `onUpdate` — dozens of
 * times a second — which fed a full re-layout of every event on the day and a
 * re-render of every block, all on the JS thread (there is no
 * `react-native-reanimated` here to move that work onto the UI thread
 * instead). Touch samples arrive faster than that chain can run, so the
 * callbacks queue up and the screen catches up in a burst once they drain —
 * which is what "the event shoots to a wild position" actually was, not
 * mis-tuned sensitivity. `Animated.Value.setValue()` sidesteps the whole
 * chain: it calls straight through to the underlying view's `setNativeProps`,
 * which never touches React's render or reconciliation, so the block tracks
 * the finger at whatever rate the OS delivers samples with nothing downstream
 * to fall behind. Nothing else needs to know where the drag currently is —
 * only where it *ends*, which is a single, cheap call.
 */

const LONG_PRESS_MS = 350;

/**
 * The grip activates faster than the block does.
 *
 * The block's long hold exists to tell "pick this up" from "scroll the day",
 * because the whole block is a plausible place to start a scroll. The grip is
 * a small, deliberate target that nothing else wants, so the same delay is
 * just friction on the gesture people already find hardest.
 */
const GRIP_LONG_PRESS_MS = 180;

/**
 * Below this many points of travel, a completed gesture commits nothing.
 *
 * `activateAfterLongPress` only guards against *starting* a drag on a plain
 * scroll — once active, holding still and lifting the finger still counts as
 * a completed gesture with `translationY` at or near 0. Snapping that through
 * `moveEvent`/`resizeEventEnd` is harmless for an event already on the
 * quarter-hour, but for one that isn't (typed in free-form on the web, say) it
 * would silently retime it to the nearest quarter-hour on a hold that was
 * never meant as a drag at all — and fire a network request to do it.
 */
const MIN_DRAG_PX = 2;

/**
 * The resize grip is a sibling of the block, not a child of it.
 *
 * As a child it could never be taller than the event it resized — a 30-minute
 * event is 26px, so the grip was either absent or a sliver, and the block's
 * `overflow: hidden` clipped anything hanging below. Straddling the bottom
 * edge as a sibling decouples the two: the target is the same comfortable size
 * whether the event is fifteen minutes or six hours.
 */
const GRIP_TOUCH_HEIGHT = 34;
const GRIP_TOUCH_WIDTH = 96;

/** Hairline between side-by-side columns. */
const COLUMN_GAP_PX = 3;

/** Shrinking stops here visually, matching `resizeEventEnd`'s own floor. */
const MIN_BLOCK_PX = 22;

interface Props {
  item: PositionedEvent;
  dayHeightPx: number;
  /** Width of the hour-label column the canvas is offset by. */
  gutterPx: number;
  /** Canvas width minus the gutter — the space the columns actually share. */
  contentWidthPx: number;
  color: string;
  personColor: string;
  title: string;
  /** True for a surprise that has already been redacted by the server. */
  secret?: boolean;
  timeLabel: string;
  /** False for a surprise that belongs to someone else — visible, not movable. */
  canEdit: boolean;
  onPress: () => void;
  /** Fires once, the moment a hold is recognised — used only to lock scrolling. */
  onDragStart: () => void;
  /** Fires once, always, when the gesture ends — successful or not. */
  onDragSettled: () => void;
  /** Fires once, with the final times, only if they actually changed. */
  onDragCommit: (event: CalendarEvent, times: EventTimes) => void;
}

export default function DraggableEventBlock({
  item,
  dayHeightPx,
  gutterPx,
  contentWidthPx,
  color,
  personColor,
  title,
  secret = false,
  timeLabel,
  canEdit,
  onPress,
  onDragStart,
  onDragSettled,
  onDragCommit,
}: Props) {
  const { event } = item;

  /**
   * Column geometry in pixels rather than percentages.
   *
   * Percentages were taken of the *whole* canvas and then shifted right by the
   * gutter, so every block overhung the screen by the gutter's width — the
   * right-hand edge of every event was simply off-screen. The columns share
   * `contentWidthPx`, which already excludes the gutter, so the arithmetic
   * lands inside the viewport.
   */
  const columnWidthPx = contentWidthPx / item.columnCount;
  const leftPx = gutterPx + item.column * columnWidthPx;
  const blockWidthPx = Math.max(columnWidthPx - COLUMN_GAP_PX, 1);

  const baseHeightPx = Math.max(item.height * dayHeightPx - 2, 22);
  const showTime = baseHeightPx > 34;
  // No height condition: a short event is exactly the one you most need to be
  // able to grab, and the grip no longer lives inside it.
  const showGrip = canEdit && !item.continuesIntoNextDay;

  const [lifted, setLifted] = useState(false);

  /**
   * The event as it was when the finger went down, held for the whole gesture.
   *
   * `translationY` is cumulative from the touch origin, so every frame's
   * arithmetic must be relative to the *original* times. Reading them from the
   * `event` prop instead would re-base the move on whatever the last frame
   * produced — which compounds, and is what previously sent a dragged event
   * shooting off the screen. The web hook keeps the same invariant by stashing
   * the event in a ref at gesture start (`useEventDrag.ts`).
   */
  const origin = useRef<CalendarEvent>(event);

  // Purely visual, and never touched by React state: the move gesture writes
  // straight into this on every native touch sample, and it resets to 0 the
  // instant the gesture ends — by then the block's real `top`, from `item`,
  // has already moved to the committed position, so the reset is invisible.
  const moveOffset = useRef(new Animated.Value(0)).current;
  // Same idea for resizing, added onto the block's base height. `height` is
  // not a transform property, so this one can't run on the native thread —
  // but it is still one component's own Animated.Value, not a state update
  // that re-renders the day, which is the change that actually matters.
  const resizeOffset = useRef(new Animated.Value(0)).current;

  // `resizeEventEnd` floors the committed result, but the *live* preview is raw
  // finger travel — without this a hard upward drag would run the block's
  // height negative and flip it inside out before the finger let go.
  const gripWidthPx = Math.min(GRIP_TOUCH_WIDTH, blockWidthPx);

  const clampedResize = useMemo(
    () =>
      resizeOffset.interpolate({
        inputRange: [MIN_BLOCK_PX - baseHeightPx, 0],
        outputRange: [MIN_BLOCK_PX - baseHeightPx, 0],
        extrapolateLeft: 'clamp',
        extrapolateRight: 'extend',
      }),
    [resizeOffset, baseHeightPx],
  );

  const moveGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(canEdit)
        .activateAfterLongPress(LONG_PRESS_MS)
        .onStart(() => {
          origin.current = event;
          setLifted(true);
          onDragStart();
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        })
        .onUpdate((gestureEvent) => {
          moveOffset.setValue(gestureEvent.translationY);
        })
        .onEnd((gestureEvent) => {
          if (Math.abs(gestureEvent.translationY) < MIN_DRAG_PX) return;
          const from = origin.current;
          const minuteDelta = pixelsToMinutes(gestureEvent.translationY, dayHeightPx);
          onDragCommit(from, moveEvent(from, { minuteDelta }));
        })
        .onFinalize(() => {
          setLifted(false);
          moveOffset.setValue(0);
          onDragSettled();
        }),
    [event, dayHeightPx, canEdit, moveOffset, onDragStart, onDragSettled, onDragCommit],
  );

  const resizeGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(canEdit)
        .activateAfterLongPress(GRIP_LONG_PRESS_MS)
        .onStart(() => {
          origin.current = event;
          setLifted(true);
          onDragStart();
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        })
        .onUpdate((gestureEvent) => {
          resizeOffset.setValue(gestureEvent.translationY);
        })
        .onEnd((gestureEvent) => {
          if (Math.abs(gestureEvent.translationY) < MIN_DRAG_PX) return;
          const from = origin.current;
          const minuteDelta = pixelsToMinutes(gestureEvent.translationY, dayHeightPx);
          onDragCommit(from, resizeEventEnd(from, { minuteDelta }));
        })
        .onFinalize(() => {
          setLifted(false);
          resizeOffset.setValue(0);
          onDragSettled();
        }),
    [event, dayHeightPx, canEdit, resizeOffset, onDragStart, onDragSettled, onDragCommit],
  );

  // A quick, still tap opens the detail sheet; a held one is the start of
  // `moveGesture` instead. `Gesture.Race` lets whichever condition is met
  // first — release-without-travel, or the long-press timer — win, and RNGH
  // cancels the other. Composed with the move gesture (not a bare `Pressable`)
  // because mixing RN's own responder system with GestureDetector on the same
  // view is the one combination RNGH does not reliably arbitrate.
  const tapGesture = useMemo(
    () =>
      Gesture.Tap().onEnd((_event, success) => {
        if (success) onPress();
      }),
    [onPress],
  );

  const blockGesture = useMemo(
    () => Gesture.Race(tapGesture, moveGesture),
    [tapGesture, moveGesture],
  );

  return (
    <>
      <GestureDetector gesture={blockGesture}>
        <Animated.View
          style={[
            styles.event,
            {
              top: item.top * dayHeightPx,
              height: Animated.add(baseHeightPx, clampedResize),
              left: leftPx,
              width: blockWidthPx,
              borderLeftColor: color,
              backgroundColor: `${color}1f`,
              transform: [{ translateY: moveOffset }],
            },
            lifted && styles.eventLifted,
          ]}
        >
          <View style={styles.eventTitleLine}>
            {secret && <Icon icon={faGift} size="xs" color={colors.body} />}
            <Text style={styles.eventTitle} numberOfLines={1}>
              {title}
            </Text>
          </View>
          {showTime && (
            <Text style={styles.eventTime} numberOfLines={1}>
              {timeLabel}
            </Text>
          )}
          <View style={[styles.eventPerson, { backgroundColor: personColor }]} />
        </Animated.View>
      </GestureDetector>

      {showGrip && (
        <GestureDetector gesture={resizeGesture}>
          <Animated.View
            style={[
              styles.gripTouch,
              {
                // Centred on the block's bottom edge, so half the target hangs
                // below the event and is reachable no matter how short it is.
                top: item.top * dayHeightPx + baseHeightPx - GRIP_TOUCH_HEIGHT / 2,
                // Centred under the block. Side-anchoring put the grip
                // exactly where a thumb naturally lands when reaching from the
                // right edge of the phone, which made it easy to grab the
                // *block* (starting a move) when reaching for the grip below
                // it. Centring it moves the grip away from that reach path.
                left: leftPx + (blockWidthPx - gripWidthPx) / 2,
                width: gripWidthPx,
                // Follows the block when it is moved, and the bottom edge when
                // it is resized — hence both offsets.
                transform: [
                  { translateY: Animated.add(moveOffset, clampedResize) },
                ],
              },
              lifted && styles.gripTouchLifted,
            ]}
          >
            <View style={[styles.gripBar, lifted && styles.gripBarLifted]} />
          </Animated.View>
        </GestureDetector>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  event: {
    position: 'absolute',
    borderLeftWidth: 3,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  eventLifted: {
    zIndex: 10,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  eventTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  eventTitle: { fontSize: 12, fontWeight: '600', color: colors.ink, flexShrink: 1 },
  eventTime: { fontSize: 11, color: colors.body },
  eventPerson: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 6,
    height: 6,
    borderRadius: radius.pill,
  },
  gripTouch: {
    position: 'absolute',
    height: GRIP_TOUCH_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    // Above its own block so the grip always wins a touch on the edge it owns.
    zIndex: 6,
  },
  gripTouchLifted: { zIndex: 12 },
  gripBar: {
    width: 44,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    opacity: 0.28,
  },
  gripBarLifted: { opacity: 0.9, width: 56 },
});
