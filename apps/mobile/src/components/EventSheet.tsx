import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { faGift, faLock } from '@fortawesome/free-solid-svg-icons';
import {
  eventColor,
  format,
  isHiddenSurprise,
  type CalendarEvent,
  type Category,
  type List,
  type ListItem,
  type User,
} from '@date-calendar/core';
import { api } from '../lib/api';
import Icon from './Icon';
import Sheet from './Sheet';
import { colors, radius, space, type } from '../theme';

/**
 * What you get when you tap an event.
 *
 * Read-only apart from delete. Editing times on a phone wants a native date
 * picker and a keyboard-avoiding form — worth doing, but not worth stubbing
 * badly here; the web app does it properly in the meantime.
 */
export default function EventSheet({
  event,
  categories,
  people,
  viewerId,
  sourceItem,
  sourceList,
  onClose,
  onDeleted,
  onEdit,
}: {
  event: CalendarEvent;
  categories: Map<string, Category>;
  people: Map<string, User>;
  viewerId: string;
  sourceItem: ListItem | undefined;
  sourceList: List | undefined;
  onClose: () => void;
  onDeleted: (eventId: string) => void;
  onEdit: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const secret = isHiddenSurprise(event, viewerId);
  const planner = event.createdBy ? people.get(event.createdBy) : undefined;
  const category = event.categoryId ? categories.get(event.categoryId) : undefined;
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.deleteEvent(event.id);
      onDeleted(event.id);
      onClose();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : 'Could not delete it.',
      );
      setBusy(false);
    }
  };

  return (
    <Sheet onClose={onClose}>
      <>
          {secret ? (
            <View style={styles.secret}>
              <Icon icon={faGift} size="lg" color={colors.border} />
              <Text style={styles.title}>It’s a surprise</Text>
              <Text style={styles.body}>
                {planner ? `${planner.name} has planned something.` : 'Something is planned.'}
              </Text>
              <Text style={styles.hint}>
                You can see the time is taken so you don’t book over it — nothing else
                about it was sent to your phone.
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.title}>{event.title}</Text>

              <Text style={styles.when}>
                {format(start, 'EEEE d MMMM')}
                {'\n'}
                {event.allDay
                  ? 'All day'
                  : `${format(start, 'HH:mm')} – ${format(end, 'HH:mm')}`}
              </Text>

              <View style={styles.meta}>
                <View
                  style={[styles.dot, { backgroundColor: eventColor(event, categories) }]}
                />
                <Text style={styles.metaText}>{category?.name ?? 'No category'}</Text>
                {planner && <Text style={styles.metaText}>· {planner.name}</Text>}
                {event.visibility === 'surprise' && (
                  <View style={styles.metaTag}>
                    <Icon icon={faGift} size="xs" color={colors.muted} />
                    <Text style={styles.metaText}>your surprise</Text>
                  </View>
                )}
                {event.visibility === 'private' && (
                  <View style={styles.metaTag}>
                    <Icon icon={faLock} size="xs" color={colors.muted} />
                    <Text style={styles.metaText}>only you</Text>
                  </View>
                )}
              </View>

              {sourceItem && (
                <View style={styles.from}>
                  <Text style={styles.fromText}>
                    {sourceList?.emoji ?? '📋'} From {sourceList?.name ?? 'a list'}
                  </Text>
                </View>
              )}

              {event.notes ? <Text style={styles.notes}>{event.notes}</Text> : null}
            </>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.actions}>
        {!secret && (
          <>
            <Pressable
              disabled={busy}
              onPress={confirming ? remove : () => setConfirming(true)}
              style={[styles.action, confirming && styles.actionDanger]}
            >
              <Text style={[styles.actionText, confirming && styles.actionTextDanger]}>
                {confirming ? 'Really delete?' : 'Delete'}
              </Text>
            </Pressable>
            <Pressable onPress={onEdit} style={[styles.action, styles.actionGhost]}>
              <Text style={styles.actionText}>Edit</Text>
            </Pressable>
          </>
        )}
        <Pressable onPress={onClose} style={[styles.action, styles.actionPrimary]}>
          <Text style={[styles.actionText, styles.actionTextPrimary]}>Close</Text>
        </Pressable>
      </View>

      {sourceItem && !secret && (
        <Text style={styles.hint}>
          Deleting this takes it off the calendar but leaves it on the list.
        </Text>
      )}
      </>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  title: { ...type.heading, color: colors.ink },
  when: { ...type.body, color: colors.body, lineHeight: 22 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexWrap: 'wrap' },
  dot: { width: 10, height: 10, borderRadius: radius.pill },
  metaText: { ...type.small, color: colors.muted },
  metaTag: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  from: {
    alignSelf: 'flex-start',
    backgroundColor: colors.wash,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
  },
  fromText: { ...type.small, color: colors.body },
  notes: { ...type.small, color: colors.body, lineHeight: 20 },
  secret: { alignItems: 'center', gap: space.sm, paddingVertical: space.md },
  body: { ...type.body, color: colors.body, textAlign: 'center' },
  hint: { ...type.small, color: colors.muted, textAlign: 'center', lineHeight: 18 },
  error: { ...type.small, color: '#B91C1C' },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  action: {
    flex: 1,
    paddingVertical: space.lg,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    backgroundColor: colors.wash,
  },
  actionPrimary: { backgroundColor: colors.primary },
  actionGhost: { backgroundColor: colors.wash },
  actionDanger: { backgroundColor: '#B91C1C' },
  actionText: { ...type.body, fontSize: 16, fontWeight: '600', color: colors.body },
  actionTextPrimary: { color: colors.onInk },
  actionTextDanger: { color: colors.onInk },
});
