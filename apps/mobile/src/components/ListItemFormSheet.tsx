import { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { faCalendarDays, faWandMagicSparkles } from '@fortawesome/free-solid-svg-icons';
import {
  ApiError,
  format,
  listItemInputSchema,
  TIERS,
  type CalendarEvent,
  type List,
  type ListItem,
  type SuggestedSlot,
  type Tier,
} from '@date-calendar/core';
import { api } from '../lib/api';
import Icon from './Icon';
import Sheet from './Sheet';
import { colors, radius, space, type } from '../theme';

/**
 * Add, edit or delete a list item — and give it a date, or take it off the
 * calendar again.
 *
 * The scheduling section mirrors the web's `ListItemModal`: collapsed until
 * asked for, so adding "Dune: Part Two" to a list stays a two-field job and
 * picking a night is a deliberate second step, not something every item drags
 * along with it.
 */

export default function ListItemFormSheet({
  item,
  list,
  onClose,
  onSaved,
  onDeleted,
  onScheduled,
  onUnscheduled,
}: {
  /** Absent when adding a new item. */
  item?: ListItem;
  list: List;
  onClose: () => void;
  onSaved: (item: ListItem) => void;
  onDeleted: (itemId: string) => void;
  onScheduled: (item: ListItem, event: CalendarEvent) => void;
  onUnscheduled: (item: ListItem, previousEventId: string | null) => void;
}) {
  const [title, setTitle] = useState(item?.title ?? '');
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [url, setUrl] = useState(item?.url ?? '');
  const [effort, setEffort] = useState<Tier | null>(item?.effort ?? null);
  const [cost, setCost] = useState<Tier | null>(item?.cost ?? null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Collapsed by default — see the module doc.
  const [picking, setPicking] = useState(false);
  const [startsAt, setStartsAt] = useState(() => defaultScheduleStart(item?.scheduledAt));
  const [endsAt, setEndsAt] = useState(
    () => new Date(defaultScheduleStart(item?.scheduledAt).getTime() + 2 * 60 * 60 * 1000),
  );
  const [scheduling, setScheduling] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const [slots, setSlots] = useState<SuggestedSlot[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);

  const fetchSlots = async () => {
    if (!item) return;
    setSlotsLoading(true);
    try {
      const duration = Math.round((endsAt.getTime() - startsAt.getTime()) / 60000);
      setSlots(
        await api.suggestItemSlots(item.id, {
          durationMinutes: duration > 0 ? duration : undefined,
        }),
      );
    } catch {
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  };

  const save = async () => {
    setError(null);

    const values = {
      title: title.trim(),
      notes: notes.trim() === '' ? null : notes.trim(),
      url: url.trim() === '' ? null : url.trim(),
      effort,
      cost,
    };

    const parsed = listItemInputSchema.safeParse(values);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check the form');
      return;
    }

    setSaving(true);
    try {
      const saved = item
        ? await api.updateItem(item.id, values)
        : await api.createItem(list.id, values);
      onSaved(saved);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof ApiError ? saveError.message : 'Could not save this item.');
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!item) return;
    setSaving(true);
    try {
      await api.deleteItem(item.id);
      onDeleted(item.id);
      onClose();
    } catch (deleteError) {
      setError(deleteError instanceof ApiError ? deleteError.message : 'Could not delete this item.');
      setSaving(false);
    }
  };

  const changeStart = (next: Date) => {
    const duration = Math.max(endsAt.getTime() - startsAt.getTime(), 0);
    setStartsAt(next);
    if (endsAt < next) setEndsAt(new Date(next.getTime() + (duration || 2 * 60 * 60 * 1000)));
  };

  const schedule = async () => {
    if (!item) return;
    setScheduleError(null);
    setScheduling(true);
    try {
      const result = await api.scheduleItem(item.id, {
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        allDay: false,
        categoryId: null,
      });
      onScheduled(result.item, result.event);
      setPicking(false);
    } catch (scheduleErr) {
      setScheduleError(
        scheduleErr instanceof ApiError ? scheduleErr.message : 'Could not put this on the calendar.',
      );
    } finally {
      setScheduling(false);
    }
  };

  const unschedule = async () => {
    if (!item) return;
    setScheduleError(null);
    setScheduling(true);
    const previousEventId = item.scheduledEventId;
    try {
      const updated = await api.unscheduleItem(item.id);
      onUnscheduled(updated, previousEventId);
    } catch (scheduleErr) {
      setScheduleError(
        scheduleErr instanceof ApiError ? scheduleErr.message : 'Could not take this off the calendar.',
      );
    } finally {
      setScheduling(false);
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
        <Text style={styles.title}>
          {item ? 'Edit item' : `Add to ${list.name}`}
        </Text>

        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder={`e.g. ${list.emoji === '🎬' ? 'Dune: Part Two' : 'Something good'}`}
          placeholderTextColor={colors.muted}
          style={styles.input}
          autoFocus={!item}
          returnKeyType="done"
        />

        <View style={styles.field}>
          <Text style={styles.label}>Link</Text>
          <TextInput
            value={url}
            onChangeText={setUrl}
            placeholder="Optional — a trailer, a menu, a map pin"
            placeholderTextColor={colors.muted}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Notes</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Optional"
            placeholderTextColor={colors.muted}
            style={[styles.input, styles.notes]}
            multiline
          />
        </View>

        <View style={styles.tierRow}>
          <View style={[styles.field, styles.tierField]}>
            <Text style={styles.label}>Effort</Text>
            <TierPicker value={effort} onChange={setEffort} labels={TIER_LABELS} />
          </View>
          <View style={[styles.field, styles.tierField]}>
            <Text style={styles.label}>Cost</Text>
            <TierPicker value={cost} onChange={setCost} labels={COST_LABELS} />
          </View>
        </View>

        {item && (
          <View style={styles.scheduleBox}>
            {item.scheduledAt && !picking ? (
              <View style={styles.scheduleRow}>
                <View style={styles.scheduleHeadline}>
                  <Icon icon={faCalendarDays} size="sm" color={colors.body} />
                  <Text style={styles.scheduleText}>
                    On the calendar for{' '}
                    <Text style={styles.scheduleStrong}>
                      {format(new Date(item.scheduledAt), 'EEE d MMM, HH:mm')}
                    </Text>
                  </Text>
                </View>
                <View style={styles.scheduleActions}>
                  <Pressable
                    onPress={() => {
                      const seed = new Date(item.scheduledAt!);
                      setStartsAt(seed);
                      setEndsAt(new Date(seed.getTime() + 2 * 60 * 60 * 1000));
                      setPicking(true);
                    }}
                  >
                    <Text style={styles.scheduleLink}>Change</Text>
                  </Pressable>
                  <Pressable disabled={scheduling} onPress={() => void unschedule()}>
                    <Text style={styles.scheduleLinkMuted}>Remove date</Text>
                  </Pressable>
                </View>
              </View>
            ) : picking ? (
              <View style={styles.pickerGroup}>
                <View style={styles.field}>
                  <Text style={styles.label}>Starts</Text>
                  <DateTimePicker
                    value={startsAt}
                    mode="datetime"
                    display={Platform.OS === 'ios' ? 'compact' : 'default'}
                    onChange={(_, date) => date && changeStart(date)}
                  />
                </View>
                <View style={styles.field}>
                  <Text style={styles.label}>Ends</Text>
                  <DateTimePicker
                    value={endsAt}
                    mode="datetime"
                    display={Platform.OS === 'ios' ? 'compact' : 'default'}
                    onChange={(_, date) => date && setEndsAt(date)}
                  />
                </View>

                <Pressable
                  onPress={() => void fetchSlots()}
                  disabled={slotsLoading}
                  style={styles.suggestButton}
                >
                  <Icon icon={faWandMagicSparkles} size="xs" color={colors.body} />
                  <Text style={styles.suggestButtonText}>
                    {slotsLoading ? 'Looking…' : 'Suggest a time'}
                  </Text>
                </Pressable>
                {slots && slots.length === 0 && !slotsLoading && (
                  <Text style={styles.help}>No free slot found in the next couple of weeks.</Text>
                )}
                {slots && slots.length > 0 && (
                  <View style={styles.slotRow}>
                    {slots.map((slot) => {
                      const active = startsAt.toISOString() === slot.startsAt;
                      return (
                        <Pressable
                          key={slot.startsAt}
                          onPress={() => {
                            setStartsAt(new Date(slot.startsAt));
                            setEndsAt(new Date(slot.endsAt));
                          }}
                          style={[styles.slotChip, active && styles.slotChipActive]}
                        >
                          <Text style={[styles.slotChipText, active && styles.slotChipTextActive]}>
                            {format(new Date(slot.startsAt), 'EEE d MMM, HH:mm')}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}

                {scheduleError && <Text style={styles.error}>{scheduleError}</Text>}
                <View style={styles.scheduleActions}>
                  <Pressable disabled={scheduling} onPress={() => void schedule()}>
                    {scheduling ? (
                      <ActivityIndicator color={colors.ink} />
                    ) : (
                      <Text style={styles.scheduleLinkStrong}>
                        {item.scheduledAt ? 'Move it' : 'Put it on the calendar'}
                      </Text>
                    )}
                  </Pressable>
                  <Pressable onPress={() => setPicking(false)}>
                    <Text style={styles.scheduleLinkMuted}>Cancel</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable onPress={() => setPicking(true)} style={styles.scheduleHeadline}>
                <Icon icon={faCalendarDays} size="sm" color={colors.ink} />
                <Text style={styles.scheduleLinkStrong}>Pick a date for this…</Text>
              </Pressable>
            )}
            <Text style={styles.help}>
              It stays on the list either way — scheduling adds it to the calendar, it
              doesn’t move it off here.
            </Text>
          </View>
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.actions}>
          {item && (
            <Pressable
              disabled={saving}
              onPress={confirmingDelete ? () => void remove() : () => setConfirmingDelete(true)}
              style={[styles.action, confirmingDelete ? styles.actionDanger : styles.actionGhost]}
            >
              <Text style={[styles.actionText, confirmingDelete && styles.actionTextOnDanger]}>
                {confirmingDelete ? 'Really delete?' : 'Delete'}
              </Text>
            </Pressable>
          )}
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
              <Text style={[styles.actionText, styles.actionTextPrimary]}>
                {item ? 'Save' : 'Add'}
              </Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </Sheet>
  );
}

const TIER_LABELS: Record<Tier, string> = { low: 'Low', medium: 'Medium', high: 'High' };
const COST_LABELS: Record<Tier, string> = { low: '$', medium: '$$', high: '$$$' };

/** A tap-to-select, tap-again-to-clear row of three tiers. */
function TierPicker({
  value,
  onChange,
  labels,
}: {
  value: Tier | null;
  onChange: (value: Tier | null) => void;
  labels: Record<Tier, string>;
}) {
  return (
    <View style={tierStyles.row}>
      {TIERS.map((tier) => (
        <Pressable
          key={tier}
          onPress={() => onChange(value === tier ? null : tier)}
          style={[tierStyles.chip, value === tier && tierStyles.chipActive]}
        >
          <Text style={[tierStyles.chipText, value === tier && tierStyles.chipTextActive]}>
            {labels[tier]}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const tierStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.xs },
  chip: {
    flex: 1,
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.wash,
    alignItems: 'center',
  },
  chipActive: { backgroundColor: colors.primary },
  chipText: { ...type.small, fontWeight: '700', color: colors.body },
  chipTextActive: { color: colors.onInk },
});

/** The next round half-hour this evening at 19:00, or tomorrow if that's past. */
function defaultScheduleStart(existing?: string | null): Date {
  if (existing) return new Date(existing);
  const start = new Date();
  start.setHours(19, 0, 0, 0);
  if (start.getTime() < Date.now()) start.setDate(start.getDate() + 1);
  return start;
}

const styles = StyleSheet.create({
  scroll: { maxHeight: '100%' },
  content: { gap: space.md, paddingBottom: space.sm },
  title: { ...type.heading, color: colors.ink },
  label: { ...type.label, color: colors.muted },
  help: { ...type.small, color: colors.muted, marginTop: space.xs },
  field: { gap: space.xs },
  tierRow: { flexDirection: 'row', gap: space.md },
  tierField: { flex: 1 },
  input: {
    ...type.body,
    color: colors.ink,
    backgroundColor: colors.wash,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  notes: { minHeight: 64, textAlignVertical: 'top' },

  scheduleBox: {
    backgroundColor: colors.wash,
    borderRadius: radius.md,
    padding: space.md,
    gap: space.xs,
  },
  scheduleRow: { gap: space.sm },
  scheduleHeadline: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  scheduleText: { ...type.body, color: colors.body, flexShrink: 1 },
  scheduleStrong: { fontWeight: '700', color: colors.ink },
  scheduleActions: { flexDirection: 'row', gap: space.lg },
  scheduleLink: { ...type.small, fontWeight: '700', color: colors.ink },
  scheduleLinkStrong: { ...type.body, fontWeight: '700', color: colors.ink },
  scheduleLinkMuted: { ...type.small, fontWeight: '600', color: colors.muted },
  pickerGroup: { gap: space.sm },
  suggestButton: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  suggestButtonText: { ...type.small, fontWeight: '700', color: colors.body },
  slotRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  slotChip: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  slotChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  slotChipText: { ...type.small, fontWeight: '600', color: colors.body },
  slotChipTextActive: { color: colors.onInk },

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
  actionDanger: { backgroundColor: '#B91C1C' },
  actionBusy: { opacity: 0.7 },
  actionText: { ...type.body, fontSize: 16, fontWeight: '600', color: colors.body },
  actionTextPrimary: { color: colors.onInk },
  actionTextOnDanger: { color: colors.onInk },
});
