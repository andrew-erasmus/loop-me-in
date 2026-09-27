import { randomBytes, randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CATEGORY_PALETTE } from '../core.js';
import { config } from '../config.js';
import { db, schema } from '../db/index.js';
import type { SpaceRow, UserRow } from '../db/schema.js';

/**
 * Sessions are rows, not JWTs.
 *
 * Signing out has to actually revoke, and a stateless token needs a revocation
 * table to manage that anyway — at which point the token may as well just be
 * the row's key. The cookie carries an opaque random id and nothing else.
 */

export const SESSION_COOKIE = 'calendar_session';
const SESSION_TTL_DAYS = 30;

export interface AuthContext {
  user: UserRow;
  space: SpaceRow;
  sessionId: string | null;
}

function token(): string {
  return randomBytes(32).toString('base64url');
}

function expiryFromNow(): string {
  const expires = new Date();
  expires.setDate(expires.getDate() + SESSION_TTL_DAYS);
  return expires.toISOString();
}

export async function createSession(userId: string, spaceId: string): Promise<string> {
  const id = token();
  await db.insert(schema.sessions).values({
    id,
    userId,
    spaceId,
    expiresAt: expiryFromNow(),
    createdAt: new Date().toISOString(),
  });
  return id;
}

/**
 * Resolve a session id to its user and active space, or null.
 *
 * An expired row is deleted on the way past rather than left to accumulate —
 * there is no cron in this app, and this is the only code that ever reads them.
 */
export async function loadSession(sessionId: string): Promise<AuthContext | null> {
  const session = await db
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.id, sessionId))
    .get();
  if (!session) return null;

  if (Date.parse(session.expiresAt) <= Date.now()) {
    await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
    return null;
  }

  const user = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, session.userId))
    .get();
  const space = await db
    .select()
    .from(schema.spaces)
    .where(eq(schema.spaces.id, session.spaceId))
    .get();
  if (!user || !space) return null;

  // Membership is re-checked on every request rather than trusted from the
  // session row: being removed from a space has to take effect immediately,
  // not whenever the cookie happens to expire.
  const membership = await db
    .select()
    .from(schema.spaceMembers)
    .where(
      and(
        eq(schema.spaceMembers.spaceId, space.id),
        eq(schema.spaceMembers.userId, user.id),
      ),
    )
    .get();
  if (!membership) return null;

  return { user, space, sessionId };
}

export async function destroySession(sessionId: string): Promise<void> {
  await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
}

/** Point an existing session at a different space the user belongs to. */
export async function setSessionSpace(sessionId: string, spaceId: string): Promise<void> {
  await db.update(schema.sessions).set({ spaceId }).where(eq(schema.sessions.id, sessionId));
}

export function setSessionCookie(reply: FastifyReply, sessionId: string): void {
  reply.setCookie(SESSION_COOKIE, sessionId, {
    path: '/',
    httpOnly: true,
    // `lax` same-origin; `none` when the web app lives on a different domain,
    // where a lax cookie would never be sent on the app's own fetches. See
    // `config.crossSiteCookie`.
    sameSite: config.crossSiteCookie ? 'none' : 'lax',
    // `SameSite=None` is only honoured on a Secure cookie, so cross-site
    // implies HTTPS. Otherwise: secure in production only — a secure cookie is
    // silently dropped on plain-http localhost, which would break dev sign-in
    // with no clue why.
    secure: config.isProduction || config.crossSiteCookie,
    signed: true,
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** Read and unsign the session cookie, returning null if it's absent or forged. */
export function readSessionCookie(request: FastifyRequest): string | null {
  const raw = request.cookies[SESSION_COOKIE];
  if (!raw) return null;
  const unsigned = request.unsignCookie(raw);
  return unsigned.valid ? unsigned.value : null;
}

/* -------------------------------------------------------------------------- */
/* Users and spaces                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Pick the palette colour that is least used in a space, so two people never
 * land on the same avatar colour while there are unused ones left.
 */
async function nextColor(spaceId: string | null): Promise<string> {
  if (!spaceId) return CATEGORY_PALETTE[0];

  const rows = await db
    .select({ color: schema.users.color })
    .from(schema.users)
    .innerJoin(schema.spaceMembers, eq(schema.spaceMembers.userId, schema.users.id))
    .where(eq(schema.spaceMembers.spaceId, spaceId))
    .all();
  const taken = new Set(rows.map((row) => row.color));

  return CATEGORY_PALETTE.find((color) => !taken.has(color)) ?? CATEGORY_PALETTE[0];
}

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string;
  picture: string | null;
}

/**
 * Find or create the account behind a Google profile.
 *
 * Matching is on the Google subject claim, never on email — a Google account
 * can change its email address, and matching on it would either lose the
 * account or, worse, hand it to whoever inherits the address.
 */
export async function upsertGoogleUser(profile: GoogleProfile): Promise<UserRow> {
  const existing = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.googleSub, profile.sub))
    .get();

  if (existing) {
    // Name, avatar and email are Google's to change; mirror them each sign-in.
    const updated = {
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.picture,
    };
    await db.update(schema.users).set(updated).where(eq(schema.users.id, existing.id));
    return { ...existing, ...updated };
  }

  const user = {
    id: randomUUID(),
    googleSub: profile.sub,
    email: profile.email,
    name: profile.name,
    avatarUrl: profile.picture,
    color: CATEGORY_PALETTE[0],
    createdAt: new Date().toISOString(),
  };
  await db.insert(schema.users).values(user);
  return user;
}

