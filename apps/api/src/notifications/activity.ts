import { SURPRISE_TITLE } from '../core.js';
import type { EventRow, ListItemRow, ListRow, SpaceRow, UserRow } from '../db/schema.js';
import {
  firstName,
  formatWhen,
  notifySpace,
  notifyUsers,
  type Origin,
  type PushMessage,
  type Recipient,
} from './notify.js';

/**
 * What each thing someone does sounds like as a notification.
 *
 * The rules mirror what the recipient could see by opening the app, and no
 * more: someone else's `private` event never notifies at all, and a surprise
 * says only that a time is taken — the notification must not be the one place
 * the title leaks out. Builders run per recipient for exactly this reason.
 */

type EventFacts = Pick<
  EventRow,
  'id' | 'title' | 'startsAt' | 'endsAt' | 'allDay' | 'visibility' | 'createdBy'
>;

/** Whether this person can see the event at all. */
function canSee(event: EventFacts, recipient: Recipient): boolean {
  return event.visibility !== 'private' || event.createdBy === recipient.userId;
}

/** The title as this person is allowed to read it. */
function titleFor(event: EventFacts, recipient: Recipient): string {
  return event.visibility === 'surprise' && event.createdBy !== recipient.userId
    ? SURPRISE_TITLE
    : event.title;
}

function isSurpriseFor(event: EventFacts, recipient: Recipient): boolean {
  return event.visibility === 'surprise' && event.createdBy !== recipient.userId;
}

function listLabel(list: ListRow): string {
  return list.emoji ? `${list.emoji} ${list.name}` : list.name;
}

function addedMessage(actor: string, event: EventFacts, recipient: Recipient): PushMessage | null {
  if (!canSee(event, recipient)) return null;
  const when = formatWhen(event.startsAt, event.allDay, recipient.timeZone);
  return isSurpriseFor(event, recipient)
    ? {
        title: `${actor} planned a surprise`,
        body: `Something’s happening ${when}. Keep it free — no peeking.`,
        tag: `event-${event.id}`,
      }
    : {
        title: `${actor} added a plan`,
        body: `${event.title} · ${when}`,
        tag: `event-${event.id}`,
      };
}

export function eventAdded(origin: Origin, actor: UserRow, event: EventFacts): void {
  const name = firstName(actor.name);
  notifySpace(origin, 'eventAdded', (recipient) => addedMessage(name, event, recipient));
}

export function eventChanged(
  origin: Origin,
  actor: UserRow,
  before: EventFacts,
  after: EventFacts,
): void {
  const name = firstName(actor.name);

  // Coming out of `private` is, to everyone else, the event appearing.
  if (before.visibility === 'private' && after.visibility !== 'private') {
    notifySpace(origin, 'eventAdded', (recipient) => addedMessage(name, after, recipient));
    return;
  }

  notifySpace(origin, 'eventChanged', (recipient) => {
    // Gone private is gone, as far as they know. Saying "removed" would be
    // untrue and saying anything else would give it away.
    if (!canSee(before, recipient) || !canSee(after, recipient)) return null;

    const moved =
      before.startsAt !== after.startsAt ||
      before.endsAt !== after.endsAt ||
      before.allDay !== after.allDay;
    const renamed = titleFor(before, recipient) !== titleFor(after, recipient);
    // Notes and category changes stay quiet: worth seeing, not worth a buzz.
    if (!moved && !renamed) return null;

    const when = formatWhen(after.startsAt, after.allDay, recipient.timeZone);
    return {
      title: moved ? `${name} moved a plan` : `${name} updated a plan`,
      body: `${titleFor(after, recipient)} · ${moved ? 'now ' : ''}${when}`,
      tag: `event-${after.id}`,
    };
  });
}

export function eventRemoved(origin: Origin, actor: UserRow, event: EventFacts): void {
  const name = firstName(actor.name);
  notifySpace(origin, 'eventRemoved', (recipient) => {
    if (!canSee(event, recipient)) return null;
    return {
      title: `${name} removed a plan`,
      body: `${titleFor(event, recipient)} · ${formatWhen(event.startsAt, event.allDay, recipient.timeZone)}`,
      tag: `event-${event.id}`,
    };
  });
}

export function itemAdded(origin: Origin, actor: UserRow, list: ListRow, item: ListItemRow): void {
  const name = firstName(actor.name);
  notifySpace(origin, 'itemAdded', () => ({
    title: `${name} added to ${listLabel(list)}`,
    body: item.title,
    tag: `item-${item.id}`,
  }));
}

/** `votes` is everyone keen after this vote, the actor included. */
export function itemKeen(
  origin: Origin,
  actor: UserRow,
  list: ListRow,
  item: ListItemRow,
  votes: string[],
): void {
  const name = firstName(actor.name);
  notifySpace(origin, 'itemKeen', (recipient) =>
    votes.includes(recipient.userId) && recipient.userId !== origin.actorId
      ? {
          title: `You’re both keen on ${item.title}`,
          body: `${name} wants to as well. Maybe it’s time to give it a date?`,
          tag: `item-${item.id}`,
        }
      : {
          title: `${name} is keen on ${item.title}`,
          body: `On ${listLabel(list)}`,
          tag: `item-${item.id}`,
        },
  );
}

export function itemScheduled(
  origin: Origin,
  actor: UserRow,
  item: ListItemRow,
  event: EventFacts,
  moved: boolean,
): void {
  const name = firstName(actor.name);
  notifySpace(origin, 'itemScheduled', (recipient) => {
    // The list hides a surprise's date from the person it's for; so does this.
    if (!canSee(event, recipient) || isSurpriseFor(event, recipient)) return null;
    return {
      title: moved ? `${name} moved ${item.title}` : `${name} put ${item.title} on the calendar`,
      body: formatWhen(event.startsAt, event.allDay, recipient.timeZone),
      tag: `event-${event.id}`,
    };
  });
}

export function memberJoined(origin: Origin, joiner: UserRow, space: SpaceRow): void {
  const name = firstName(joiner.name);
  notifySpace(origin, 'memberJoined', () => ({
    title: `${name} joined ${space.name}`,
    body: 'You’re planning together now.',
    tag: `space-${space.id}`,
  }));
}

/** `memberIds` captured before the space was deleted — it can't be asked afterwards. */
export function spaceDeleted(
  origin: Origin,
  actor: UserRow,
  space: SpaceRow,
  memberIds: string[],
): void {
  const name = firstName(actor.name);
  notifyUsers(origin, memberIds, 'spaceDeleted', () => ({
    title: `${name} deleted ${space.name}`,
    body: 'Its plans and lists have gone with it.',
    tag: `space-${space.id}`,
  }));
}

export function memberLeft(origin: Origin, leaver: UserRow, space: SpaceRow): void {
  const name = firstName(leaver.name);
  notifySpace(origin, 'memberLeft', () => ({
    title: `${name} left ${space.name}`,
    body: 'Everything you planned together is still here.',
    tag: `space-${space.id}`,
  }));
}
