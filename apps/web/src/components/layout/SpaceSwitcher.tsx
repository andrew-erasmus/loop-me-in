import { useEffect, useState } from 'react';
import { faCheck, faChevronDown, faGear } from '@fortawesome/free-solid-svg-icons';
import type { Me } from '@date-calendar/core';
import { useSwitchSpace } from '../../hooks/useAuth.js';
import Icon from '../ui/Icon.js';

/**
 * The name of the calendar you are looking at, as the control that changes it.
 *
 * One account can belong to several spaces — your own, and each one you have
 * accepted an invite into — and switching used to mean opening the space
 * dialog and finding the list inside it. Here the name in the header *is* the
 * switcher: one tap to see your calendars, one to be in another.
 *
 * With only one space there is nothing to switch between, so the button opens
 * the space dialog directly — that's where inviting someone lives, which is
 * the only thing that gets you a second calendar.
 */
export default function SpaceSwitcher({
  me,
  onManageSpace,
  variant,
}: {
  me: Me;
  /** Opens the full space dialog — invites, members, renaming. */
  onManageSpace: () => void;
  /** `title` is the phone header's heading; `chip` is a desktop-header pill. */
  variant: 'title' | 'chip';
}) {
  const switchSpace = useSwitchSpace();
  const [open, setOpen] = useState(false);

  const hasChoice = me.spaces.length > 1;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const trigger =
    variant === 'title' ? (
      <button
        type="button"
        onClick={() => (hasChoice ? setOpen((value) => !value) : onManageSpace())}
        aria-haspopup={hasChoice ? 'menu' : undefined}
        aria-expanded={hasChoice ? open : undefined}
        aria-label={hasChoice ? `${me.space.name} — switch calendar` : me.space.name}
        className="flex w-full min-w-0 items-center gap-1.5 rounded-lg py-0.5 text-left transition active:bg-moss-100"
      >
        <span className="display min-w-0 truncate text-xl text-moss-950">
          {me.space.name}
        </span>
        {hasChoice && (
          <Icon icon={faChevronDown} size="xs" className="shrink-0 text-moss-400" />
        )}
      </button>
    ) : (
      <button
        type="button"
        onClick={() => (hasChoice ? setOpen((value) => !value) : onManageSpace())}
        aria-haspopup={hasChoice ? 'menu' : undefined}
        aria-expanded={hasChoice ? open : undefined}
        title={hasChoice ? 'Switch calendar' : me.space.name}
        className="flex min-w-0 max-w-44 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-moss-700 transition hover:bg-moss-100 hover:text-moss-950"
      >
        <span className="min-w-0 truncate">{me.space.name}</span>
        {hasChoice && (
          <Icon icon={faChevronDown} size="xs" className="shrink-0 text-moss-400" />
        )}
      </button>
    );

  return (
    <div className={`relative min-w-0 ${variant === 'title' ? 'flex-1' : ''}`}>
      {/* On the phone this replaces the header's `h1`, so it keeps being one —
          a button inside a heading is valid, and the page shouldn't lose its
          only top-level heading to gain a menu. */}
      {variant === 'title' ? <h1 className="min-w-0">{trigger}</h1> : trigger}

      {open && (
        <>
          {/* Catches the tap that dismisses the menu. Below the panel, above
              everything else, so a tap anywhere outside closes rather than
              activating whatever it landed on. */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            role="presentation"
          />

          <div
            role="menu"
            aria-label="Your calendars"
            className={`absolute top-full z-50 mt-1.5 w-64 max-w-[calc(100vw-2rem)] rounded-xl bg-white p-1.5 shadow-xl shadow-moss-950/10 ring-1 ring-moss-950/10 ${
              variant === 'title' ? 'left-0' : 'right-0'
            }`}
          >
            {me.spaces.map((space) => {
              const current = space.id === me.space.id;
              return (
                <button
                  key={space.id}
                  type="button"
                  role="menuitem"
                  disabled={switchSpace.isPending}
                  onClick={() => {
                    if (current) {
                      setOpen(false);
                      return;
                    }
                    // The switch clears every cached query, so this component
                    // re-renders against the new space on success; closing now
                    // means the menu isn't sitting open over the change.
                    setOpen(false);
                    switchSpace.mutate(space.id);
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition disabled:opacity-50 ${
                    current
                      ? 'bg-moss-100 font-semibold text-primary'
                      : 'text-moss-700 hover:bg-moss-50'
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">{space.name}</span>
                  {current && <Icon icon={faCheck} size="xs" className="text-primary" />}
                </button>
              );
            })}

            <div className="my-1 border-t border-moss-100" />

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onManageSpace();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-moss-600 transition hover:bg-moss-50"
            >
              <Icon icon={faGear} size="xs" className="text-moss-400" />
              Manage calendars…
            </button>
          </div>
        </>
      )}

      {switchSpace.isError && (
        <p role="alert" className="mt-1 truncate text-xs text-red-700">
          Could not switch calendar.
        </p>
      )}
    </div>
  );
}
