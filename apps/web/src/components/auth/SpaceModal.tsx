import { useRef, useState } from 'react';
import {
  faCheck,
  faPen,
  faRightFromBracket,
  faTrash,
  faUserPlus,
} from '@fortawesome/free-solid-svg-icons';
import type { Me } from '@date-calendar/core';
import {
  useCreateInvite,
  useDeleteSpace,
  useLeaveSpace,
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
}: {
  me: Me;
  onClose: () => void;
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
  const ownerId = me.spaces.find((space) => space.id === me.space.id)?.ownerId ?? null;
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
              This is your only calendar. Start another from the Spaces page, or accept
              someone else's invite.
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
              const isOwner = member.id === ownerId;
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
                      {isOwner && (
                        <span className="ml-1.5 text-xs font-normal text-moss-400">
                          created it
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-moss-400">
                      {member.email}
                    </span>
                  </span>

                  {/* The creator can't be removed: a space nobody owns could
                      never be deleted. They can delete it themselves. */}
                  {!isYou && !isOwner && (
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

        {/* The owner can delete it; anyone else can leave it. Never both: a
            space whose creator left could never be deleted by anyone. */}
        {me.spaces.find((space) => space.id === me.space.id)?.role === 'owner' ? (
          <DeleteSpaceSection me={me} onDeleted={onClose} />
        ) : (
          <LeaveSpaceSection me={me} onLeft={onClose} />
        )}

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

/**
 * Deleting the calendar you're looking at. Only its owner sees this: it takes
 * everyone else's plans with it, which is a bigger thing than removing a
 * person, so it asks twice and says exactly what goes.
 */
function DeleteSpaceSection({ me, onDeleted }: { me: Me; onDeleted: () => void }) {
  const deleteSpace = useDeleteSpace();
  const [confirming, setConfirming] = useState(false);

  const others = me.members.filter((member) => member.id !== me.user.id);
  const isOnlySpace = me.spaces.length === 1;

  return (
    <section className="border-t border-moss-100 pt-4">
      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
        >
          <Icon icon={faTrash} size="sm" />
          Delete this calendar
        </button>
      ) : (
        <div className="rounded-xl bg-red-50 px-4 py-3.5">
          <p className="text-sm font-semibold text-red-800">Delete “{me.space.name}”?</p>
          <p className="mt-1 text-sm leading-relaxed text-red-700">
            Every event, list and category in it goes too
            {others.length > 0 && (
              <> — for {others.map((m) => m.name.split(' ')[0]).join(' and ')} as well</>
            )}
            . This can’t be undone.
            {isOnlySpace && ' You’ll start again in a new, empty calendar.'}
          </p>
          {deleteSpace.isError && (
            <p role="alert" className="mt-2 text-sm text-red-800">
              {(deleteSpace.error as Error).message}
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={deleteSpace.isPending}
              onClick={() => deleteSpace.mutate(me.space.id, { onSuccess: onDeleted })}
              className="rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
            >
              {deleteSpace.isPending ? 'Deleting…' : 'Delete for everyone'}
            </button>
            <button
              type="button"
              disabled={deleteSpace.isPending}
              onClick={() => setConfirming(false)}
              className="rounded-lg px-3.5 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Leaving a calendar someone else created. Lighter than deleting — it only
 * takes you out — but still asked twice, because coming back needs a new
 * invite.
 */
function LeaveSpaceSection({ me, onLeft }: { me: Me; onLeft: () => void }) {
  const leaveSpace = useLeaveSpace();
  const [confirming, setConfirming] = useState(false);

  const others = me.members.filter((member) => member.id !== me.user.id);
  const isOnlySpace = me.spaces.length === 1;

  return (
    <section className="border-t border-moss-100 pt-4">
      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
        >
          <Icon icon={faRightFromBracket} size="sm" />
          Leave this calendar
        </button>
      ) : (
        <div className="rounded-xl bg-red-50 px-4 py-3.5">
          <p className="text-sm font-semibold text-red-800">Leave “{me.space.name}”?</p>
          <p className="mt-1 text-sm leading-relaxed text-red-700">
            Everything you planned together stays
            {others.length > 0 && (
              <> for {others.map((m) => m.name.split(' ')[0]).join(' and ')}</>
            )}
            . Anything you marked Just me, and any surprise you were keeping, is deleted. To come
            back you’ll need a new invite.
            {isOnlySpace && ' You’ll start again in a new, empty calendar.'}
          </p>
          {leaveSpace.isError && (
            <p role="alert" className="mt-2 text-sm text-red-800">
              {(leaveSpace.error as Error).message}
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={leaveSpace.isPending}
              onClick={() => leaveSpace.mutate(me.space.id, { onSuccess: onLeft })}
              className="rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
            >
              {leaveSpace.isPending ? 'Leaving…' : 'Leave'}
            </button>
            <button
              type="button"
              disabled={leaveSpace.isPending}
              onClick={() => setConfirming(false)}
              className="rounded-lg px-3.5 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
