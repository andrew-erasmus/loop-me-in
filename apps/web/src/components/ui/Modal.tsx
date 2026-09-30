import { useEffect, useState, type ReactNode } from 'react';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import Icon from './Icon.js';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Wider variant for the category manager's list. */
  size?: 'sm' | 'md';
}

/**
 * Shared dialog shell: backdrop, Escape-to-close, and a scroll lock.
 *
 * Below `sm` this becomes a bottom sheet — anchored to the bottom edge,
 * full-width, sliding up on entry — matching the RN app's `Sheet.tsx`. Above
 * `sm` it's the same centred dialog it always was. Keeping the chrome in one
 * component means only this file changes, not every form inside it.
 */
export default function Modal({ title, onClose, children, size = 'sm' }: ModalProps) {
  // Slides in on mount rather than being visible from frame one — mirrors the
  // RN sheet's entrance. Starts closed so the transition actually has
  // something to animate from.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-moss-950/30 backdrop-blur-[3px] transition-opacity duration-200 sm:items-start sm:p-4 sm:pt-[10vh] ${
        entered ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        // `relative` so an inner confirmation step can cover the panel.
        // Bottom sheet below `sm`: full width, square top corners rounded
        // only, slides up from the closed position; a normal centred dialog
        // from `sm` up, where the slide/rounding don't apply.
        className={`relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white shadow-2xl shadow-moss-950/10 ring-1 ring-moss-950/5 transition-transform duration-200 ease-out sm:max-h-none sm:rounded-2xl ${
          entered ? 'translate-y-0' : 'translate-y-full sm:translate-y-0'
        } ${size === 'md' ? 'sm:max-w-lg' : 'sm:max-w-md'}`}
      >
        <div className="flex items-center justify-between border-b border-moss-100 px-5 py-4">
          <h2 className="display text-lg text-moss-950">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-moss-400 transition hover:bg-moss-100 hover:text-moss-700"
          >
            <Icon icon={faXmark} size="md" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
          {children}
        </div>
      </div>
    </div>
  );
}
