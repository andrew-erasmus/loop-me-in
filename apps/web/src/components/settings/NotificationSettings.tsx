import { faBell, faCheck } from '@fortawesome/free-solid-svg-icons';
import type { Me, NotificationKind } from '@date-calendar/core';
import {
  useNotificationSettings,
  usePushDevice,
  useSendTestNotification,
  useUpdateNotificationPreferences,
  type DeviceState,
} from '../../hooks/useNotifications.js';
import Icon from '../ui/Icon.js';
import Switch from '../ui/Switch.js';

const GROUPS: {
  heading: string;
  kinds: { kind: NotificationKind; label: string; hint?: string }[];
}[] = [
  {
    heading: 'Calendar',
    kinds: [
      {
        kind: 'eventAdded',
        label: 'Adds a plan',
        hint: 'Surprises included — you’ll hear when, never what.',
      },
      { kind: 'eventChanged', label: 'Moves or renames a plan' },
      { kind: 'eventRemoved', label: 'Removes a plan' },
    ],
  },
  {
    heading: 'Lists',
    kinds: [
      { kind: 'itemAdded', label: 'Adds something to a list' },
      {
        kind: 'itemKeen',
        label: 'Is keen on something',
        hint: 'Including when you’re both keen on the same thing.',
      },
      { kind: 'itemScheduled', label: 'Gives something on a list a date' },
    ],
  },
  {
    heading: 'People',
    kinds: [{ kind: 'memberJoined', label: 'Joins one of your calendars' }],
  },
];

/**
 * Two separate questions on one page: does *this browser* get notifications
 * at all, and which kinds does *this account* want. The first is answered
 * per device, because permission is granted per browser; the second follows
 * you everywhere you have said yes.
 */
export default function NotificationSettings({ me }: { me: Me }) {
  const settings = useNotificationSettings();
  const update = useUpdateNotificationPreferences();
  const device = usePushDevice(me.user.id);

  const preferences = settings.data?.preferences;

  return (
    <div className="space-y-6 px-5 py-4">
      <section>
        <h3 className="mb-2 text-[10px] font-bold tracking-widest text-moss-400 uppercase">
          This device
        </h3>
        {settings.data && !settings.data.pushConfigured && (
          <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
            The server can’t send notifications yet: <code>FIREBASE_SERVICE_ACCOUNT</code> isn’t set
            on the API.
          </p>
        )}
        <DeviceCard device={device} />
      </section>

      <section>
        <h3 className="mb-1 text-[10px] font-bold tracking-widest text-moss-400 uppercase">
          Tell me when someone else…
        </h3>

        {settings.isError ? (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            Couldn’t load your notification settings. {(settings.error as Error).message}
          </p>
        ) : (
          <div className="space-y-4">
            {GROUPS.map((group) => (
              <div key={group.heading}>
                <p className="mt-3 mb-1 text-xs font-semibold text-moss-500">{group.heading}</p>
                <ul className="divide-y divide-moss-100 rounded-xl border border-moss-200/80">
                  {group.kinds.map(({ kind, label, hint }) => (
                    <li key={kind} className="flex items-center gap-3 px-3 py-3">
                      <span className="min-w-0 flex-1">
                        <span
                          id={`notify-${kind}`}
                          className="block text-sm font-medium text-moss-900"
                        >
                          {label}
                        </span>
                        {hint && (
                          <span
                            id={`notify-${kind}-hint`}
                            className="mt-0.5 block text-xs text-moss-400"
                          >
                            {hint}
                          </span>
                        )}
                      </span>
                      <Switch
                        checked={preferences?.[kind] ?? false}
                        disabled={!preferences}
                        onChange={(checked) => update.mutate({ [kind]: checked })}
                        labelledBy={`notify-${kind}`}
                        describedBy={hint ? `notify-${kind}-hint` : undefined}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {update.isError && (
          <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            Couldn’t save that. {(update.error as Error).message}
          </p>
        )}

        <p className="mt-3 text-xs leading-relaxed text-moss-400">
          These apply on every device you’ve turned notifications on for. You’re never told about
          your own changes, or about anything someone has kept to themselves.
        </p>
      </section>
    </div>
  );
}

const DEVICE_MESSAGES: Partial<Record<DeviceState, string>> = {
  checking: 'Checking what this browser can do…',
  unconfigured:
    'Notifications aren’t set up in this build of the app yet — the VITE_FIREBASE_* keys are missing.',
  'needs-install':
    'On iPhone and iPad, notifications only work from the Home Screen app. In Safari, tap Share → Add to Home Screen, then open Loop Me In from its icon and come back here.',
  unsupported: 'This browser can’t receive notifications. Try Chrome, Edge, Firefox or Safari.',
  blocked:
    'Notifications are blocked for Loop Me In. Allow them in your browser’s site settings — on an iPhone, Settings → Notifications → Loop Me In — then come back here.',
};

function DeviceCard({ device }: { device: ReturnType<typeof usePushDevice> }) {
  const test = useSendTestNotification();
  const message = DEVICE_MESSAGES[device.state];

  return (
    <div className="rounded-xl border border-moss-200/80 px-4 py-3.5">
      {message ? (
        <p className="text-sm leading-relaxed text-moss-600">{message}</p>
      ) : device.state === 'on' ? (
        <>
          <p className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Icon icon={faCheck} size="sm" />
            On for this device
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={test.isPending}
              onClick={() => test.mutate()}
              className="rounded-lg border border-moss-200 px-3 py-2 text-sm font-semibold text-moss-800 transition hover:border-moss-300 hover:bg-moss-50 disabled:opacity-50"
            >
              {test.isPending ? 'Sending…' : 'Send a test'}
            </button>
            <button
              type="button"
              disabled={device.busy}
              onClick={device.disable}
              className="rounded-lg px-3 py-2 text-sm font-medium text-moss-500 transition hover:bg-moss-100 hover:text-moss-900 disabled:opacity-50"
            >
              Turn off on this device
            </button>
          </div>
          {test.data && (
            <p className="mt-2 text-xs text-moss-500">
              {test.data.sent > 0
                ? `Sent to ${test.data.sent} ${test.data.sent === 1 ? 'device' : 'devices'}. It should appear in a moment.`
                : 'No device accepted it. Try turning notifications off and on again here.'}
            </p>
          )}
          {test.isError && (
            <p role="alert" className="mt-2 text-xs text-red-700">
              {(test.error as Error).message}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="text-sm leading-relaxed text-moss-600">
            Get a notification when someone else changes a plan or adds to a list.
          </p>
          <button
            type="button"
            disabled={device.busy}
            onClick={device.enable}
            className="mt-3 flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-primary-pressed disabled:opacity-50"
          >
            <Icon icon={faBell} size="sm" />
            {device.busy ? 'Turning on…' : 'Turn on notifications'}
          </button>
        </>
      )}

      {device.error && (
        <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {device.error}
        </p>
      )}
    </div>
  );
}
