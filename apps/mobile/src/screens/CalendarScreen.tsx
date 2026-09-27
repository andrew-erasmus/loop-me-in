import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  categoryMap,
  format,
  navigate,
  scheduledItemsByEventId,
  type CalendarEvent,
  type DatedView,
  type User,
} from '@date-calendar/core';
import EventFormSheet from '../components/EventFormSheet';
import EventSheet from '../components/EventSheet';
import { useStore } from '../lib/store';
import AgendaScreen from './AgendaScreen';
import DayScreen from './DayScreen';
import MonthScreen from './MonthScreen';
import { colors, radius, space, type } from '../theme';

/**
 * The calendar tab: a view switcher, a period control, and whichever view is
 * selected — plus the event sheets, which all three share.
 *
 * **Week is deliberately absent.** Seven columns on a 390pt screen is about
 * 50pt each: too narrow for a title, and far too narrow to tap an event inside
 * reliably. Day view carries a week strip along the top instead, which gives
 * the same "where am I in the week" orientation and still leaves the full
 * width for the events themselves.
 */

/** The views that make sense at this width. */
const VIEWS = ['month', 'day', 'agenda'] as const;
type MobileView = (typeof VIEWS)[number];

const LABELS: Record<MobileView, string> = {
  month: 'Month',
  day: 'Day',
  agenda: 'Agenda',
};

export default function CalendarScreen() {
  const { data, ensureRange, removeEvent, upsertEvent } = useStore();

  const [view, setView] = useState<MobileView>('agenda');
  const [anchor, setAnchor] = useState(() => new Date());
  const [open, setOpen] = useState<CalendarEvent | null>(null);
  /** The event being edited, `'new'` while creating, or a start time to seed. */
  const [editing, setEditing] = useState<CalendarEvent | 'new' | null>(null);
  const [seed, setSeed] = useState<Date | undefined>(undefined);

  if (!data) return null;

  const step = (direction: 1 | -1) => {
    const next = navigate(anchor, view as DatedView, direction);
    setAnchor(next);
    // Paging past the edge of what has been fetched widens the window rather
    // than showing an empty month.
    ensureRange(next, next);
  };

  const openDay = (day: Date) => {
    setAnchor(day);
    setView('day');
  };

  const createAt = (start: Date) => {
    setSeed(start);
    setEditing('new');
  };

  const categories = categoryMap(data.categories);
  const people = new Map<string, User>(data.me.members.map((m) => [m.id, m]));
  const itemsByEvent = scheduledItemsByEventId(data.items);
  const viewerId = data.me.user.id;

  return (
    <View style={styles.screen}>
      <View style={styles.bar}>
        <Pressable onPress={() => step(-1)} hitSlop={10} style={styles.arrow}>
          <Text style={styles.arrowText}>‹</Text>
        </Pressable>

        <Pressable
          onPress={() => setAnchor(new Date())}
          style={styles.period}
          accessibilityLabel="Jump to today"
        >
          <Text style={styles.periodText}>
            {view === 'day' ? format(anchor, 'd MMM yyyy') : format(anchor, 'MMMM yyyy')}
          </Text>
        </Pressable>

        <Pressable onPress={() => step(1)} hitSlop={10} style={styles.arrow}>
          <Text style={styles.arrowText}>›</Text>
        </Pressable>
      </View>

      <View style={styles.switcher}>
        {VIEWS.map((option) => (
          <Pressable
            key={option}
            onPress={() => setView(option)}
            style={[styles.segment, view === option && styles.segmentOn]}
          >
            <Text style={[styles.segmentText, view === option && styles.segmentTextOn]}>
              {LABELS[option]}
            </Text>
          </Pressable>
        ))}
      </View>

      {view === 'month' ? (
        <MonthScreen anchor={anchor} onSelectDay={openDay} />
      ) : view === 'day' ? (
        <DayScreen
          anchor={anchor}
          onChangeDay={setAnchor}
          onSelectEvent={setOpen}
          onCreateAt={createAt}
        />
      ) : (
        <AgendaScreen anchor={anchor} onSelectEvent={setOpen} />
      )}

      <Pressable
        onPress={() => {
          setSeed(undefined);
          setEditing('new');
        }}
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        accessibilityLabel="New event"
      >
        <Text style={styles.fabGlyph}>+</Text>
      </Pressable>

      {open && (
        <EventSheet
          event={open}
          categories={categories}
          people={people}
          viewerId={viewerId}
          sourceItem={itemsByEvent.get(open.id)}
          sourceList={data.lists.find(
            (l) => l.id === itemsByEvent.get(open.id)?.listId,
          )}
          onClose={() => setOpen(null)}
          onDeleted={removeEvent}
          onEdit={() => {
            // Hand straight over to the form: closing the detail sheet first
            // would play its exit animation under the one sliding in.
            setEditing(open);
            setOpen(null);
          }}
        />
      )}

      {editing && (
        <EventFormSheet
          {...(editing !== 'new' ? { event: editing } : {})}
          {...(seed ? { initialStart: seed } : {})}
          categories={data.categories}
          canChooseVisibility={data.me.members.length > 1}
          onClose={() => {
            setEditing(null);
            setSeed(undefined);
          }}
          onSaved={upsertEvent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
  arrow: { paddingHorizontal: space.sm },
  arrowText: { fontSize: 26, color: colors.muted, lineHeight: 30 },
  period: { flex: 1, alignItems: 'center' },
  periodText: { ...type.heading, color: colors.ink },

  switcher: {
    flexDirection: 'row',
    marginHorizontal: space.lg,
    marginBottom: space.md,
    padding: 3,
    borderRadius: radius.md,
    backgroundColor: colors.wash,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.sm,
    borderRadius: radius.sm,
  },
  segmentOn: { backgroundColor: colors.surface },
  segmentText: { ...type.small, fontWeight: '600', color: colors.muted },
  segmentTextOn: { color: colors.ink },

  fab: {
    position: 'absolute',
    right: space.lg,
    bottom: space.lg,
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabPressed: { opacity: 0.85 },
  fabGlyph: { color: colors.onInk, fontSize: 34, lineHeight: 38, fontWeight: '300' },
});
