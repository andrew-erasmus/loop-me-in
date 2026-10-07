import { useRef, useState, type FormEvent } from 'react';
import {
  faArrowRight,
  faCheck,
  faGear,
  faPlus,
  faUserPlus,
} from '@fortawesome/free-solid-svg-icons';
import type { Me, SpaceSummary } from '@date-calendar/core';
import {
  useCreateInvite,
  useCreateSpace,
  useJoinSpace,
  useSwitchSpace,
} from '../../hooks/useAuth.js';
import Avatar from '../ui/Avatar.js';
import Icon from '../ui/Icon.js';

/**
 * Every space you share, and with whom — the place to pick which one you are
 * looking at, start a new one, or get into someone else's.
 *
 * The header switcher already flips between spaces in a tap; this page is for
 * when the question is bigger than "the other one": who is in which, and making
 * a new one for a different group of people. Opening a space takes you back to
 * its calendar, since that is what you came to look at.
 */
export default function SpacesView({
  me,
  onOpenSpace,
  onManageSpace,
}: {
  me: Me;
  /** Called once a space is the active one, to go and look at it. */
  onOpenSpace: () => void;
  /** Opens the space dialog — renaming and removing people. */
  onManageSpace: () => void;
}) {
  const switchSpace = useSwitchSpace();

  return (
    <div className="mx-auto h-full max-w-2xl overflow-y-auto overscroll-contain px-5 py-8 md:px-6">
      <h2 className="display text-2xl text-moss-950">Your spaces</h2>
      <p className="mt-1 text-sm text-moss-500">
        Each space is its own calendar and lists, shared with the people in it.
      </p>

      <ul className="mt-6 space-y-3">
        {me.spaces.map((space) => (
          <li key={space.id}>
            <SpaceCard
              space={space}
              me={me}
              current={space.id === me.space.id}
              switching={switchSpace.isPending && switchSpace.variables === space.id}
              disabled={switchSpace.isPending}
              onOpen={() => {
                if (space.id === me.space.id) {
                  onOpenSpace();
                  return;
                }
                switchSpace.mutate(space.id, { onSuccess: onOpenSpace });
              }}
              onManage={onManageSpace}
            />
          </li>
        ))}
      </ul>

      {switchSpace.isError && (
        <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Could not switch space. {(switchSpace.error as Error).message}
        </p>
      )}

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <NewSpaceForm />
        <JoinSpaceForm onJoined={onOpenSpace} />
      </div>
    </div>
  );
}

