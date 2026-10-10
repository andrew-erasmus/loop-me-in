import { useEffect, useState } from 'react';
import { faBell } from '@fortawesome/free-solid-svg-icons';
import type { Me } from '@date-calendar/core';
import { usePushDevice } from '../../hooks/useNotifications.js';
import Icon from '../ui/Icon.js';
import Modal from '../ui/Modal.js';
import EnableNotificationsButton from './EnableNotificationsButton.js';

/**
 * Asks once, after signing in, whether this device should get notifications.
 *
 * Once per account per device, whatever the answer: "Not now" is an answer,
 * and asking again on every launch would turn a question into nagging. The
 * switch stays in Settings for anyone who changes their mind.
 *
 * Only asked where yes can work — this device supports push, hasn't already
 * been told no, and isn't already on. An iPhone in a Safari tab gets the one
 * thing it needs to know instead: notifications come with the Home Screen app.
 */

/** Long enough for the launch splash to have faded first. */
const DELAY_MS = 1500;

const askedKey = (userId: string) => `push-asked:${userId}`;

function alreadyAsked(userId: string): boolean {
  try {
    return localStorage.getItem(askedKey(userId)) !== null;
  } catch {
    // No storage means no memory of having asked — so don't ask at all,
    // rather than asking on every single launch.
    return true;
  }
}

function markAsked(userId: string): void {
  try {
    localStorage.setItem(askedKey(userId), new Date().toISOString());
  } catch {
    // See `alreadyAsked`.
  }
}

export default function NotificationPrompt({
  me,
  onVisibleChange,
}: {
  me: Me;
  /** So the app can hold its keyboard shortcuts while this is open. */
  onVisibleChange: (visible: boolean) => void;
}) {
  const userId = me.user.id;
  const device = usePushDevice(userId);
  const [due, setDue] = useState(false);
  const [dismissed, setDismissed] = useState(() => alreadyAsked(userId));

  useEffect(() => {
    const timer = setTimeout(() => setDue(true), DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  const askable = device.state === 'off' || device.state === 'needs-install';
  const visible = due && !dismissed && (askable || device.busy);

  useEffect(() => {
    onVisibleChange(visible);
  }, [visible, onVisibleChange]);

  if (!visible) return null;

  const close = () => {
    markAsked(userId);
    setDismissed(true);
  };

  const others = me.members.filter((member) => member.id !== userId);
  const who = others.length === 1 ? others[0]!.name.trim().split(/\s+/)[0] : 'someone';

  return (
    <Modal title="Notifications" onClose={close}>
      <div className="px-5 py-5 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-moss-100 text-primary">
          <Icon icon={faBell} size="lg" />
        </span>
        <p className="display mt-3 text-xl text-moss-950">Stay in the loop?</p>

        {device.state === 'needs-install' ? (
          <>
            <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-moss-500">
              On iPhone, notifications come with the Home Screen app. Tap Share → Add to Home
              Screen, open Loop Me In from its icon, and you’ll be asked there.
            </p>
            <button
              type="button"
              onClick={close}
              className="mt-5 w-full rounded-lg bg-primary px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-primary-pressed"
            >
              Got it
            </button>
          </>
        ) : (
          <>
            <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-moss-500">
              Get a notification when {who} adds or moves a plan, or adds something to a list. You
              can choose exactly which in Settings.
            </p>
            {device.error && (
              <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {device.error}
              </p>
            )}
            <EnableNotificationsButton
              busy={device.busy}
              onPress={async () => {
                // Asked is asked, whether they allow it, block it, or it fails.
                markAsked(userId);
                // Close on yes-and-registered, or on a no. Stay open if they
                // said yes but registering failed, so the error is seen.
                const enabled = await device.enable();
                if (enabled || Notification.permission === 'denied') setDismissed(true);
              }}
              className="mt-5 w-full py-2.5"
            />
            <button
              type="button"
              onClick={close}
              disabled={device.busy}
              className="mt-2 w-full rounded-lg px-3.5 py-2.5 text-sm font-medium text-moss-500 hover:bg-moss-100 hover:text-moss-900"
            >
              Not now
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
