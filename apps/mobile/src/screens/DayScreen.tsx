import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  ApiError,
  canEditEvent,
  categoryMap,
  eventColor,
  eventsOnDay,
  format,
  fractionOfDay,
  getHourSlots,
  getWeekDays,
  isHiddenSurprise,
  isSameDay,
  isUnchanged,
  layoutDayEvents,
  personColor,
  type CalendarEvent,
  type EventTimes,
  type User,
} from '@date-calendar/core';
import DraggableEventBlock from '../components/DraggableEventBlock';
import { api, apiBaseUrl } from '../lib/api';
import { useStore } from '../lib/store';
import { colors, radius, space, type } from '../theme';

/**
 * One day, hour by hour.
 *
 * This is the view a week grid wants to be but cannot at this width: a single
 * column has the whole screen, so overlapping events are still legible.
 *
 * The geometry is `layoutDayEvents` from core, which returns *fractions* rather
 * than pixels — the web multiplies them by its own hour height, and this
 * multiplies them by HOUR_HEIGHT here. Same overlap logic, two renderers.
 *
 * **Dragging.** The gesture itself lives in `DraggableEventBlock`, which moves
 * the block natively without re-rendering anything. This screen deliberately
 * knows only two things about a drag: that one is happening (so the ScrollView
 * can be locked) and where it finished.
 *
 * It notably does *not* reflow the column live the way the web does. The web
 * can afford to re-run `layoutDayEvents` on every pointer move; doing the same
 * here re-rendered every block on the day on the JS thread for every touch
 * sample, and the resulting backlog made the dragged event jump. The column
 * re-lays-out once, on drop. Overlap on a phone-width day is rare enough that
 * losing the live reflow costs far less than the stutter did.
 */

const HOUR_HEIGHT = 56;
const DAY_HEIGHT = HOUR_HEIGHT * 24;
const GUTTER = 52;

