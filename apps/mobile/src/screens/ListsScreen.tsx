import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  faCalendarDays,
  faCheck,
  faHeart,
  faThumbsUp,
  faWandMagicSparkles,
} from '@fortawesome/free-solid-svg-icons';
import {
  format,
  formatAge,
  groupItemsByList,
  isDone,
  isStale,
  itemKeenness,
  pendingCount,
  type Keenness,
  type List,
  type ListItem,
  type User,
} from '@date-calendar/core';
import Icon from '../components/Icon';
import ListItemFormSheet from '../components/ListItemFormSheet';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import { colors, radius, space, type } from '../theme';

/**
 * Lists, on a phone.
 *
 * The web puts the lists in a left rail; there is no room for that here, so
 * they become a horizontal strip of chips above the items. The grouping,
 * ordering and keenness all still come from `@date-calendar/core` — only the
 * arrangement differs.
 *
 * Adding, editing and scheduling all go through the same `ListItemFormSheet`,
 * the way the web routes them through one `ListItemModal` — a new item and an
 * existing one differ only in whether `item` is passed in.
 */

/** What the form sheet is open for, if anything. */
type FormTarget = { list: List; item?: ListItem } | null;

const EFFORT_LABELS: Record<string, string> = { low: 'Low effort', medium: 'Medium effort', high: 'High effort' };
const COST_SYMBOLS: Record<string, string> = { low: '$', medium: '$$', high: '$$$' };

