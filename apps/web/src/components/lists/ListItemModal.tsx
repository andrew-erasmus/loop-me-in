import { useState, type FormEvent } from 'react';
import { format } from 'date-fns';
import { faCalendarDays, faWandMagicSparkles } from '@fortawesome/free-solid-svg-icons';
import {
  ApiError,
  listItemInputSchema,
  TIERS,
  type List,
  type ListItem,
  type SuggestedSlot,
  type Tier,
  type User,
} from '@date-calendar/core';
import { fromDateTimeInput, roundToNextSlot, toDateTimeInput } from '../../lib/datetime.js';
import Avatar from '../ui/Avatar.js';
import Icon from '../ui/Icon.js';
import Modal from '../ui/Modal.js';

export interface ItemDraft {
  /** Present when editing; absent when adding. */
  item?: ListItem;
  list: List;
}

interface ListItemModalProps {
  draft: ItemDraft;
  members: Map<string, User>;
  onClose: () => void;
  onSave: (values: {
    title: string;
    notes: string | null;
    url: string | null;
    effort: Tier | null;
    cost: Tier | null;
  }) => Promise<unknown>;
  onDelete?: () => Promise<unknown>;
  onSchedule?: (times: { startsAt: string; endsAt: string }) => Promise<unknown>;
  onUnschedule?: () => Promise<unknown>;
  onSuggestSlots?: (durationMinutes?: number) => Promise<SuggestedSlot[]>;
  isSaving: boolean;
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
    <div className="flex gap-1.5">
      {TIERS.map((tier) => (
        <button
          key={tier}
          type="button"
          onClick={() => onChange(value === tier ? null : tier)}
          aria-pressed={value === tier}
          className={`flex-1 rounded-md border px-2 py-1.5 text-xs font-semibold transition ${
            value === tier
              ? 'border-primary bg-primary text-white'
              : 'border-moss-300 text-moss-500 hover:border-moss-400 hover:text-moss-800'
          }`}
        >
          {labels[tier]}
        </button>
      ))}
    </div>
  );
}

/** Default when scheduling something: the next half hour, two hours long. */
function defaultTimes(): { startsAt: string; endsAt: string } {
  const start = roundToNextSlot(new Date());
  start.setHours(19, 0, 0, 0);
  if (start.getTime() < Date.now()) start.setDate(start.getDate() + 1);
  return {
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 2 * 60 * 60 * 1000).toISOString(),
  };
}

