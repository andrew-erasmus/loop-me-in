import { useRef, useState } from 'react';
import { faCheck, faPen, faUserPlus } from '@fortawesome/free-solid-svg-icons';
import type { Me } from '@date-calendar/core';
import {
  useCreateInvite,
  useRemoveMember,
  useRenameSpace,
  useSwitchSpace,
} from '../../hooks/useAuth.js';
import Avatar from '../ui/Avatar.js';
import Icon from '../ui/Icon.js';
import Modal from '../ui/Modal.js';

/**
 * Everything about *which* calendar you are looking at and who else is in it:
 * switch between your spaces, invite someone, remove someone.
 *
 * One dialog rather than three entry points in the header. These are the same
 * question asked three ways — "who is this calendar for?" — and a header with a
 * switcher, an invite button and a members menu spends three controls on
 * something two people touch about twice a year.
 */
export default function SpaceModal({
  me,
  onClose,
  onManageCategories,
  onSignOut,
}: {
  me: Me;
  onClose: () => void;
  /** Desktop reaches these from `CalendarHeader` instead — shown here only
   * below `md`, where that header doesn't exist. */
  onManageCategories: () => void;
  onSignOut: () => void;
}) {
  const switchSpace = useSwitchSpace();
  const removeMember = useRemoveMember();
  const createInvite = useCreateInvite();
  const renameSpace = useRenameSpace();

  const [copied, setCopied] = useState(false);
  const [confirmingRemoval, setConfirmingRemoval] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(me.space.name);
  const linkRef = useRef<HTMLInputElement>(null);

  const invite = createInvite.data;
  const busy = switchSpace.isPending || removeMember.isPending;

  const saveRename = () => {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === me.space.name) {
      setRenaming(false);
      return;
    }
    renameSpace.mutate(
      { spaceId: me.space.id, name: trimmed },
      { onSuccess: () => setRenaming(false) },
    );
  };

  const copy = async () => {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; selecting the text lets them copy it
      // by hand rather than leaving a button that silently does nothing.
      linkRef.current?.select();
    }
  };

  return (
    <Modal title="Your calendars" onClose={onClose}>
      <div className="space-y-6 px-5 py-4">
        <section>
          <h3 className="mb-2 text-[10px] font-bold tracking-widest text-moss-400 uppercase">
            Spaces
          </h3>
          <ul className="space-y-1">
            {me.spaces.map((space) => {
              const current = space.id === me.space.id;

              if (current && renaming) {
                return (
                  <li key={space.id} className="flex items-center gap-2 px-1 py-1">
                    <input
                      autoFocus
                      value={nameDraft}
                      onChange={(event) => setNameDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') saveRename();
                        if (event.key === 'Escape') setRenaming(false);
                      }}
                      maxLength={60}
                      className="min-w-0 flex-1 rounded-lg border border-moss-300 px-2.5 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                    />
                    <button
                      type="button"
                      disabled={renameSpace.isPending}
                      onClick={saveRename}
                      className="shrink-0 rounded-md bg-primary px-2.5 py-2 text-xs font-semibold text-white transition hover:bg-primary-pressed disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenaming(false)}
                      className="shrink-0 rounded-md px-2 py-2 text-xs font-medium text-moss-400 transition hover:bg-moss-100"
                    >
                      Cancel
                    </button>
                  </li>
                );
              }

              return (
                <li key={space.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={busy || current}
                    onClick={() => switchSpace.mutate(space.id)}
                    className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                      current
                        ? 'bg-moss-100 font-semibold text-primary'
                        : 'text-moss-700 hover:bg-moss-50 disabled:opacity-50'
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">{space.name}</span>
                    {current && <Icon icon={faCheck} size="xs" className="text-primary" />}
                  </button>
                  {current && (
                    <button
                      type="button"
                      onClick={() => {
                        setNameDraft(space.name);
                        setRenaming(true);
                      }}
                      aria-label="Rename this calendar"
                      title="Rename"
                      className="shrink-0 rounded-md p-2 text-moss-400 transition hover:bg-moss-100 hover:text-moss-700"
                    >
                      <Icon icon={faPen} size="xs" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {renameSpace.isError && (
            <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {(renameSpace.error as Error).message}
            </p>
          )}
          {me.spaces.length === 1 && (
            <p className="mt-2 text-xs text-moss-400">
              This is your only calendar. You get another one by accepting someone else's
              invite.
            </p>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-[10px] font-bold tracking-widest text-moss-400 uppercase">
            In {me.space.name}
          </h3>
          <ul className="space-y-1">
            {me.members.map((member) => {
              const isYou = member.id === me.user.id;
              const confirming = confirmingRemoval === member.id;

              return (
                <li
                  key={member.id}
                  className="flex items-center gap-3 rounded-lg px-3 py-2"
                >
                  <Avatar user={member} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-moss-900">
                      {member.name}
                      {isYou && (
                        <span className="ml-1.5 text-xs font-normal text-moss-400">you</span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-moss-400">
                      {member.email}
                    </span>
                  </span>

                  {!isYou && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={
                        confirming
                          ? () => removeMember.mutate(member.id)
                          : () => setConfirmingRemoval(member.id)
                      }
                      onBlur={() => setConfirmingRemoval(null)}
                      className={`shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                        confirming
                          ? 'bg-red-600 text-white hover:bg-red-700'
                          : 'text-red-600 hover:bg-red-50'
                      }`}
                    >
                      {confirming ? 'Really remove?' : 'Remove'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          {removeMember.isError && (
            <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {(removeMember.error as Error).message}
            </p>
          )}

          <p className="mt-2 text-xs leading-relaxed text-moss-400">
            Removing someone keeps everything you planned together. Only what was theirs
            alone goes — anything they marked private, and any surprise they were keeping.
          </p>
        </section>

        <section>
          <h3 className="mb-2 text-[10px] font-bold tracking-widest text-moss-400 uppercase">
            Invite
          </h3>

          {!invite ? (
            <button
              type="button"
              disabled={createInvite.isPending}
              onClick={() => createInvite.mutate()}
              className="flex items-center gap-2 rounded-lg border border-moss-200 px-3 py-2 text-sm font-semibold text-moss-800 transition hover:border-moss-300 hover:bg-moss-50 disabled:opacity-50"
            >
              <Icon icon={faUserPlus} size="sm" className="text-moss-400" />
              {createInvite.isPending ? 'Creating a link…' : 'Create an invite link'}
            </button>
          ) : (
            <>
              <div className="flex gap-2">
                <input
                  ref={linkRef}
                  readOnly
                  value={invite.url}
                  onFocus={(focusEvent) => focusEvent.currentTarget.select()}
                  className="min-w-0 flex-1 rounded-md border border-moss-200 bg-moss-50 px-3 py-2 font-mono text-xs text-moss-700 outline-none"
                />
                <button
                  type="button"
                  onClick={copy}
                  className="shrink-0 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white transition hover:bg-primary-pressed"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="mt-2 text-xs text-moss-400">
                Single use, and it expires in seven days. The code is{' '}
                <code className="rounded bg-moss-100 px-1 py-0.5 font-semibold text-moss-600">
                  {invite.code}
                </code>{' '}
                if it is easier to read out than to send.
              </p>
            </>
          )}

          {createInvite.isError && (
            <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              Could not create an invite link. {(createInvite.error as Error).message}
            </p>
          )}
        </section>

        {/* Desktop reaches these through `CalendarHeader`; below `md` there is
            no other place they live. */}
        <section className="space-y-1 border-t border-moss-100 pt-4 md:hidden">
          <button
            type="button"
            onClick={() => {
              onClose();
              onManageCategories();
            }}
            className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-moss-700 transition hover:bg-moss-50"
          >
            Manage categories
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-moss-400 transition hover:bg-moss-50 hover:text-moss-900"
          >
            Sign out
          </button>
        </section>

        <div className="flex justify-end border-t border-moss-100 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-2 text-sm font-medium text-moss-600 transition hover:bg-moss-100"
          >
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}
