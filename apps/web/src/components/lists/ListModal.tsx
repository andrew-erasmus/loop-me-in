import { useState, type FormEvent } from 'react';
import {
  ApiError,
  CATEGORY_PALETTE,
  listInputSchema,
  type List,
} from '@date-calendar/core';
import Modal from '../ui/Modal.js';

/** Suggestions, not a restriction — the field takes any emoji you type. */
const SUGGESTED_EMOJI = ['🎬', '📍', '✨', '🍽️', '📚', '🎵', '🏔️', '✈️', '🎁', '🏡'];

interface ListModalProps {
  /** Present when editing; absent when creating. */
  list?: List;
  onClose: () => void;
  onSave: (values: { name: string; emoji: string | null; color: string }) => Promise<unknown>;
  onDelete?: () => Promise<unknown>;
  itemCount?: number;
  isSaving: boolean;
}

export default function ListModal({
  list,
  onClose,
  onSave,
  onDelete,
  itemCount = 0,
  isSaving,
}: ListModalProps) {
  const [name, setName] = useState(list?.name ?? '');
  const [emoji, setEmoji] = useState(list?.emoji ?? '');
  const [color, setColor] = useState(list?.color ?? CATEGORY_PALETTE[1]);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const handleSubmit = async (formEvent: FormEvent) => {
    formEvent.preventDefault();
    setError(null);

    const values = {
      name: name.trim(),
      emoji: emoji.trim() === '' ? null : emoji.trim(),
      color,
    };

    const parsed = listInputSchema.safeParse(values);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check the form');
      return;
    }

    try {
      await onSave(values);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof ApiError ? saveError.message : 'Could not save the list.');
    }
  };

  return (
    <Modal title={list ? 'Edit list' : 'New list'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
        <div className="flex gap-3">
          <div className="w-20">
            <label htmlFor="list-emoji" className="mb-1 block text-xs font-medium text-moss-600">
              Icon
            </label>
            <input
              id="list-emoji"
              value={emoji}
              onChange={(changeEvent) => setEmoji(changeEvent.target.value)}
              placeholder="🎬"
              className="w-full rounded-md border border-moss-300 px-3 py-2 text-center text-lg outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </div>
          <div className="flex-1">
            <label htmlFor="list-name" className="mb-1 block text-xs font-medium text-moss-600">
              Name
            </label>
            <input
              id="list-name"
              value={name}
              onChange={(changeEvent) => setName(changeEvent.target.value)}
              placeholder="Movies to watch"
              autoFocus
              className="w-full rounded-md border border-moss-300 px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {SUGGESTED_EMOJI.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setEmoji(option)}
              aria-label={`Use ${option}`}
              className={`rounded-md border px-2 py-1 text-base transition ${
                emoji === option
                  ? 'border-primary bg-moss-100'
                  : 'border-moss-200 hover:bg-moss-50'
              }`}
            >
              {option}
            </button>
          ))}
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-medium text-moss-600">Colour</span>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORY_PALETTE.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setColor(option)}
                aria-label={`Use ${option}`}
                aria-pressed={color === option}
                className={`h-7 w-7 rounded-full transition ${
                  color === option ? 'ring-2 ring-primary ring-offset-2' : ''
                }`}
                style={{ backgroundColor: option }}
              />
            ))}
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex items-center gap-2 border-t border-moss-100 pt-4">
          {list && onDelete && (
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
              {confirmingDelete
                ? itemCount > 0
                  ? `Delete ${itemCount} item${itemCount === 1 ? '' : 's'} too?`
                  : 'Really delete?'
                : 'Delete'}
            </button>
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

        {list && (
          <p className="text-xs leading-relaxed text-moss-400">
            Deleting a list removes the things on it. Anything already on the calendar
            stays there — cancelling a plan is a separate decision.
          </p>
        )}
      </form>
    </Modal>
  );
}
