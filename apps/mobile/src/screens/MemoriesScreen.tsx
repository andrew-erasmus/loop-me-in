import { useMemo } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';
import { faClockRotateLeft } from '@fortawesome/free-solid-svg-icons';
import { format, groupMemoriesByMonth, listsById, memoryAt } from '@date-calendar/core';
import Icon from '../components/Icon';
import { useStore } from '../lib/store';
import { colors, radius, space, type } from '../theme';

/**
 * Completed plans, most recent first — the mobile sibling of the web's
 * `MemoriesView`. Grouping comes from `@date-calendar/core`, `SectionList`
 * just turns each group into a header.
 */

export default function MemoriesScreen() {
  const { data } = useStore();

  const listIndex = useMemo(() => listsById(data?.lists ?? []), [data?.lists]);
  const groups = useMemo(() => groupMemoriesByMonth(data?.items ?? []), [data?.items]);

  if (!data) return null;

  if (groups.length === 0) {
    return (
      <View style={styles.centred}>
        <Icon icon={faClockRotateLeft} size="lg" color={colors.border} />
        <Text style={styles.emptyTitle}>No memories yet</Text>
        <Text style={styles.emptyBody}>
          Tick something off, or let a scheduled plan's date arrive.
        </Text>
      </View>
    );
  }

  return (
    <SectionList
      sections={groups.map((group) => ({ title: group.label, data: group.items }))}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.content}
      renderSectionHeader={({ section }) => (
        <Text style={styles.sectionHeader}>{section.title}</Text>
      )}
      renderItem={({ item }) => {
        const list = listIndex.get(item.listId);
        const at = memoryAt(item);
        return (
          <View style={styles.row}>
            <View
              style={[styles.emoji, { backgroundColor: `${list?.color ?? colors.border}22` }]}
            >
              <Text style={styles.emojiText}>{list?.emoji ?? '•'}</Text>
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={styles.rowList}>{list?.name ?? 'Deleted list'}</Text>
            </View>
            {at && <Text style={styles.rowDate}>{format(new Date(at), 'd MMM')}</Text>}
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.sm },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm },
  emptyTitle: { ...type.heading, color: colors.ink },
  emptyBody: { ...type.small, color: colors.muted, textAlign: 'center', maxWidth: 260 },

  sectionHeader: {
    ...type.heading,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.sunken,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    marginBottom: space.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emoji: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiText: { fontSize: 16 },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { ...type.body, color: colors.ink },
  rowList: { ...type.small, color: colors.muted },
  rowDate: { ...type.small, fontWeight: '700', color: colors.muted },
});