export default function ListsScreen() {
  const { data, refreshing, refresh, replaceItem, insertItem, removeItem, upsertEvent, removeEvent } =
    useStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [form, setForm] = useState<FormTarget>(null);

  const itemsByList = useMemo(
    () => groupItemsByList(data?.items ?? []),
    [data?.items],
  );

  const memberIds = useMemo(() => data?.me.members.map((m) => m.id) ?? [], [data]);

  /**
   * A short haptic + pulse the moment both of you become keen on something —
   * only on the transition into unanimous, never on load. Mirrors the web
   * behaviour in `ListsView.tsx`.
   */
  const previousKeennessRef = useRef<Map<string, Keenness>>(new Map());
  const [celebrating, setCelebrating] = useState<Set<string>>(new Set());

  useEffect(() => {
    const previous = previousKeennessRef.current;
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    for (const item of data?.items ?? []) {
      const keenness = itemKeenness(item, memberIds);
      const was = previous.get(item.id);
      if (was !== undefined && was !== 'all' && keenness === 'all') {
        setCelebrating((current) => new Set(current).add(item.id));
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        timeouts.push(
          setTimeout(() => {
            setCelebrating((current) => {
              if (!current.has(item.id)) return current;
              const next = new Set(current);
              next.delete(item.id);
              return next;
            });
          }, 700),
        );
      }
      previous.set(item.id, keenness);
    }

    return () => timeouts.forEach(clearTimeout);
  }, [data?.items, memberIds]);

  if (!data) return null;

  const lists = data.lists;
  const selected = lists.find((l) => l.id === selectedId) ?? lists[0];
  const items = selected ? (itemsByList.get(selected.id) ?? []) : [];
  const people = new Map(data.me.members.map((m) => [m.id, m]));
  const viewerId = data.me.user.id;

  /** Tick off / un-tick. The server returns the updated row; trust that. */
  const toggleDone = async (item: ListItem) => {
    setBusyId(item.id);
    try {
      replaceItem(
        await api.updateItem(item.id, {
          doneAt: isDone(item) ? null : new Date().toISOString(),
        }),
      );
    } finally {
      setBusyId(null);
    }
  };

  const toggleVote = async (item: ListItem) => {
    setBusyId(item.id);
    try {
      replaceItem(await api.setItemVote(item.id, !item.votes.includes(viewerId)));
    } finally {
      setBusyId(null);
    }
  };

  if (lists.length === 0) {
    return (
      <View style={styles.centred}>
        <Icon icon={faWandMagicSparkles} size="lg" color={colors.border} />
        <Text style={styles.emptyTitle}>No lists yet</Text>
        <Text style={styles.emptyBody}>Make one on the web app to see it here.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipBar}
        contentContainerStyle={styles.chips}
      >
        {lists.map((list) => {
          const active = selected?.id === list.id;
          const outstanding = pendingCount(itemsByList.get(list.id) ?? []);
          return (
            <Pressable
              key={list.id}
              onPress={() => setSelectedId(list.id)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={styles.chipEmoji}>{list.emoji ?? '•'}</Text>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {list.name}
              </Text>
              {outstanding > 0 && (
                <Text style={[styles.chipCount, active && styles.chipCountActive]}>
                  {outstanding}
                </Text>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      {selected && (
        <View style={styles.header}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {selected.emoji ?? '📋'} {selected.name}
          </Text>
          <Pressable
            onPress={() => setForm({ list: selected })}
            style={styles.addButton}
            hitSlop={8}
          >
            <Text style={styles.addButtonText}>Add</Text>
          </Pressable>
        </View>
      )}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={
          items.length === 0 ? styles.emptyContainer : styles.listContent
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.muted} />
        }
        ListEmptyComponent={
          <View style={styles.centred}>
            <Text style={styles.emptyGlyph}>{selected?.emoji ?? '📋'}</Text>
            <Text style={styles.emptyTitle}>Nothing here yet</Text>
            {selected && (
              <Pressable onPress={() => setForm({ list: selected })} style={styles.emptyAdd}>
                <Text style={styles.emptyAddText}>Add the first thing</Text>
              </Pressable>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <ItemRow
            item={item}
            people={people}
            memberIds={memberIds}
            viewerId={viewerId}
            busy={busyId === item.id}
            justMatched={celebrating.has(item.id)}
            onPress={() => selected && setForm({ list: selected, item })}
            onToggleDone={() => void toggleDone(item)}
            onToggleVote={() => void toggleVote(item)}
          />
        )}
      />

      {form && (
        <ListItemFormSheet
          list={form.list}
          {...(form.item ? { item: form.item } : {})}
          onClose={() => setForm(null)}
          onSaved={(saved) => {
            if (form.item) replaceItem(saved);
            else insertItem(saved);
          }}
          onDeleted={(itemId) => removeItem(itemId)}
          onScheduled={(item, event) => {
            replaceItem(item);
            upsertEvent(event);
          }}
          onUnscheduled={(item, previousEventId) => {
            replaceItem(item);
            if (previousEventId) removeEvent(previousEventId);
          }}
        />
      )}
    </View>
  );
}

function ItemRow({
  item,
  people,
  memberIds,
  viewerId,
  busy,
  justMatched,
  onPress,
  onToggleDone,
  onToggleVote,
}: {
  item: ListItem;
  people: Map<string, User>;
  memberIds: string[];
  viewerId: string;
  busy: boolean;
  justMatched: boolean;
  onPress: () => void;
  onToggleDone: () => void;
  onToggleVote: () => void;
}) {
  const done = isDone(item);
  const keenness = itemKeenness(item, memberIds);
  const iAmKeen = item.votes.includes(viewerId);
  const stale = isStale(item);

  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!justMatched) return;
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.25, useNativeDriver: true, speed: 30 }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 14 }),
    ]).start();
  }, [justMatched, scale]);

  return (
    <View style={[styles.row, done && styles.rowDone, busy && styles.rowBusy]}>
      <Pressable onPress={onToggleDone} hitSlop={8} style={styles.check}>
        <View style={[styles.checkBox, done && styles.checkBoxDone]}>
          {done && <Icon icon={faCheck} size="xs" color={colors.onInk} />}
        </View>
      </Pressable>

      <Pressable onPress={onPress} style={styles.rowBody}>
        <Text style={[styles.rowTitle, done && styles.rowTitleDone]} numberOfLines={2}>
          {item.title}
        </Text>
        {item.notes ? (
          <Text style={styles.rowNotes} numberOfLines={1}>
            {item.notes}
          </Text>
        ) : null}
        {(item.effort || item.cost) && (
          <View style={styles.tagLine}>
            {item.effort && <Text style={styles.tagBadge}>{EFFORT_LABELS[item.effort]}</Text>}
            {item.cost && <Text style={styles.tagBadge}>{COST_SYMBOLS[item.cost]}</Text>}
          </View>
        )}
        {item.scheduledAt && (
          <View style={styles.scheduledLine}>
            <Icon icon={faCalendarDays} size="xs" color={colors.body} />
            <Text style={styles.scheduled}>
              {format(new Date(item.scheduledAt), 'EEE d MMM, HH:mm')}
            </Text>
          </View>
        )}
        {stale && !item.scheduledAt && (
          <Text style={styles.staleBadge}>{formatAge(item)}</Text>
        )}
      </Pressable>

      {/* Both keen lights up green — the cue that it is worth a date. */}
      <Pressable onPress={onToggleVote} hitSlop={8}>
        <Animated.View
          style={[
            styles.vote,
            keenness === 'all' && styles.voteAll,
            keenness !== 'all' && iAmKeen && styles.voteMine,
            { transform: [{ scale }] },
          ]}
        >
          <Icon
            icon={keenness === 'all' ? faHeart : faThumbsUp}
            size="xs"
            color={keenness === 'all' ? '#059669' : colors.body}
          />
          {item.votes.length > 0 && (
            <View style={styles.voters}>
              {item.votes.map((id) => {
                const voter = people.get(id);
                return voter ? (
                  <View
                    key={id}
                    style={[styles.voterDot, { backgroundColor: voter.color }]}
                  />
                ) : null;
              })}
            </View>
          )}
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  // A horizontal ScrollView inside a flex column will happily grow to fill the
  // whole screen, and its children stretch to match — which turns pill-shaped
  // chips into full-height ovals. `flexGrow: 0` keeps the bar at its content
  // height; `alignItems: center` stops the chips stretching inside it.
  chipBar: { flexGrow: 0, flexShrink: 0 },
  chips: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.sm,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.wash,
  },
  chipActive: { backgroundColor: colors.primary },
  chipEmoji: { fontSize: 14 },
  chipText: { ...type.small, fontWeight: '600', color: colors.body },
  chipTextActive: { color: colors.onInk },
  chipCount: { ...type.small, color: colors.muted },
  chipCountActive: { color: colors.border },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
  headerTitle: { ...type.heading, color: colors.ink, flex: 1, marginRight: space.md },
  addButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
    borderRadius: radius.pill,
    minHeight: 44,
    justifyContent: 'center',
  },
  addButtonText: { ...type.body, fontWeight: '700', color: colors.onInk },

  listContent: { paddingBottom: space.xxl },
  emptyContainer: { flexGrow: 1 },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm },
  emptyGlyph: { fontSize: 40 },
  emptyTitle: { ...type.heading, color: colors.ink },
  emptyBody: { ...type.small, color: colors.muted },
  emptyAdd: {
    marginTop: space.sm,
    backgroundColor: colors.primary,
    paddingHorizontal: space.xl,
    paddingVertical: space.lg,
    borderRadius: radius.sm,
    minHeight: 52,
    justifyContent: 'center',
  },
  emptyAddText: { ...type.body, fontWeight: '700', color: colors.onInk },

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
  rowDone: { opacity: 0.5 },
  rowBusy: { opacity: 0.4 },
  check: { padding: 2 },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBoxDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { ...type.body, color: colors.ink },
  rowTitleDone: { textDecorationLine: 'line-through' },
  rowNotes: { ...type.small, color: colors.muted },
  scheduledLine: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  scheduled: { ...type.small, color: colors.body },
  staleBadge: {
    ...type.small,
    color: '#B45309',
    backgroundColor: '#FEF3C7',
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  tagLine: { flexDirection: 'row', gap: space.xs, marginTop: 4 },
  tagBadge: {
    ...type.small,
    fontSize: 10,
    fontWeight: '700',
    color: colors.muted,
    backgroundColor: colors.wash,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },

  vote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.wash,
  },
  voteAll: { backgroundColor: '#D1FAE5' },
  voteMine: { backgroundColor: colors.wash },
  voters: { flexDirection: 'row', marginLeft: 2 },
  voterDot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    marginLeft: -4,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
});
