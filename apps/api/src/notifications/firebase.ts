import type { Messaging } from 'firebase-admin/messaging';
import { config } from '../config.js';

/**
 * The Firebase Admin client that actually sends pushes.
 *
 * Imported lazily, on the first notification rather than at boot: most
 * requests never send one, and firebase-admin is heavy enough that loading it
 * up front would add to every cold start for nothing.
 */

let messaging: Promise<Messaging | null> | undefined;

/** Whether a service-account key is set at all. Cheap; never loads Firebase. */
export function pushConfigured(): boolean {
  return config.firebaseServiceAccount.trim() !== '';
}

export function getMessaging(): Promise<Messaging | null> {
  // A failure is not cached: the next notification tries again rather than
  // the instance staying broken until it happens to be recycled.
  messaging ??= load().catch((error: unknown) => {
    messaging = undefined;
    throw error;
  });
  return messaging;
}

async function load(): Promise<Messaging | null> {
  const raw = config.firebaseServiceAccount.trim();
  if (!raw) return null;

  // The downloaded key file pasted as-is, or base64 of it for hosts whose
  // dashboards mangle quotes and newlines. JSON always starts with `{`.
  const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  let account: Record<string, unknown>;
  try {
    account = JSON.parse(json) as Record<string, unknown>;
  } catch {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT is not valid JSON. Paste the whole downloaded key file, or base64 of it.',
    );
  }

  const { cert, getApps, initializeApp } = await import('firebase-admin/app');
  const { getMessaging: messagingFor } = await import('firebase-admin/messaging');

  // Named, so a warm serverless instance that re-enters here after a failed
  // first attempt reuses the app instead of throwing "already exists".
  const app =
    getApps().find((candidate) => candidate.name === 'push') ??
    initializeApp({ credential: cert(account) }, 'push');
  return messagingFor(app);
}
