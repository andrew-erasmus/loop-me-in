import { useState } from 'react';
import { faTrashCan } from '@fortawesome/free-solid-svg-icons';
import { CATEGORY_PALETTE, type Category } from '@date-calendar/core';
import {
  useCategoryCounts,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from '../../hooks/useCalendarData.js';
import Icon from '../ui/Icon.js';
import Modal from '../ui/Modal.js';

interface CategoryManagerProps {
  categories: Category[];
  onClose: () => void;
}

export default function CategoryManager({ categories, onClose }: CategoryManagerProps) {
  const { data: counts = {} } = useCategoryCounts();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();

  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<string>(CATEGORY_PALETTE[0]);
  const [pendingDelete, setPendingDelete] = useState<Category | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    const name = newName.trim();
    if (name === '') return;
    setError(null);
    try {
      await createCategory.mutateAsync({ name, color: newColor });
      setNewName('');
      // Step the swatch along so consecutive additions don't all look alike.
      const nextIndex = (CATEGORY_PALETTE.indexOf(newColor as never) + 1) % CATEGORY_PALETTE.length;
      setNewColor(CATEGORY_PALETTE[nextIndex]!);
    } catch {
      setError('Could not create the category.');
    }
  };

  return (
    <Modal title="Categories" onClose={onClose} size="md">
      <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
        <ul className="space-y-1">
          {categories.map((category) => (
            <CategoryRow
              key={category.id}
              category={category}
              eventCount={counts[category.id] ?? 0}
              onRename={(name) =>
                updateCategory.mutate({ id: category.id, patch: { name } })
              }
              onRecolour={(color) =>
                updateCategory.mutate({ id: category.id, patch: { color } })
              }
              onRequestDelete={() => setPendingDelete(category)}
            />
          ))}
        </ul>

        {categories.length === 0 && (
          <p className="py-6 text-center text-sm text-moss-400">
            No categories yet — add one below.
          </p>
        )}
      </div>

      <div className="border-t border-moss-100 px-5 py-4">
        <span className="mb-2 block text-xs font-medium text-moss-600">Add a category</span>
        <div className="flex items-center gap-2">
          <input
            value={newName}
            onChange={(changeEvent) => setNewName(changeEvent.target.value)}
            onKeyDown={(keyEvent) => {
              if (keyEvent.key === 'Enter') {
                keyEvent.preventDefault();
                void handleCreate();
              }
            }}
            placeholder="Name"
            className="min-w-0 flex-1 rounded-md border border-moss-300 px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={newName.trim() === '' || createCategory.isPending}
            className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white transition hover:bg-primary-pressed disabled:opacity-40"
          >
            Add
          </button>
        </div>

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {CATEGORY_PALETTE.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => setNewColor(color)}
              aria-label={`Use colour ${color}`}
              aria-pressed={newColor === color}
              className={`h-6 w-6 rounded-full transition ${
                newColor === color
                  ? 'ring-2 ring-primary ring-offset-2'
                  : 'hover:scale-110'
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>

        {error && (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>

      {pendingDelete && (
        <DeleteConfirmation
          category={pendingDelete}
          eventCount={counts[pendingDelete.id] ?? 0}
          isDeleting={deleteCategory.isPending}
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => {
            await deleteCategory.mutateAsync(pendingDelete.id);
            setPendingDelete(null);
          }}
        />
      )}
    </Modal>
  );
}

function CategoryRow({
  category,
  eventCount,
  onRename,
  onRecolour,
  onRequestDelete,
}: {
  category: Category;
  eventCount: number;
  onRename: (name: string) => void;
  onRecolour: (color: string) => void;
  onRequestDelete: () => void;
}) {
  const [name, setName] = useState(category.name);
  const [showPalette, setShowPalette] = useState(false);

  const commitRename = () => {
    const trimmed = name.trim();
    if (trimmed === '' || trimmed === category.name) {
      setName(category.name);
      return;
    }
    onRename(trimmed);
  };

  return (
    <li className="rounded-lg px-2 py-1.5 transition hover:bg-moss-50">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowPalette((open) => !open)}
          aria-label={`Change colour for ${category.name}`}
          className="h-5 w-5 shrink-0 rounded-full ring-1 ring-moss-900/10 transition hover:scale-110"
          style={{ backgroundColor: category.color }}
        />

        <input
          value={name}
          onChange={(changeEvent) => setName(changeEvent.target.value)}
          onBlur={commitRename}
          onKeyDown={(keyEvent) => {
            if (keyEvent.key === 'Enter') keyEvent.currentTarget.blur();
            if (keyEvent.key === 'Escape') {
              setName(category.name);
              keyEvent.currentTarget.blur();
            }
          }}
          aria-label={`Rename ${category.name}`}
          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-2 py-1 text-sm font-medium text-moss-800 outline-none transition hover:border-moss-200 focus:border-moss-900 focus:bg-white focus:ring-2 focus:ring-moss-900/10"
        />

        <span className="shrink-0 text-xs tabular-nums text-moss-400">
          {eventCount} {eventCount === 1 ? 'event' : 'events'}
        </span>

        <button
          type="button"
          onClick={onRequestDelete}
          aria-label={`Delete ${category.name}`}
          className="shrink-0 rounded p-1 text-moss-400 transition hover:bg-red-50 hover:text-red-600"
        >
          <Icon icon={faTrashCan} size="sm" />
        </button>
      </div>

      {showPalette && (
        <div className="mt-2 flex flex-wrap gap-1.5 pl-7">
          {CATEGORY_PALETTE.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => {
                onRecolour(color);
                setShowPalette(false);
              }}
              aria-label={`Set ${category.name} to ${color}`}
              className={`h-5 w-5 rounded-full transition hover:scale-110 ${
                category.color.toLowerCase() === color
                  ? 'ring-2 ring-primary ring-offset-1'
                  : ''
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      )}
    </li>
  );
}

/**
 * Deleting a category never deletes its events, and the dialog says so — an
 * ambiguous confirmation here is how people lose appointments.
 */
function DeleteConfirmation({
  category,
  eventCount,
  isDeleting,
  onCancel,
  onConfirm,
}: {
  category: Category;
  eventCount: number;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/90 p-6 backdrop-blur-sm"
      role="alertdialog"
      aria-label={`Delete ${category.name}?`}
    >
      <div className="max-w-sm text-center">
        <p className="text-sm font-semibold text-moss-900">
          Delete “{category.name}”?
        </p>
        <p className="mt-1.5 text-sm text-moss-600">
          {eventCount === 0
            ? 'No events use this category.'
            : `${eventCount} ${eventCount === 1 ? 'event' : 'events'} will be kept and shown in grey until you re-categorise ${eventCount === 1 ? 'it' : 'them'}.`}
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-2 text-sm font-medium text-moss-600 transition hover:bg-moss-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
          >
            {isDeleting ? 'Deleting…' : 'Delete category'}
          </button>
        </div>
      </div>
    </div>
  );
}
