import { faBell, faSpinner } from '@fortawesome/free-solid-svg-icons';
import Icon from '../ui/Icon.js';

/**
 * The "Turn on notifications" button, shared by Settings and the first-run
 * prompt.
 *
 * Its label and size never change, and it has no transitions: iOS freezes the
 * page while its permission alert is up, and anything mid-animation or
 * mid-reflow at that moment stays frozen half-drawn under the alert. While
 * busy (registering, after the alert has closed) only the icon changes.
 */
export default function EnableNotificationsButton({
  busy,
  onPress,
  className = '',
}: {
  busy: boolean;
  onPress: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={busy}
      aria-busy={busy}
      className={`flex items-center justify-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-white hover:bg-primary-pressed disabled:cursor-wait ${className}`}
    >
      <Icon icon={busy ? faSpinner : faBell} size="sm" className={busy ? 'animate-spin' : ''} />
      Turn on notifications
    </button>
  );
}
