import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { config } from '../config.js';
import { db, schema } from '../db/index.js';
import type { SpaceRow } from '../db/schema.js';
import { assignColorInSpace, isMember } from './session.js';

/**
 * Single-use invite codes — how the second person gets into a space.
 */

const INVITE_TTL_HOURS = 24 * 7;

/**
 * Unambiguous alphabet: no O/0 or I/1. The code is short enough that someone
 * may well read it aloud or copy it off another screen.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newCode(length = 8): string {
  // 32 divides 256 evenly, so every random byte maps to a character uniformly
  // and there is no modulo bias to reject around.
  return [...randomBytes(length)].map((byte) => ALPHABET[byte % 32]).join('');
}

export async function createInvite(spaceId: string, createdBy: string) {
  const expires = new Date();
  expires.setHours(expires.getHours() + INVITE_TTL_HOURS);

  const invite = {
    code: newCode(),
    spaceId,
    createdBy,
    expiresAt: expires.toISOString(),
    usedAt: null,
    usedBy: null,
    createdAt: new Date().toISOString(),
  };
  await db.insert(schema.spaceInvites).values(invite);

  return {
    code: invite.code,
    // The link lands on the web app, which hands the code back to us once the
    // person has signed in.
    url: `${config.webOrigin}/?join=${invite.code}`,
    expiresAt: invite.expiresAt,
  };
}

/**
 * Redeem a code, adding the user to its space. Returns the space, or null if
 * the code is unknown, expired or already spent.
 */
export async function redeemInvite(rawCode: string, userId: string): Promise<SpaceRow | null> {
  const invite = await db
    .select()
    .from(schema.spaceInvites)
    .where(eq(schema.spaceInvites.code, rawCode.trim().toUpperCase()))
    .get();

  if (!invite) return null;

  const space = await db
    .select()
    .from(schema.spaces)
    .where(eq(schema.spaces.id, invite.spaceId))
    .get();
  if (!space) return null;

  // Already a member: a no-op success, checked *before* the spent and expired
  // rules. The web app re-posts the code after sign-in, so simply reloading the
  // invite URL would otherwise greet someone with "this link is no longer
  // valid" for a space they are already standing in.
  if (await isMember(space.id, userId)) return space;

  if (invite.usedAt) return null;
  if (Date.parse(invite.expiresAt) <= Date.now()) return null;

  // Marking the code used and adding the membership must be one unit, or two
  // simultaneous clicks on a single-use link could both succeed.
  await db.transaction(async (tx) => {
    await tx
      .update(schema.spaceInvites)
      .set({ usedAt: new Date().toISOString(), usedBy: userId })
      .where(eq(schema.spaceInvites.code, invite.code));
    await tx
      .insert(schema.spaceMembers)
      .values({ spaceId: space.id, userId, role: 'member', joinedAt: new Date().toISOString() })
      .onConflictDoNothing();
  });

  await assignColorInSpace(space.id, userId);
  return space;
}