export default function DayScreen({
  anchor,
  onChangeDay,
  onSelectEvent,
  onCreateAt,
}: {
  anchor: Date;
  onChangeDay: (day: Date) => void;
  onSelectEvent: (event: CalendarEvent) => void;
  onCreateAt: (start: Date) => void;
}) {
  const { data, upsertEvent } = useStore();
  const scrollRef = useRef<ScrollView>(null);
  // Just "is a drag in flight", not where it is — see the note above.
  const [dragging, setDragging] = useState(false);
  // Measured rather than assumed: the columns divide up whatever is left after
  // the hour gutter, and that has to be real pixels — deriving it from
  // percentages of the full canvas is what previously pushed every block's
  // right-hand edge off the screen.
  const [canvasWidth, setCanvasWidth] = useState(0);

  const week = useMemo(() => getWeekDays(anchor, new Date()), [anchor]);
  const hours = useMemo(() => getHourSlots(), []);

  const positioned = useMemo(
    () => layoutDayEvents(eventsOnDay(data?.events ?? [], anchor), anchor),
    [data?.events, anchor],
  );

  // Open at roughly the working day rather than at midnight, which is dead
  // space on every calendar ever made.
  useEffect(() => {
    const target = isSameDay(anchor, new Date())
      ? Math.max(fractionOfDay(new Date()) * DAY_HEIGHT - HOUR_HEIGHT * 2, 0)
      : HOUR_HEIGHT * 7;
    scrollRef.current?.scrollTo({ y: target, animated: false });
  }, [anchor]);

  const handleDragStart = useCallback(() => setDragging(true), []);
  const handleDragSettled = useCallback(() => setDragging(false), []);

  /**
   * Commit a finished drag optimistically — the block is already sitting at
   * `times` the instant the finger lifts, matching the web mutation's
   * `onMutate`, so nothing waits on the network to look right. A failure rolls
   * the specific event back to what the server last confirmed, rather than
   * refetching everything.
   *
   * One retry happens silently before anything is rolled back or shown to the
   * user. A phone on wifi drops the odd request in a way a laptop on the same
   * network rarely does, and the server-side half of this round trip is not in
   * question — replaying the exact PATCH a drag produces against the API by
   * hand succeeds every time. Losing a drag to one dropped packet, after the
   * gesture itself is already reliable, is the more likely failure mode.
   */
  const handleDragCommit = useCallback(
    (event: CalendarEvent, times: EventTimes) => {
      if (isUnchanged(event, times)) return;

      const optimistic = { ...event, ...times };
      upsertEvent(optimistic);

      void (async () => {
        try {
          const saved = await api.updateEvent(event.id, times);
          upsertEvent(saved);
        } catch (firstError) {
          try {
            await new Promise((resolve) => setTimeout(resolve, 400));
            const saved = await api.updateEvent(event.id, times);
            upsertEvent(saved);
          } catch (retryError) {
            upsertEvent(event);
            // Whatever actually went wrong, not a canned guess — a genuine
            // validation failure and a dead connection are different problems,
            // and only one of them is worth trying again for.
            const detail =
              retryError instanceof ApiError
                ? retryError.message
                : retryError instanceof Error
                  ? retryError.message
                  : String(retryError);
            Alert.alert(
              'Could not save that',
              `${detail}\n\nThe change was undone.${
                __DEV__ ? `\n\n(${apiBaseUrl})` : ''
              }`,
            );
            // Surfaced for whoever is plugged into Metro's logs, in addition to
            // the alert — the alert is necessarily terse, this doesn't have to
            // be.
            console.warn('Drag commit failed after retry:', firstError, retryError);
          }
        }
      })();
    },
    [upsertEvent],
  );

  if (!data) return null;

  const categories = categoryMap(data.categories);
  const people = new Map<string, User>(data.me.members.map((m) => [m.id, m]));
  const viewerId = data.me.user.id;
  const showNow = isSameDay(anchor, new Date());

  return (
    <View style={styles.screen}>
      {/* A week strip instead of a week grid: it gives the same "where am I in
          the week" context that a 7-column grid would, without squeezing seven
          columns of events into 390pt. */}
      <View style={styles.strip}>
        {week.map((day) => {
          const selected = isSameDay(day.date, anchor);
          return (
            <Pressable
              key={day.key}
              onPress={() => onChangeDay(day.date)}
              style={styles.stripDay}
            >
              <Text style={[styles.stripName, selected && styles.stripNameOn]}>
                {format(day.date, 'EEEEE')}
              </Text>
              <View style={[styles.stripPill, selected && styles.stripPillOn]}>
                <Text style={[styles.stripNum, selected && styles.stripNumOn]}>
                  {day.dayOfMonth}
                </Text>
              </View>
              {day.isToday && !selected && <View style={styles.todayTick} />}
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ height: DAY_HEIGHT }}
        // A live drag holds the touch itself (see DraggableEventBlock); the
        // scroll would otherwise still track a *second* finger. Locking it
        // out entirely for the duration is simpler than reasoning about that.
        scrollEnabled={!dragging}
      >
        <View
          style={styles.canvas}
          onLayout={(layoutEvent) =>
            setCanvasWidth(layoutEvent.nativeEvent.layout.width)
          }
        >
          {hours.map((slot) => (
            <View key={slot.hour} style={[styles.hourRow, { height: HOUR_HEIGHT }]}>
              <Text style={styles.hourLabel}>{slot.hour === 0 ? '' : slot.label}</Text>
              <Pressable
                style={styles.hourSlot}
                onPress={() => {
                  const start = new Date(anchor);
                  start.setHours(slot.hour, 0, 0, 0);
                  onCreateAt(start);
                }}
              />
            </View>
          ))}

          {/* Nothing to position until the canvas has been measured. */}
          {canvasWidth > 0 &&
            positioned.map((item) => {
            const secret = isHiddenSurprise(item.event, viewerId);
            return (
              <DraggableEventBlock
                key={item.event.id}
                item={item}
                dayHeightPx={DAY_HEIGHT}
                gutterPx={GUTTER}
                contentWidthPx={Math.max(canvasWidth - GUTTER, 1)}
                color={eventColor(item.event, categories)}
                personColor={personColor(item.event, people)}
                title={item.event.title}
                secret={secret}
                timeLabel={format(new Date(item.event.startsAt), 'HH:mm')}
                canEdit={canEditEvent(item.event, viewerId)}
                onPress={() => onSelectEvent(item.event)}
                onDragStart={handleDragStart}
                onDragSettled={handleDragSettled}
                onDragCommit={handleDragCommit}
              />
            );
          })}

          {showNow && <NowLine />}
        </View>
      </ScrollView>
    </View>
  );
}

function NowLine() {
  const top = fractionOfDay(new Date()) * DAY_HEIGHT;
  return (
    <View style={[styles.now, { top }]} pointerEvents="none">
      <View style={styles.nowKnob} />
      <View style={styles.nowRule} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  strip: {
    flexDirection: 'row',
    paddingHorizontal: space.sm,
    paddingBottom: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  stripDay: { flex: 1, alignItems: 'center', gap: 2 },
  stripName: { ...type.label, color: colors.muted },
  stripNameOn: { color: colors.ink },
  stripPill: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripPillOn: { backgroundColor: colors.primary },
  stripNum: { fontSize: 14, fontWeight: '600', color: colors.ink },
  stripNumOn: { color: colors.onInk },
  todayTick: {
    position: 'absolute',
    bottom: -2,
    width: 4,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },

  canvas: { flex: 1 },
  hourRow: { flexDirection: 'row', alignItems: 'flex-start' },
  hourLabel: {
    width: GUTTER,
    marginTop: -7,
    paddingRight: space.sm,
    textAlign: 'right',
    fontSize: 11,
    color: colors.muted,
  },
  hourSlot: { flex: 1, height: '100%', borderTopWidth: 1, borderTopColor: colors.border },

  now: { position: 'absolute', left: GUTTER - 4, right: 0, flexDirection: 'row', alignItems: 'center' },
  nowKnob: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: '#DC2626' },
  nowRule: { flex: 1, height: 1.5, backgroundColor: '#DC2626' },
});