export default function ListItemModal({
  draft,
  members,
  onClose,
  onSave,
  onDelete,
  onSchedule,
  onUnschedule,
  onSuggestSlots,
  isSaving,
}: ListItemModalProps) {
  const existing = draft.item;

  const [title, setTitle] = useState(existing?.title ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [url, setUrl] = useState(existing?.url ?? '');
  const [effort, setEffort] = useState<Tier | null>(existing?.effort ?? null);
  const [cost, setCost] = useState<Tier | null>(existing?.cost ?? null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // The scheduling sub-form is collapsed until asked for, so adding "Dune" to a
  // list stays a two-field job and picking a night is a deliberate second step.
  const [picking, setPicking] = useState(false);
  const [times, setTimes] = useState(defaultTimes);
  const [busy, setBusy] = useState(false);

  const [slots, setSlots] = useState<SuggestedSlot[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);

  const fetchSlots = async () => {
    if (!onSuggestSlots) return;
    setSlotsError(null);
    setSlotsLoading(true);
    try {
      const duration = Math.round((Date.parse(times.endsAt) - Date.parse(times.startsAt)) / 60000);
      setSlots(await onSuggestSlots(duration > 0 ? duration : undefined));
    } catch {
      setSlotsError('Could not find any suggestions right now.');
    } finally {
      setSlotsLoading(false);
    }
  };

  const scheduledAt = existing?.scheduledAt ?? null;
  const author = existing?.createdBy ? members.get(existing.createdBy) : undefined;

  const handleSubmit = async (formEvent: FormEvent) => {
    formEvent.preventDefault();
    setError(null);

    const values = {
      title: title.trim(),
      notes: notes.trim() === '' ? null : notes.trim(),
      url: url.trim() === '' ? null : url.trim(),
      effort,
      cost,
    };

    // Same schema the server validates with, so a bad URL is caught before the
    // round trip rather than after it.
    const parsed = listItemInputSchema.safeParse(values);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check the form');
      return;
    }

    try {
      await onSave(values);
      onClose();
    } catch (saveError) {
      setError(
        saveError instanceof ApiError ? saveError.message : 'Could not save this item.',
      );
    }
  };

  const runScheduling = async (action: () => Promise<unknown>, failure: string) => {
    setError(null);
    setBusy(true);
    try {
      await action();
      setPicking(false);
    } catch (scheduleError) {
      setError(scheduleError instanceof ApiError ? scheduleError.message : failure);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={existing ? 'Edit item' : `Add to ${draft.list.name}`}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
        <div>
          <label htmlFor="item-title" className="mb-1 block text-xs font-medium text-moss-600">
            What is it?
          </label>
          <input
            id="item-title"
            value={title}
            onChange={(changeEvent) => setTitle(changeEvent.target.value)}
            placeholder={`e.g. ${draft.list.emoji === '🎬' ? 'Dune: Part Two' : 'Something good'}`}
            autoFocus
            className="w-full rounded-md border border-moss-300 px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </div>

        <div>
          <label htmlFor="item-url" className="mb-1 block text-xs font-medium text-moss-600">
            Link
          </label>
          <input
            id="item-url"
            type="url"
            value={url}
            onChange={(changeEvent) => setUrl(changeEvent.target.value)}
            placeholder="Optional — a trailer, a menu, a map pin"
            className="w-full rounded-md border border-moss-300 px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </div>

        <div>
          <label htmlFor="item-notes" className="mb-1 block text-xs font-medium text-moss-600">
            Notes
          </label>
          <textarea
            id="item-notes"
            value={notes}
            onChange={(changeEvent) => setNotes(changeEvent.target.value)}
            rows={2}
            placeholder="Optional"
            className="w-full resize-none rounded-md border border-moss-300 px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-moss-600">Effort</label>
            <TierPicker value={effort} onChange={setEffort} labels={TIER_LABELS} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-moss-600">Cost</label>
            <TierPicker value={cost} onChange={setCost} labels={COST_LABELS} />
          </div>
        </div>

        {existing && onSchedule && (
          <div className="rounded-lg border border-moss-200 bg-moss-50/70 p-3">
            {scheduledAt && !picking ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1.5 text-sm text-moss-700">
                  <Icon icon={faCalendarDays} size="sm" className="text-moss-400" />
                  On the calendar for{' '}
                  <strong className="font-semibold">
                    {format(new Date(scheduledAt), 'EEE d MMM, HH:mm')}
                  </strong>
                </span>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => {
                    setTimes({
                      startsAt: scheduledAt,
                      endsAt: new Date(
                        Date.parse(scheduledAt) + 2 * 60 * 60 * 1000,
                      ).toISOString(),
                    });
                    setPicking(true);
                  }}
                  className="rounded-md px-2 py-1 text-xs font-medium text-moss-900 transition hover:bg-moss-100"
                >
                  Change
                </button>
                {onUnschedule && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      runScheduling(onUnschedule, 'Could not take this off the calendar.')
                    }
                    className="rounded-md px-2 py-1 text-xs font-medium text-moss-600 transition hover:bg-moss-200 disabled:opacity-50"
                  >
                    Remove date
                  </button>
                )}
              </div>
            ) : picking ? (
              <div className="space-y-2.5">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="item-start"
                      className="mb-1 block text-xs font-medium text-moss-600"
                    >
                      Starts
                    </label>
                    <input
                      id="item-start"
                      type="datetime-local"
                      value={toDateTimeInput(times.startsAt)}
                      onChange={(changeEvent) => {
                        const startsAt = fromDateTimeInput(changeEvent.target.value);
                        // Drag the end along with the start, preserving how
                        // long it was — nobody wants to set both fields.
                        const duration =
                          Date.parse(times.endsAt) - Date.parse(times.startsAt);
                        setTimes({
                          startsAt,
                          endsAt: new Date(
                            Date.parse(startsAt) + Math.max(duration, 0),
                          ).toISOString(),
                        });
                      }}
                      className="w-full rounded-md border border-moss-300 px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="item-end"
                      className="mb-1 block text-xs font-medium text-moss-600"
                    >
                      Ends
                    </label>
                    <input
                      id="item-end"
                      type="datetime-local"
                      value={toDateTimeInput(times.endsAt)}
                      onChange={(changeEvent) =>
                        setTimes((current) => ({
                          ...current,
                          endsAt: fromDateTimeInput(changeEvent.target.value),
                        }))
                      }
                      className="w-full rounded-md border border-moss-300 px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                    />
                  </div>
                </div>

                {onSuggestSlots && (
                  <div>
                    <button
                      type="button"
                      disabled={slotsLoading}
                      onClick={() => void fetchSlots()}
                      className="flex items-center gap-1.5 text-xs font-semibold text-moss-600 transition hover:text-moss-950 disabled:opacity-50"
                    >
                      <Icon icon={faWandMagicSparkles} size="xs" />
                      {slotsLoading ? 'Looking…' : 'Suggest a time'}
                    </button>
                    {slotsError && <p className="mt-1.5 text-xs text-red-600">{slotsError}</p>}
                    {slots && slots.length === 0 && !slotsLoading && (
                      <p className="mt-1.5 text-xs text-moss-400">
                        No free slot found in the next couple of weeks.
                      </p>
                    )}
                    {slots && slots.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {slots.map((slot) => (
                          <button
                            key={slot.startsAt}
                            type="button"
                            onClick={() => setTimes(slot)}
                            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                              times.startsAt === slot.startsAt
                                ? 'border-primary bg-primary text-white'
                                : 'border-moss-300 text-moss-600 hover:border-moss-400 hover:text-moss-900'
                            }`}
                          >
                            {format(new Date(slot.startsAt), 'EEE d MMM, HH:mm')}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      runScheduling(
                        () => onSchedule(times),
                        'Could not put this on the calendar.',
                      )
                    }
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-primary-pressed disabled:opacity-50"
                  >
                    {busy ? 'Saving…' : scheduledAt ? 'Move it' : 'Put it on the calendar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPicking(false)}
                    className="rounded-md px-2 py-1.5 text-xs font-medium text-moss-600 transition hover:bg-moss-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setPicking(true)}
                className="flex items-center gap-1.5 text-sm font-medium text-moss-900 transition hover:text-moss-950"
              >
                <Icon icon={faCalendarDays} size="sm" />
                Pick a date for this…
              </button>
            )}
            <p className="mt-2 text-xs text-moss-400">
              It stays on the list either way — scheduling adds it to the calendar, it
              doesn’t move it off here.
            </p>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex items-center gap-2 border-t border-moss-100 pt-4">
          {existing && onDelete && (
            <button
              type="button"
              onClick={
                confirmingDelete
                  ? () => {
                      void onDelete().then(onClose);
                    }
                  : () => setConfirmingDelete(true)
              }
              onBlur={() => setConfirmingDelete(false)}
              className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                confirmingDelete
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'text-red-600 hover:bg-red-50'
              }`}
            >
              {confirmingDelete ? 'Really delete?' : 'Delete'}
            </button>
          )}

          {author && (
            <span className="flex items-center gap-1.5 text-xs text-moss-400">
              <Avatar user={author} size="xs" />
              added by {author.name}
            </span>
          )}

          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-2 text-sm font-medium text-moss-600 transition hover:bg-moss-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-pressed disabled:opacity-50"
          >
            {isSaving ? 'Saving…' : existing ? 'Save' : 'Add'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