function SpaceCard({
  space,
  me,
  current,
  switching,
  disabled,
  onOpen,
  onManage,
}: {
  space: SpaceSummary;
  me: Me;
  current: boolean;
  switching: boolean;
  disabled: boolean;
  onOpen: () => void;
  onManage: () => void;
}) {
  const others = space.members.filter((member) => member.id !== me.user.id);
  const who =
    others.length === 0
      ? 'Just you so far'
      : `You and ${others.map((member) => member.name.split(' ')[0]).join(', ')}`;

  return (
    <div
      className={`rounded-2xl border bg-white transition ${
        current ? 'border-primary/40 ring-1 ring-primary/20' : 'border-moss-200/80'
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        disabled={disabled && !current}
        aria-label={current ? `Go to ${space.name}` : `Switch to ${space.name}`}
        className="flex w-full items-center gap-4 rounded-2xl px-4 py-4 text-left transition hover:bg-moss-50/60 disabled:opacity-60"
      >
        <span className="flex shrink-0 -space-x-2">
          {space.members.slice(0, 4).map((member) => (
            <Avatar key={member.id} user={member} size="md" />
          ))}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="display truncate text-lg text-moss-950">{space.name}</span>
            {current && (
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-moss-100 px-2 py-0.5 text-[11px] font-bold text-primary">
                <Icon icon={faCheck} size="xs" />
                Viewing
              </span>
            )}
          </span>
          <span className="block truncate text-sm text-moss-500">{who}</span>
        </span>

        <span className="shrink-0 text-sm font-semibold text-primary">
          {switching ? 'Opening…' : <Icon icon={faArrowRight} size="sm" />}
        </span>
      </button>

      {/* Invites and the settings dialog act on the space you are in, so they
          only belong on its card. */}
      {current && <CurrentSpaceActions onManage={onManage} />}
    </div>
  );
}

function CurrentSpaceActions({ onManage }: { onManage: () => void }) {
  const createInvite = useCreateInvite();
  const [copied, setCopied] = useState(false);
  const linkRef = useRef<HTMLInputElement>(null);
  const invite = createInvite.data;

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
    <div className="border-t border-moss-100 px-4 py-3">
      {invite ? (
        <>
          <div className="flex gap-2">
            <input
              ref={linkRef}
              readOnly
              value={invite.url}
              aria-label="Invite link"
              onFocus={(event) => event.currentTarget.select()}
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
            Single use, expires in seven days. Code{' '}
            <code className="rounded bg-moss-100 px-1 py-0.5 font-semibold text-moss-600">
              {invite.code}
            </code>
          </p>
        </>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={createInvite.isPending}
            onClick={() => createInvite.mutate()}
            className="flex items-center gap-2 rounded-lg border border-moss-200 px-3 py-2 text-sm font-semibold text-moss-800 transition hover:border-moss-300 hover:bg-moss-50 disabled:opacity-50"
          >
            <Icon icon={faUserPlus} size="sm" className="text-moss-400" />
            {createInvite.isPending ? 'Creating a link…' : 'Invite someone'}
          </button>
          <button
            type="button"
            onClick={onManage}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-moss-600 transition hover:bg-moss-100"
          >
            <Icon icon={faGear} size="sm" className="text-moss-400" />
            Rename or remove people
          </button>
        </div>
      )}

      {createInvite.isError && (
        <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          Could not create an invite link. {(createInvite.error as Error).message}
        </p>
      )}
    </div>
  );
}

/**
 * Starting a space lands you in it, but on this page rather than its empty
 * calendar: the next thing anyone does with a new space is invite someone,
 * and that button is on the card that has just become current.
 */
function NewSpaceForm() {
  const createSpace = useCreateSpace();
  const [name, setName] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    createSpace.mutate(trimmed, { onSuccess: () => setName('') });
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border border-moss-200/80 bg-white p-4">
      <h3 className="text-sm font-semibold text-moss-900">Start a new space</h3>
      <p className="mt-0.5 text-xs text-moss-400">For a different group — family, friends, a trip.</p>
      <div className="mt-3 flex gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Family"
          maxLength={60}
          aria-label="New space name"
          className="min-w-0 flex-1 rounded-lg border border-moss-200 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
        <button
          type="submit"
          disabled={!name.trim() || createSpace.isPending}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white transition hover:bg-primary-pressed disabled:opacity-50"
        >
          <Icon icon={faPlus} size="xs" />
          {createSpace.isPending ? 'Creating…' : 'Create'}
        </button>
      </div>
      {createSpace.isError && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {(createSpace.error as Error).message}
        </p>
      )}
    </form>
  );
}

function JoinSpaceForm({ onJoined }: { onJoined: () => void }) {
  const joinSpace = useJoinSpace();
  const [code, setCode] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;
    joinSpace.mutate(trimmed, { onSuccess: onJoined });
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border border-moss-200/80 bg-white p-4">
      <h3 className="text-sm font-semibold text-moss-900">Join with a code</h3>
      <p className="mt-0.5 text-xs text-moss-400">The eight characters at the end of an invite link.</p>
      <div className="mt-3 flex gap-2">
        <input
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="ABCD2345"
          maxLength={32}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          aria-label="Invite code"
          className="min-w-0 flex-1 rounded-lg border border-moss-200 px-3 py-2 font-mono text-sm tracking-wider outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
        <button
          type="submit"
          disabled={!code.trim() || joinSpace.isPending}
          className="shrink-0 rounded-lg border border-moss-200 px-3 py-2 text-sm font-semibold text-moss-800 transition hover:border-moss-300 hover:bg-moss-50 disabled:opacity-50"
        >
          {joinSpace.isPending ? 'Joining…' : 'Join'}
        </button>
      </div>
      {joinSpace.isError && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {(joinSpace.error as Error).message}
        </p>
      )}
    </form>
  );
}
