import { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { faGift, faLock, faUsers, type IconDefinition } from '@fortawesome/free-solid-svg-icons';
import {
  ApiError,
  EVENT_VISIBILITY,
  eventInputSchema,
  format,
  ORPHAN_EVENT_COLOR,
  type CalendarEvent,
  type Category,
  type EventVisibility,
} from '@date-calendar/core';
import { api } from '../lib/api';
import Icon from './Icon';
import Sheet from './Sheet';
import { colors, radius, space, type } from '../theme';

/**
 * Create or edit an event.
 *
 * Validated with `eventInputSchema` — the same schema the server parses the
 * body with and the web form checks against, so all three agree on what a
 * valid event is and there is no third opinion to keep in step.
 */

const VISIBILITY_LABELS: Record<
  EventVisibility,
  { label: string; icon: IconDefinition; help: string }
> = {
  shared: { label: 'Shared', icon: faUsers, help: 'Both of you see this normally.' },
  surprise: {
    label: 'Surprise',
    icon: faGift,
    help: 'They see the time is booked, but not what it is.',
  },
  private: { label: 'Just me', icon: faLock, help: 'Hidden completely.' },
};

export default function EventFormSheet({
  event,
  categories,
  canChooseVisibility,
  initialStart,
  onClose,
  onSaved,
}: {
  /** Absent when creating. */
  event?: CalendarEvent;
  categories: Category[];
  canChooseVisibility: boolean;
  initialStart?: Date;
  onClose: () => void;
  onSaved: (event: CalendarEvent) => void;
}) {
  const [title, setTitle] = useState(event?.title ?? '');
  const [notes, setNotes] = useState(event?.notes ?? '');
  const [allDay, setAllDay] = useState(event?.allDay ?? false);
  const [startsAt, setStartsAt] = useState(() =>
    event ? new Date(event.startsAt) : defaultStart(initialStart),
  );
  const [endsAt, setEndsAt] = useState(() =>
    event
      ? new Date(event.endsAt)
      : new Date(defaultStart(initialStart).getTime() + 60 * 60 * 1000),
  );
  const [categoryId, setCategoryId] = useState(event?.categoryId ?? null);
  const [visibility, setVisibility] = useState<EventVisibility>(
    event?.visibility ?? 'shared',
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Keep the end from drifting behind the start as the start moves. */
  const changeStart = (next: Date) => {
    const duration = Math.max(endsAt.getTime() - startsAt.getTime(), 0);
    setStartsAt(next);
    if (endsAt < next) setEndsAt(new Date(next.getTime() + (duration || 60 * 60 * 1000)));
  };

  const save = async () => {
    setError(null);

    const values = {
      title: title.trim(),
      notes: notes.trim() === '' ? null : notes.trim(),
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      allDay,
      visibility,
      categoryId,
    };

    const parsed = eventInputSchema.safeParse(values);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check the form');
      return;
    }

    setSaving(true);
    try {
      const saved = event
        ? await api.updateEvent(event.id, values)
        : await api.createEvent(values);
      onSaved(saved);
      onClose();
    } catch (saveError) {
      setError(
        saveError instanceof ApiError ? saveError.message : 'Could not save the event.',
      );
      setSaving(false);
    }
  };

  return (
    <Sheet onClose={onClose}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.content}
      >
        <Text style={styles.title}>{event ? 'Edit event' : 'New event'}</Text>

        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="What's happening?"
          placeholderTextColor={colors.muted}
          style={styles.input}
          autoFocus={!event}
          returnKeyType="done"
        />

        <View style={styles.switchRow}>
          <Text style={styles.label}>All day</Text>
          <Switch
            value={allDay}
            onValueChange={setAllDay}
            trackColor={{ true: colors.primary, false: colors.border }}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Starts</Text>
          <DateTimePicker
            value={startsAt}
            mode={allDay ? 'date' : 'datetime'}
            display={Platform.OS === 'ios' ? 'compact' : 'default'}
            onChange={(_, date) => date && changeStart(date)}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Ends</Text>
          <DateTimePicker
            value={endsAt}
            mode={allDay ? 'date' : 'datetime'}
            display={Platform.OS === 'ios' ? 'compact' : 'default'}
            onChange={(_, date) => date && setEndsAt(date)}
          />
        </View>

        <Text style={styles.duration}>
          {format(startsAt, 'EEE d MMM')}
          {allDay ? ' · all day' : ` · ${format(startsAt, 'HH:mm')}–${format(endsAt, 'HH:mm')}`}
        </Text>

        <Text style={styles.label}>Category</Text>
        <View style={styles.chips}>
          {categories.map((category) => (
            <Pressable
              key={category.id}
              onPress={() => setCategoryId(category.id)}
              style={[
                styles.chip,
                categoryId === category.id && { backgroundColor: category.color },
              ]}
            >
              <View style={[styles.chipDot, { backgroundColor: category.color }]} />
              <Text
                style={[
                  styles.chipText,
                  categoryId === category.id && styles.chipTextActive,
                ]}
              >
                {category.name}
              </Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => setCategoryId(null)}
            style={[
              styles.chip,
              categoryId === null && { backgroundColor: ORPHAN_EVENT_COLOR },
            ]}
          >
            <Text style={[styles.chipText, categoryId === null && styles.chipTextActive]}>
              None
            </Text>
          </Pressable>
        </View>

        {canChooseVisibility && (
          <>
            <Text style={styles.label}>Who can see it</Text>
            <View style={styles.chips}>
              {EVENT_VISIBILITY.map((option) => (
                <Pressable
                  key={option}
                  onPress={() => setVisibility(option)}
                  style={[styles.chip, visibility === option && styles.chipPrimary]}
                >
                  <Icon
                    icon={VISIBILITY_LABELS[option].icon}
                    size="xs"
                    color={visibility === option ? colors.onInk : colors.body}
                  />
                  <Text
                    style={[
                      styles.chipText,
                      visibility === option && styles.chipTextActive,
                    ]}
                  >
                    {VISIBILITY_LABELS[option].label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.help}>{VISIBILITY_LABELS[visibility].help}</Text>
          </>
        )}

        <Text style={styles.label}>Notes</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Optional"
          placeholderTextColor={colors.muted}
          style={[styles.input, styles.notes]}
          multiline
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.actions}>
          <Pressable onPress={onClose} style={[styles.action, styles.actionGhost]}>
            <Text style={styles.actionText}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={() => void save()}
            disabled={saving}
            style={[styles.action, styles.actionPrimary, saving && styles.actionBusy]}
          >
            {saving ? (
              <ActivityIndicator color={colors.onInk} />
            ) : (
              <Text style={[styles.actionText, styles.actionTextPrimary]}>Save</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </Sheet>
  );
}

/** Next round half-hour, or the tapped day at a sensible hour. */
function defaultStart(seed?: Date): Date {
  const start = seed ? new Date(seed) : new Date();
  start.setSeconds(0, 0);
  const remainder = start.getMinutes() % 30;
  start.setMinutes(start.getMinutes() + (remainder === 0 ? 0 : 30 - remainder));
  return start;
}

const styles = StyleSheet.create({
  // Capped so a long form scrolls inside the sheet rather than pushing it off
  // the top of the screen.
  scroll: { maxHeight: '100%' },
  content: { gap: space.md, paddingBottom: space.sm },
  title: { ...type.heading, color: colors.ink },
  label: { ...type.label, color: colors.muted },
  help: { ...type.small, color: colors.muted, marginTop: -space.sm },
  field: { gap: space.xs },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  input: {
    ...type.body,
    color: colors.ink,
    backgroundColor: colors.wash,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  notes: { minHeight: 64, textAlignVertical: 'top' },
  duration: { ...type.small, color: colors.body },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.wash,
  },
  chipPrimary: { backgroundColor: colors.primary },
  chipDot: { width: 8, height: 8, borderRadius: radius.pill },
  chipText: { ...type.small, fontWeight: '600', color: colors.body },
  chipTextActive: { color: colors.onInk },
  error: { ...type.small, color: '#B91C1C' },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  action: {
    flex: 1,
    paddingVertical: space.lg,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  actionGhost: { backgroundColor: colors.wash },
  actionPrimary: { backgroundColor: colors.primary },
  actionBusy: { opacity: 0.7 },
  actionText: { ...type.body, fontSize: 16, fontWeight: '600', color: colors.body },
  actionTextPrimary: { color: colors.onInk },
});
