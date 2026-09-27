import {
  faCalendarDays,
  faClockRotateLeft,
  faWandMagicSparkles,
  type IconDefinition,
} from '@fortawesome/free-solid-svg-icons';
import Icon from '../ui/Icon.js';

export type MobileTab = 'calendar' | 'lists' | 'memories';

const TABS: { tab: MobileTab; label: string; icon: IconDefinition }[] = [
  { tab: 'calendar', label: 'Calendar', icon: faCalendarDays },
  { tab: 'lists', label: 'Lists', icon: faWandMagicSparkles },
  { tab: 'memories', label: 'Memories', icon: faClockRotateLeft },
];

/**
 * The phone-width bottom tab bar — Calendar / Lists / Memories, same three
 * destinations and same icons as RN's `Shell`. Desktop keeps them as three of
 * the six buttons in `CalendarHeader`'s view switcher instead.
 */
export default function MobileTabBar({
  active,
  onSelect,
}: {
  active: MobileTab;
  onSelect: (tab: MobileTab) => void;
}) {
  return (
    <nav
      aria-label="Main"
      // A normal flex child, not `fixed` — `fixed` positions against the
      // *layout* viewport, which on iOS can drift out of step with what's
      // actually on screen (especially once the keyboard has been involved),
      // leaving a gap below it. As the last child of the page's own flex
      // column it's always exactly at the true bottom, no viewport-tracking
      // required.
      className="flex shrink-0 border-t border-moss-200/80 bg-white pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] md:hidden"
    >
      {TABS.map(({ tab, label, icon }) => {
        const isActive = active === tab;
        return (
          <button
            key={tab}
            type="button"
            onClick={() => onSelect(tab)}
            aria-current={isActive ? 'true' : undefined}
            className="flex flex-1 flex-col items-center gap-1 py-1"
          >
            <Icon
              icon={icon}
              size="lg"
              className={isActive ? 'text-primary' : 'text-moss-400'}
            />
            <span
              className={`text-[11px] font-bold ${
                isActive ? 'text-primary' : 'text-moss-400'
              }`}
            >
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
