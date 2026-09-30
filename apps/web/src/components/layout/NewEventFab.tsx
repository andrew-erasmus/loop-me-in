import { faPlus } from '@fortawesome/free-solid-svg-icons';
import Icon from '../ui/Icon.js';

/**
 * The phone-width "new event" control — a floating circular button above the
 * tab bar. Desktop keeps its "New event" button in `CalendarHeader` instead.
 */
export default function NewEventFab({ onPress }: { onPress: () => void }) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label="New event"
      className="fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-white shadow-lg shadow-moss-950/25 transition hover:bg-primary-pressed md:hidden"
    >
      <Icon icon={faPlus} size="lg" className="h-7 w-7" />
    </button>
  );
}
