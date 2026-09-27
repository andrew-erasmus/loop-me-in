import { useMemo } from 'react';
import {
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { faGift, faSun } from '@fortawesome/free-solid-svg-icons';
import {
  categoryMap,
  dayKey,
  eventColor,
  format,
  getViewRange,
  groupByDay,
  isHiddenSurprise,
  isSameDay,
  personColor,
  type CalendarEvent,
  type Category,
  type User,
} from '@date-calendar/core';
import Icon from '../components/Icon';
import { useStore } from '../lib/store';
import { colors, radius, space, type } from '../theme';

/**
 * The month ahead as a list.
 *
 * A phone gets an agenda rather than a grid: seven columns on a 390pt screen is
 * about 50pt each, which is unreadable and undraggable. The *data* work is
 * identical to the web though — `getViewRange` picks the window, `groupByDay`
 * buckets it, `eventColor` resolves the colour. None of it is reimplemented.
 */

interface Section {
  title: string;
  date: Date;
  data: CalendarEvent[];
}

export default function AgendaScreen({
  anchor,
  onSelectEvent,
}: {
  anchor: Date;
  onSelectEvent: (event: CalendarEvent) => void;
}) {
  const { data, refreshing, refresh } = useStore();

  const sections = useMemo<Section[]>(() => {
    if (!data) return [];

    const byDay = groupByDay(data.events);
    const range = getViewRange(anchor, 'agenda');

    // Walk the window and keep only days with something on them — an agenda of
    // empty days is just a list of dates.
    const out: Section[] = [];
    const cursor = new Date(range.from);
    while (cursor <= range.to) {
      const key = dayKey(cursor);
      const events = byDay.get(key);
      if (events?.length) out.push({ title: key, date: new Date(cursor), data: events });
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  }, [data, anchor]);

  if (!data) return null;

  const categories = categoryMap(data.categories);
  const people = new Map<string, User>(data.me.members.map((m) => [m.id, m]));
  const viewerId = data.me.user.id;

  return (
    <View style={styles.screen}>
      <SectionList
        sections={sections}
        keyExtractor={(event, index) => `${event.id}-${index}`}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={
          sections.length === 0 ? styles.emptyContainer : styles.listContent
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.muted} />
        }
        ListEmptyComponent={
          <View style={styles.centred}>
            <Icon icon={faSun} size="lg" color={colors.border} />
            <Text style={styles.emptyTitle}>A clear month</Text>
            <Text style={styles.emptyBody}>Nothing scheduled yet.</Text>
          </View>
        }
        renderSectionHeader={({ section }) => <DayHeader date={section.date} />}
        renderItem={({ item }) => (
          <EventRow
            event={item}
            categories={categories}
            people={people}
            viewerId={viewerId}
            onPress={() => onSelectEvent(item)}
          />
        )}
      />

    </View>
  );
}

function DayHeader({ date }: { date: Date }) {
  const today = isSameDay(date, new Date());
  return (
    <View style={styles.dayHeader}>
      <Text style={styles.dayName}>{format(date, 'EEEE')}</Text>
      <Text style={styles.dayDate}>{today ? 'Today' : format(date, 'd MMM')}</Text>
    </View>
  );
}

function EventRow({
  event,
  categories,
  people,
  viewerId,
  onPress,
}: {
  event: CalendarEvent;
  categories: Map<string, Category>;
  people: Map<string, User>;
  viewerId: string;
  onPress: () => void;
}) {
  // The server has already stripped a surprise that isn't yours; this only
  // decides how to present what arrived.
  const secret = isHiddenSurprise(event, viewerId);
  const planner = event.createdBy ? people.get(event.createdBy) : undefined;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={[styles.stripe, { backgroundColor: eventColor(event, categories) }]} />

      <View style={styles.rowBody}>
        <View style={styles.rowTitleLine}>
          {secret && <Icon icon={faGift} size="xs" color={colors.muted} />}
          <Text style={styles.rowTitle} numberOfLines={1}>
            {event.title}
          </Text>
        </View>
        <Text style={styles.rowMeta}>
          {event.allDay
            ? 'All day'
            : `${format(new Date(event.startsAt), 'HH:mm')} – ${format(
                new Date(event.endsAt),
                'HH:mm',
              )}`}
          {planner ? `  ·  ${planner.name}` : ''}
        </Text>
      </View>

      <View style={[styles.person, { backgroundColor: personColor(event, people) }]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  listContent: { paddingBottom: space.xxl },
  emptyContainer: { flexGrow: 1 },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm },
  emptyTitle: { ...type.heading, color: colors.ink },
  emptyBody: { ...type.small, color: colors.muted },

  dayHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.xl,
    paddingBottom: space.sm,
  },
  dayName: { ...type.heading, color: colors.ink },
  dayDate: { ...type.label, color: colors.muted },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    padding: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowPressed: { backgroundColor: colors.wash },
  stripe: { width: 3, alignSelf: 'stretch', borderRadius: radius.pill },
  rowBody: { flex: 1, gap: 2 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowTitle: { ...type.body, color: colors.ink, flexShrink: 1 },
  rowMeta: { ...type.small, color: colors.muted },
  person: { width: 10, height: 10, borderRadius: radius.pill },

});
