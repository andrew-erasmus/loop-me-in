import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { faGift } from '@fortawesome/free-solid-svg-icons';
import {
  categoryMap,
  dayKey,
  eventColor,
  getMonthGrid,
  getWeekdayNames,
  groupByDay,
  isHiddenSurprise,
  type CalendarEvent,
  type Category,
} from '@date-calendar/core';
import Icon from '../components/Icon';
import { useStore } from '../lib/store';
import { colors, radius, space, type } from '../theme';

/**
 * A month grid, phone-sized.
 *
 * Titles do not fit in a 50pt cell, so each day shows coloured dots instead —
 * the standard phone compromise, and the reason this view works here while a
 * week grid does not. Tapping a day opens it in Day view, which is where the
 * detail lives.
 *
 * The grid itself is `getMonthGrid` from core, unchanged — including its
 * leading and trailing days from the neighbouring months.
 */

const MAX_DOTS = 4;

export default function MonthScreen({
  anchor,
  onSelectDay,
}: {
  anchor: Date;
  onSelectDay: (day: Date) => void;
}) {
  const { data } = useStore();

  const grid = useMemo(() => getMonthGrid(anchor), [anchor]);
  const byDay = useMemo(() => groupByDay(data?.events ?? []), [data?.events]);

  if (!data) return null;

  const categories = categoryMap(data.categories);
  const viewerId = data.me.user.id;
  const weekdays = getWeekdayNames();

  return (
    <View style={styles.screen}>
      <View style={styles.weekdays}>
        {weekdays.map((name) => (
          <Text key={name} style={styles.weekday}>
            {name.slice(0, 1)}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {grid.map((week, index) => (
          <View key={index} style={styles.week}>
            {week.map((day) => {
              const events = byDay.get(dayKey(day.date)) ?? [];
              return (
                <Pressable
                  key={day.key}
                  onPress={() => onSelectDay(day.date)}
                  style={({ pressed }) => [
                    styles.cell,
                    day.isWeekend && styles.cellWeekend,
                    pressed && styles.cellPressed,
                  ]}
                >
                  <View style={[styles.number, day.isToday && styles.numberToday]}>
                    <Text
                      style={[
                        styles.numberText,
                        !day.inMonth && styles.numberMuted,
                        day.isToday && styles.numberTextToday,
                      ]}
                    >
                      {day.dayOfMonth}
                    </Text>
                  </View>

                  <View style={styles.dots}>
                    {events.slice(0, MAX_DOTS).map((event, index) => (
                      <Dot
                        key={`${event.id}-${index}`}
                        event={event}
                        categories={categories}
                        viewerId={viewerId}
                      />
                    ))}
                    {events.length > MAX_DOTS && (
                      <Text style={styles.more}>+{events.length - MAX_DOTS}</Text>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

function Dot({
  event,
  categories,
  viewerId,
}: {
  event: CalendarEvent;
  categories: Map<string, Category>;
  viewerId: string;
}) {
  // A surprise that isn't yours arrives with no category, so it would otherwise
  // be an anonymous grey dot — the gift glyph says the slot is spoken for.
  if (isHiddenSurprise(event, viewerId)) {
    return <Icon icon={faGift} size="xs" color={colors.muted} />;
  }
  return (
    <View style={[styles.dot, { backgroundColor: eventColor(event, categories) }]} />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: space.sm },
  weekdays: { flexDirection: 'row', paddingBottom: space.sm },
  weekday: { ...type.label, color: colors.muted, flex: 1, textAlign: 'center' },
  grid: { flex: 1 },
  week: { flex: 1, flexDirection: 'row' },
  cell: {
    flex: 1,
    alignItems: 'center',
    paddingTop: space.xs,
    gap: space.xs,
    borderRadius: radius.sm,
  },
  cellWeekend: { backgroundColor: colors.wash },
  cellPressed: { backgroundColor: colors.border },
  number: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberToday: { backgroundColor: colors.primary },
  numberText: { fontSize: 13, fontWeight: '600', color: colors.ink },
  numberTextToday: { color: colors.onInk },
  numberMuted: { color: colors.muted, fontWeight: '400' },
  dots: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
  },
  dot: { width: 5, height: 5, borderRadius: radius.pill },
  more: { fontSize: 8, color: colors.muted, fontWeight: '700' },
});
