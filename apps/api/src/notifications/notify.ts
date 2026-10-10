import { waitUntil } from '@vercel/functions';
import { eq, inArray } from 'drizzle-orm';
import type { FastifyBaseLogger, FastifyRequest } from 'fastify';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationKind,
  type NotificationPreferences,
} from '../core.js';
import { config } from '../config.js';
import { membersOfSpace } from '../auth/session.js';
import { db, schema } from '../db/index.js';
import { getMessaging } from './firebase.js';

/**
 * Who hears about what, and getting it to them.
 *
 * Routes call `notifySpace` after their write has succeeded. Sending never
 * holds up the response and never fails it: a push that doesn't arrive is a
 * shame, a calendar edit that errors because Firebase was slow would be a bug.
 */

export interface PushMessage {
  title: string;
  body: string;
  /**
   * Notifications sharing a tag replace each other on the device rather than
   * stacking up — dragging one event around four times should leave one
   * notification about where it ended up, not four.
   */
  tag?: string;
}

/** Everything a message builder may need to know about the person it's for. */
export interface Recipient {
  userId: string;
  timeZone: string;
}

/** Null means "not for this person after all" — skipped without sending. */
export type BuildMessage = (recipient: Recipient) => PushMessage | null;

/** An account's choices, with anything never chosen filled in from the defaults. */
export async function preferencesFor(userId: string): Promise<NotificationPreferences> {
  const row = await db
    .select()
    .from(schema.notificationSettings)
    .where(eq(schema.notificationSettings.userId, userId))
    .get();
  return mergePreferences(row?.preferences);
}

function mergePreferences(stored: Record<string, boolean> | undefined): NotificationPreferences {
  const merged = { ...DEFAULT_NOTIFICATION_PREFERENCES };
  for (const kind of Object.keys(merged) as NotificationKind[]) {
    if (typeof stored?.[kind] === 'boolean') merged[kind] = stored[kind];
  }
  return merged;
}

/** Who did something, and in which space — whose members get told. */
export interface Origin {
  log: FastifyBaseLogger;
  actorId: string;
  spaceId: string;
}

/** The origin of anything done through a signed-in request. */
export function originOf(request: FastifyRequest): Origin {
  return { log: request.log, actorId: request.auth.user.id, spaceId: request.auth.space.id };
}

/**
 * Tell everyone else in a space about something one of them did, if they want
 * to hear about that kind of thing.
 */
export function notifySpace(origin: Origin, kind: NotificationKind, build: BuildMessage): void {
  dispatch(origin.log, async () => {
    const members = await membersOfSpace(origin.spaceId);
    await deliver(origin, members.map((member) => member.id), kind, build);
  });
}

/**
 * The same, for people named up front — for when the space itself won't
 * exist by the time the notification goes out, so its members can't be
 * looked up then.
 */
export function notifyUsers(
  origin: Origin,
  userIds: string[],
  kind: NotificationKind,
  build: BuildMessage,
): void {
  dispatch(origin.log, () => deliver(origin, userIds, kind, build));
}

async function deliver(
  origin: Origin,
  userIds: string[],
  kind: NotificationKind,
  build: BuildMessage,
): Promise<void> {
  const others = userIds.filter((id) => id !== origin.actorId || config.notifySelf);
  if (others.length === 0) return;

  const settings = await db
    .select()
    .from(schema.notificationSettings)
    .where(inArray(schema.notificationSettings.userId, others))
    .all();
  const stored = new Map(settings.map((row) => [row.userId, row.preferences]));
  const wanting = others.filter((id) => mergePreferences(stored.get(id))[kind]);

  await sendToUsers(origin.log, wanting, build);
}

const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

/** Push to specific accounts. Resolves to how many devices took it. */
async function sendToUsers(
  log: FastifyBaseLogger,
  userIds: string[],
  build: BuildMessage,
): Promise<number> {
  if (userIds.length === 0) return 0;

  const messaging = await getMessaging();
  if (!messaging) return 0;

  const devices = await db
    .select()
    .from(schema.pushDevices)
    .where(inArray(schema.pushDevices.userId, userIds))
    .all();

  const outgoing = devices.flatMap((device) => {
    const message = build({ userId: device.userId, timeZone: device.timeZone });
    return message ? [{ token: device.token, message }] : [];
  });
  if (outgoing.length === 0) return 0;

  // Data-only, deliberately: the service worker draws every notification
  // itself. A `notification` payload would have the browser draw one too on
  // some platforms, and the click would then land wherever FCM chose.
  const response = await messaging.sendEach(
    outgoing.map(({ token, message }) => ({
      token,
      data: {
        title: message.title,
        body: message.body,
        ...(message.tag ? { tag: message.tag } : {}),
      },
      webpush: { headers: { Urgency: 'high', TTL: String(24 * 60 * 60) } },
    })),
  );

  // A token the browser has since thrown away (notifications revoked, site
  // data cleared, app deleted from the home screen) fails like this forever.
  // Forget it rather than retrying it on every change for the rest of time.
  const dead: string[] = [];
  response.responses.forEach((result, index) => {
    if (!result.error) return;
    if (DEAD_TOKEN_CODES.has(result.error.code)) dead.push(outgoing[index]!.token);
    else log.warn({ err: result.error }, 'Push failed');
  });
  if (dead.length > 0) {
    await db.delete(schema.pushDevices).where(inArray(schema.pushDevices.token, dead));
  }

  return response.successCount;
}

/**
 * Run notification work after the response, without losing it.
 *
 * On Vercel a function may be frozen the moment its response is sent, taking
 * an unawaited promise with it; `waitUntil` keeps the instance alive until the
 * promise settles. Anywhere else it is a no-op and the promise simply runs.
 */
function dispatch(log: FastifyBaseLogger, task: () => Promise<void>): void {
  waitUntil(
    task().catch((error: unknown) => {
      log.error({ err: error }, 'Sending notifications failed');
    }),
  );
}

/* -------------------------------------------------------------------------- */
/* Wording                                                                     */
/* -------------------------------------------------------------------------- */

/** "Sam", from "Sam Jones" — notifications are between people on first names. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/**
 * `Fri 3 Oct, 19:00`, or `Fri 3 Oct` for an all-day event, in the recipient's
 * own time zone — the server writes the date into the notification, so it
 * cannot leave that to the browser the way the calendar itself does.
 */
export function formatWhen(startsAt: string, allDay: boolean, timeZone: string): string {
  const instant = new Date(startsAt);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  const day = `${parts['weekday']} ${parts['day']} ${parts['month']}`;
  return allDay ? day : `${day}, ${parts['hour']}:${parts['minute']}`;
}
