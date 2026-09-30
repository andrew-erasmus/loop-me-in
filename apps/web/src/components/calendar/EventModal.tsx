import { useState, type FormEvent } from 'react';
import {
  faGift,
  faLock,
  faPlus,
  faUsers,
  type IconDefinition,
} from '@fortawesome/free-solid-svg-icons';
import {
  ApiError,
  CATEGORY_PALETTE,
  ORPHAN_EVENT_COLOR,
  eventInputSchema,
  type CalendarEvent,
  type Category,
  type EventVisibility,
  type List,
  type ListItem,
  type User,
} from '@date-calendar/core';
import {
  fromDateInput,
  fromDateTimeInput,
  toDateInput,
  toDateTimeInput,
} from '../../lib/datetime.js';
import { useCreateCategory } from '../../hooks/useCalendarData.js';
import Avatar from '../ui/Avatar.js';
import Icon from '../ui/Icon.js';
import Modal from '../ui/Modal.js';

/**
 * The three visibility modes, with the wording that actually explains them.
 *
 * `surprise` is the interesting one: the slot stays visible so the other person
 * won't book over it, but everything identifying is stripped server-side.
 */
const VISIBILITY_OPTIONS: {
  value: EventVisibility;
  label: string;
  icon: IconDefinition;
  help: string;
}[] = [
  {
    value: 'shared',
    label: 'Shared',
    icon: faUsers,
    help: 'Both of you see this normally.',
  },
  {
    value: 'surprise',
    label: 'Surprise',
    icon: faGift,
    help: 'They see the time is booked, but not what it is — so they won\u2019t plan over it, and won\u2019t know why.',
  },
  {
    value: 'private',
    label: 'Just me',
    icon: faLock,
    help: 'Hidden completely. They see nothing at all in this slot.',
  },
];

export interface EventDraft {
  /** Present when editing; absent when creating. */
  event?: CalendarEvent;
  /** Seed start/end for a new event, from the clicked day or slot. */
  startsAt: string;
  endsAt: string;
}

interface EventModalProps {
  draft: EventDraft;
  categories: Category[];
  /** Everyone in the space, for the creator's avatar. */
  members: Map<string, User>;
  /** Who is looking — decides whether the privacy toggle is theirs to use. */
  currentUserId: string;
  /** The list item this event was scheduled from, if it came from one. */
  sourceItem?: { item: ListItem; list: List | undefined } | undefined;
  onClose: () => void;
  onSave: (values: {
    title: string;
    notes: string | null;
    startsAt: string;
    endsAt: string;
    allDay: boolean;
    visibility: EventVisibility;
    categoryId: string | null;
  }) => Promise<unknown>;
  onDelete?: () => Promise<unknown>;
  onShowSource?: () => void;
  isSaving: boolean;
}

