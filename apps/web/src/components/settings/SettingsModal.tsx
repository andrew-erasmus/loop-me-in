import { useState } from 'react';
import {
  faBell,
  faChevronLeft,
  faChevronRight,
  faTags,
  type IconDefinition,
} from '@fortawesome/free-solid-svg-icons';
import type { Me } from '@date-calendar/core';
import Icon from '../ui/Icon.js';
import Modal from '../ui/Modal.js';
import NotificationSettings from './NotificationSettings.js';

type Page = 'root' | 'notifications';

/**
 * Settings: a short list of rows, each opening its own page inside the same
 * sheet — the way a phone's own Settings works, and the shape that leaves
 * room for the next page without redesigning this one.
 */
export default function SettingsModal({
  me,
  onClose,
  onManageCategories,
  onSignOut,
}: {
  me: Me;
  onClose: () => void;
  onManageCategories: () => void;
  onSignOut: () => void;
}) {
  const [page, setPage] = useState<Page>('root');

  // One Modal whatever the page, so moving between pages swaps the contents
  // in place rather than remounting the sheet and replaying its slide-in.
  return (
    <Modal title={page === 'notifications' ? 'Notifications' : 'Settings'} onClose={onClose}>
      {page === 'notifications' ? (
        <>
          <BackButton onPress={() => setPage('root')} />
          <NotificationSettings me={me} />
        </>
      ) : (
        <div className="space-y-6 px-5 py-4">
          <ul className="divide-y divide-moss-100 rounded-xl border border-moss-200/80">
            <Row icon={faBell} label="Notifications" onPress={() => setPage('notifications')} />
            <Row
              icon={faTags}
              label="Categories"
              onPress={() => {
                onClose();
                onManageCategories();
              }}
            />
          </ul>

          <section className="flex items-center gap-3 border-t border-moss-100 pt-4">
            <p className="min-w-0 flex-1 truncate text-xs text-moss-400">
              Signed in as {me.user.email}
            </p>
            <button
              type="button"
              onClick={onSignOut}
              className="shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-moss-500 transition hover:bg-moss-100 hover:text-moss-900"
            >
              Sign out
            </button>
          </section>
        </div>
      )}
    </Modal>
  );
}

function Row({
  icon,
  label,
  onPress,
}: {
  icon: IconDefinition;
  label: string;
  onPress: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onPress}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition hover:bg-moss-50"
      >
        <Icon icon={icon} size="sm" className="text-moss-400" />
        <span className="min-w-0 flex-1 text-sm font-medium text-moss-900">{label}</span>
        <Icon icon={faChevronRight} size="xs" className="text-moss-300" />
      </button>
    </li>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <button
      type="button"
      onClick={onPress}
      className="mx-3 mt-3 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-moss-500 transition hover:bg-moss-100 hover:text-moss-900"
    >
      <Icon icon={faChevronLeft} size="xs" />
      Settings
    </button>
  );
}
