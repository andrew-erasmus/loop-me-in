import { format } from 'date-fns';
import { faGift } from '@fortawesome/free-solid-svg-icons';
import type { CalendarEvent, User } from '@date-calendar/core';
import Avatar from '../ui/Avatar.js';
import Icon from '../ui/Icon.js';
import Modal from '../ui/Modal.js';

/**
 * What you get when you click on a surprise that isn't yours.
 *
 * Deliberately a different dialog from `EventModal` rather than a read-only
 * mode of it: there is nothing here to edit, and no form that could
 * accidentally submit. The times are all there is to show — the server never
 * sent the rest.
 */
export default function SurpriseModal({
  event,
  planner,
  onClose,
}: {
  event: CalendarEvent;
  planner: User | undefined;
  onClose: () => void;
}) {
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);

  const when = event.allDay
    ? format(start, 'EEEE d MMMM')
    : `${format(start, 'EEEE d MMMM')}, ${format(start, 'HH:mm')}–${format(end, 'HH:mm')}`;

  return (
    <Modal title="It's a surprise" onClose={onClose}>
      <div className="space-y-4 px-5 py-6 text-center">
        <Icon icon={faGift} size="lg" className="mx-auto h-10 w-10 text-moss-300" />

        <div>
          <p className="text-sm font-semibold text-moss-800">{when}</p>
          <p className="mt-1.5 text-sm text-moss-500">
            {planner ? (
              <>
                <strong className="font-medium text-moss-700">{planner.name}</strong> has
                planned something.
              </>
            ) : (
              'Someone has planned something.'
            )}
          </p>
        </div>

        <p className="mx-auto max-w-xs text-xs leading-relaxed text-moss-400">
          You can see the time is taken so you don’t book over it — but not what it is.
          Nothing else about it was sent to your browser.
        </p>

        {planner && (
          <div className="flex items-center justify-center gap-1.5 text-xs text-moss-400">
            <Avatar user={planner} size="xs" />
            ask them nicely
          </div>
        )}

        <div className="flex justify-center border-t border-moss-100 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-moss-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-moss-700"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