export default function EventModal({
  draft,
  categories,
  members,
  currentUserId,
  sourceItem,
  onClose,
  onSave,
  onDelete,
  onShowSource,
  isSaving,
}: EventModalProps) {
  const existing = draft.event;
  const author = existing?.createdBy ? members.get(existing.createdBy) : undefined;

  const [title, setTitle] = useState(existing?.title ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [allDay, setAllDay] = useState(existing?.allDay ?? false);
  const [startsAt, setStartsAt] = useState(existing?.startsAt ?? draft.startsAt);
  const [endsAt, setEndsAt] = useState(existing?.endsAt ?? draft.endsAt);
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? '');
  const [visibility, setVisibility] = useState<EventVisibility>(
    existing?.visibility ?? 'shared',
  );
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  /**
   * Switching to all-day keeps the dates and snaps the times to the day's
   * bounds; switching back restores a sensible 09:00–10:00 working window.
   */
  const handleAllDayToggle = (checked: boolean) => {
    setAllDay(checked);
    if (checked) {
      setStartsAt(fromDateInput(toDateInput(startsAt), 0, 0));
      setEndsAt(fromDateInput(toDateInput(endsAt), 23, 59));
    } else {
      setStartsAt(fromDateInput(toDateInput(startsAt), 9, 0));
      setEndsAt(fromDateInput(toDateInput(endsAt), 10, 0));
    }
  };

  /** Keep the end from drifting behind the start as the user edits. */
  const handleStartChange = (value: string) => {
    const nextStart = allDay ? fromDateInput(value, 0, 0) : fromDateTimeInput(value);
    setStartsAt(nextStart);
    if (Date.parse(endsAt) < Date.parse(nextStart)) {
      const duration = Date.parse(endsAt) - Date.parse(startsAt);
      const fallback = Math.max(duration, 60 * 60 * 1000);
      setEndsAt(new Date(Date.parse(nextStart) + fallback).toISOString());
    }
  };

  const handleSubmit = async (formEvent: FormEvent) => {
    formEvent.preventDefault();
    setError(null);

    const values = {
      title: title.trim(),
      notes: notes.trim() === '' ? null : notes.trim(),
      startsAt,
      endsAt,
      allDay,
      visibility,
      categoryId: categoryId === '' ? null : categoryId,
    };

    // Validate with the same schema the server uses, so the user sees the
    // problem before a round trip.
    const parsed = eventInputSchema.safeParse(values);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check the form');
      return;
    }

    try {
      await onSave(values);
      onClose();
    } catch (saveError) {
      setError(
        saveError instanceof ApiError
          ? saveError.message
          : 'Could not save the event. Is the API running?',
      );
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setError(null);
    try {
      await onDelete();
      onClose();
    } catch {
      setError('Could not delete the event.');
    }
  };

  return (
    <Modal title={existing ? 'Edit event' : 'New event'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
        {sourceItem && (
          <div className="flex items-center gap-2 rounded-lg bg-moss-50 px-3 py-2 text-sm text-moss-600">
            <span aria-hidden>{sourceItem.list?.emoji ?? '📋'}</span>
            <span className="min-w-0 flex-1 truncate">
              From <strong className="font-medium">{sourceItem.list?.name ?? 'a list'}</strong>
            </span>
            {onShowSource && (
              <button
                type="button"
                onClick={onShowSource}
                className="shrink-0 rounded-md px-2 py-0.5 text-xs font-medium text-moss-900 transition hover:bg-moss-100"
              >
                Open list
              </button>
            )}
          </div>
        )}

        <div>
          <label htmlFor="event-title" className="mb-1 block text-xs font-medium text-moss-600">
            Title
          </label>
          <input
            id="event-title"
            value={title}
            onChange={(changeEvent) => setTitle(changeEvent.target.value)}
            placeholder="What's happening?"
            autoFocus
            className="w-full rounded-md border border-moss-300 px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </div>

        <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-moss-700">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(changeEvent) => handleAllDayToggle(changeEvent.target.checked)}
            className="h-4 w-4 rounded border-moss-300 accent-primary"
          />
          All day
        </label>

        {/* The one part of a shared calendar that isn't shared. Offered only on
            your own events — you cannot reclassify someone else's. */}
        {members.size > 1 && (!existing || existing.createdBy === currentUserId) && (
          <div>
            <span className="mb-1.5 block text-xs font-medium text-moss-600">
              Who can see it
            </span>
            <div className="flex flex-wrap gap-1.5">
              {VISIBILITY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setVisibility(option.value)}
                  aria-pressed={visibility === option.value}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                    visibility === option.value
                      ? 'border-transparent bg-moss-900 text-white'
                      : 'border-moss-200 text-moss-600 hover:bg-moss-50'
                  }`}
                >
                  <Icon
                    icon={option.icon}
                    size="xs"
                    className={visibility === option.value ? 'text-white' : 'text-moss-500'}
                  />
                  {option.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-moss-400">
              {VISIBILITY_OPTIONS.find((o) => o.value === visibility)?.help}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="event-start" className="mb-1 block text-xs font-medium text-moss-600">
              Starts
            </label>
            <input
              id="event-start"
              type={allDay ? 'date' : 'datetime-local'}
              value={allDay ? toDateInput(startsAt) : toDateTimeInput(startsAt)}
              onChange={(changeEvent) => handleStartChange(changeEvent.target.value)}
              className="w-full rounded-md border border-moss-300 px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </div>
          <div>
            <label htmlFor="event-end" className="mb-1 block text-xs font-medium text-moss-600">
              Ends
            </label>
            <input
              id="event-end"
              type={allDay ? 'date' : 'datetime-local'}
              value={allDay ? toDateInput(endsAt) : toDateTimeInput(endsAt)}
              onChange={(changeEvent) =>
                setEndsAt(
                  allDay
                    ? fromDateInput(changeEvent.target.value, 23, 59)
                    : fromDateTimeInput(changeEvent.target.value),
                )
              }
              className="w-full rounded-md border border-moss-300 px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </div>
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-medium text-moss-600">Category</span>
          <div className="flex flex-wrap gap-1.5">
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setCategoryId(category.id)}
                aria-pressed={categoryId === category.id}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                  categoryId === category.id
                    ? 'border-transparent text-white'
                    : 'border-moss-200 text-moss-600 hover:bg-moss-50'
                }`}
                style={
                  categoryId === category.id
                    ? { backgroundColor: category.color }
                    : undefined
                }
              >
                <span
                  aria-hidden
                  className="h-2 w-2 rounded-full"
                  style={{
                    backgroundColor:
                      categoryId === category.id ? 'rgba(255,255,255,0.9)' : category.color,
                  }}
                />
                {category.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setCategoryId('')}
              aria-pressed={categoryId === ''}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                categoryId === ''
                  ? 'border-transparent text-white'
                  : 'border-moss-200 text-moss-600 hover:bg-moss-50'
              }`}
              style={categoryId === '' ? { backgroundColor: ORPHAN_EVENT_COLOR } : undefined}
            >
              None
            </button>

            {/* The category you want is most often missing exactly here, while
                you are describing the thing that needs it. Sending someone off
                to the manager and back — three taps and a lost draft on a
                phone — is how events end up uncategorised. */}
            <InlineCategoryAdd onCreated={(created) => setCategoryId(created.id)} />
          </div>
        </div>

        <div>
          <label htmlFor="event-notes" className="mb-1 block text-xs font-medium text-moss-600">
            Notes
          </label>
          <textarea
            id="event-notes"
            value={notes}
            onChange={(changeEvent) => setNotes(changeEvent.target.value)}
            rows={2}
            placeholder="Optional"
            className="w-full resize-none rounded-md border border-moss-300 px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex items-center gap-2 border-t border-moss-100 pt-4">
          {existing && onDelete && (
            <button
              type="button"
              onClick={confirmingDelete ? handleDelete : () => setConfirmingDelete(true)}
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
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Add a category from inside the event form, and select it.
 *
 * Collapsed to a single chip until asked for, so the common case — picking one
 * that already exists — isn't sharing its row with a form. Renaming, recolouring
 * and deleting still belong in `CategoryManager`; this is only the one step that
 * is worth not leaving the page for.
 */
function InlineCategoryAdd({ onCreated }: { onCreated: (category: Category) => void }) {
  const createCategory = useCreateCategory();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(CATEGORY_PALETTE[0]);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setOpen(false);
    setName('');
    setError(null);
  };

  const submit = async () => {
    const trimmed = name.trim();
    if (trimmed === '' || createCategory.isPending) return;
    setError(null);
    try {
      const created = await createCategory.mutateAsync({ name: trimmed, color });
      onCreated(created);
      close();
    } catch {
      setError('Could not create that category.');
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-full border border-dashed border-moss-300 px-2.5 py-1 text-xs font-medium text-moss-500 transition hover:border-primary hover:text-primary"
      >
        <Icon icon={faPlus} size="xs" />
        New
      </button>
    );
  }

  return (
    // `w-full` inside the chips' flex-wrap puts this on its own row rather than
    // squeezing in beside them.
    <div className="w-full rounded-lg bg-moss-50 p-2.5">
      <div className="flex items-center gap-2">
        <input
          // eslint-disable-next-line jsx-a11y/no-autofocus -- opened by an
          // explicit tap, and the keyboard is the next thing wanted.
          autoFocus
          value={name}
          onChange={(changeEvent) => setName(changeEvent.target.value)}
          onKeyDown={(keyEvent) => {
            // This sits inside the event form: a bare Enter would submit that
            // and save a half-finished event.
            if (keyEvent.key === 'Enter') {
              keyEvent.preventDefault();
              void submit();
            }
            if (keyEvent.key === 'Escape') {
              keyEvent.preventDefault();
              close();
            }
          }}
          placeholder="Category name"
          aria-label="New category name"
          maxLength={40}
          className="min-w-0 flex-1 rounded-md border border-moss-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
        <button
          type="button"
          onClick={submit}
          disabled={name.trim() === '' || createCategory.isPending}
          className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white transition hover:bg-primary-pressed disabled:opacity-40"
        >
          {createCategory.isPending ? 'Adding…' : 'Add'}
        </button>
        <button
          type="button"
          onClick={close}
          className="rounded-md px-2 py-2 text-sm font-medium text-moss-500 transition hover:bg-moss-200"
        >
          Cancel
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {CATEGORY_PALETTE.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setColor(option)}
            aria-label={`Use colour ${option}`}
            aria-pressed={color === option}
            className={`h-6 w-6 rounded-full transition ${
              color === option ? 'ring-2 ring-primary ring-offset-2' : 'hover:scale-110'
            }`}
            style={{ backgroundColor: option }}
          />
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