/** Every space a user belongs to, oldest first. */
export async function spacesForUser(userId: string): Promise<SpaceRow[]> {
  return db
    .select({
      id: schema.spaces.id,
      name: schema.spaces.name,
      createdAt: schema.spaces.createdAt,
    })
    .from(schema.spaces)
    .innerJoin(schema.spaceMembers, eq(schema.spaceMembers.spaceId, schema.spaces.id))
    .where(eq(schema.spaceMembers.userId, userId))
    .orderBy(schema.spaces.createdAt)
    .all();
}

export async function renameSpace(spaceId: string, name: string): Promise<void> {
  await db.update(schema.spaces).set({ name }).where(eq(schema.spaces.id, spaceId));
}

export async function membersOfSpace(spaceId: string): Promise<UserRow[]> {
  return db
    .select({
      id: schema.users.id,
      googleSub: schema.users.googleSub,
      email: schema.users.email,
      name: schema.users.name,
      avatarUrl: schema.users.avatarUrl,
      color: schema.users.color,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .innerJoin(schema.spaceMembers, eq(schema.spaceMembers.userId, schema.users.id))
    .where(eq(schema.spaceMembers.spaceId, spaceId))
    .orderBy(schema.spaceMembers.joinedAt)
    .all();
}

export async function isMember(spaceId: string, userId: string): Promise<boolean> {
  const row = await db
    .select({ userId: schema.spaceMembers.userId })
    .from(schema.spaceMembers)
    .where(
      and(eq(schema.spaceMembers.spaceId, spaceId), eq(schema.spaceMembers.userId, userId)),
    )
    .get();
  return Boolean(row);
}

export async function addMember(
  spaceId: string,
  userId: string,
  role: 'owner' | 'member' = 'member',
): Promise<void> {
  await db
    .insert(schema.spaceMembers)
    .values({ spaceId, userId, role, joinedAt: new Date().toISOString() })
    .onConflictDoNothing();
  await assignColorInSpace(spaceId, userId);
}

/**
 * Take someone out of a space.
 *
 * Their shared events stay: they are the record of what the two of you actually
 * did, and losing that history is not what "remove Bob" means. What goes is the
 * material only they could ever reach — a `private` event nobody else can see,
 * and a `surprise` whose real content left with them. Left behind, a surprise
 * would be worse than clutter: it shows on the other person's grid as an
 * anonymous "Something planned" that `assertEditable` forbids them from ever
 * moving or deleting.
 *
 * Their sessions pointing at this space go too. `loadSession` re-checks
 * membership and would resolve them to null anyway; deleting the rows makes
 * that a clean sign-out rather than a dead row nobody ever collects.
 */
export async function removeMember(spaceId: string, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(schema.events)
      .where(
        and(
          eq(schema.events.spaceId, spaceId),
          eq(schema.events.createdBy, userId),
          inArray(schema.events.visibility, ['private', 'surprise']),
        ),
      );

    await tx
      .delete(schema.sessions)
      .where(
        and(eq(schema.sessions.spaceId, spaceId), eq(schema.sessions.userId, userId)),
      );

    await tx
      .delete(schema.spaceMembers)
      .where(
        and(
          eq(schema.spaceMembers.spaceId, spaceId),
          eq(schema.spaceMembers.userId, userId),
        ),
      );
  });
}

/**
 * Give someone a palette colour not already taken in the space they just
 * joined. Separate from `addMember` so a caller inside a transaction can insert
 * the membership row itself and still apply this afterwards.
 */
export async function assignColorInSpace(spaceId: string, userId: string): Promise<void> {
  const color = await nextColor(spaceId);
  await db.update(schema.users).set({ color }).where(eq(schema.users.id, userId));
}

/**
 * The space a user lands in after signing in: their existing one, or a fresh
 * one named after them. Nobody ever sees a "create a space first" screen.
 */
export async function ensureSpaceForUser(user: UserRow): Promise<SpaceRow> {
  const existing = await spacesForUser(user.id);
  if (existing.length > 0) return existing[0]!;

  const space = {
    id: randomUUID(),
    name: `${user.name.split(' ')[0]}'s calendar`,
    createdAt: new Date().toISOString(),
  };
  await db.insert(schema.spaces).values(space);
  await addMember(space.id, user.id, 'owner');
  return space;
}
