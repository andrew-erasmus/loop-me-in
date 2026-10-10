import { useEffect } from 'react';
import { format, isSameDay, type CalendarEvent, type EventTimes } from '@date-calendar/core';

/**
 * "Move it here?" — the question a drag asks before it changes anything.
 *
 * A drop used to save straight away, and every save notifies the other
 * person; nudging an event into place over three drags meant three
 * notifications. Now a drop only *proposes* a time. The event sits where it
 * was dropped while this asks, so you can see what you're agreeing to, and
 * snaps back if you cancel.
 *
 * A floating card rather than a dialog for the same reason: a backdrop would
 * hide the very thing being confirmed.
 */
export default function MoveConfirmBar({
  event,
  times,
  notifies,
  onConfirm,
  onCancel,
}: {
  event: CalendarEvent;
  times: EventTimes;
  /** Who will hear about it, by first name, or null if nobody will. */
  notifies: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === 'Escape') {
        keyEvent.preventDefault();
        onCancel();
      } else if (keyEvent.key === 'Enter') {
        keyEvent.preventDefault();
        onConfirm();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onConfirm, onCancel]);

  return (
    <div
      role="alertdialog"
      aria-label="Confirm move"
      aria-describedby="move-confirm-text"
      // Above the phone's tab bar (and in place of the new-event button,
      // which App hides meanwhile); bottom-centre on desktop.
      className="fixed inset-x-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-md rounded-2xl bg-white p-4 shadow-2xl shadow-moss-950/20 ring-1 ring-moss-950/10 md:bottom-6"
    >
      <p id="move-confirm-text" className="text-sm text-moss-700">
        Move <span className="font-semibold text-moss-950">{event.title}</span> to{' '}
        <span className="font-semibold text-moss-950">{describeTimes(times, event.allDay)}</span>?
      </p>
      {notifies && <p className="mt-1 text-xs text-moss-400">{notifies} may get a notification.</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3.5 py-2 text-sm font-medium text-moss-600 hover:bg-moss-100"
        >
          Cancel
        </button>
        <button
          type="button"
          autoFocus
          onClick={onConfirm}
          className="rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-white hover:bg-primary-pressed"
        >
          Move
        </button>
      </div>
    </div>
  );
}

/** `Fri 3 Oct, 19:00 – 20:00`, `Fri 3 Oct 22:00 – Sat 4 Oct 01:00`, `Fri 3 – Sun 5 Oct`. */
function describeTimes(times: EventTimes, allDay: boolean): string {
  const start = new Date(times.startsAt);
  const end = new Date(times.endsAt);
  const sameDay = isSameDay(start, end);

  if (allDay) {
    if (sameDay) return format(start, 'EEE d MMM');
    return start.getMonth() === end.getMonth()
      ? `${format(start, 'EEE d')} – ${format(end, 'EEE d MMM')}`
      : `${format(start, 'EEE d MMM')} – ${format(end, 'EEE d MMM')}`;
  }
  return sameDay
    ? `${format(start, 'EEE d MMM, HH:mm')} – ${format(end, 'HH:mm')}`
    : `${format(start, 'EEE d MMM HH:mm')} – ${format(end, 'EEE d MMM HH:mm')}`;
}
