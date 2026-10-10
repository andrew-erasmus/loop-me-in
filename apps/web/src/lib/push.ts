import type { Messaging } from 'firebase/messaging';
import { api } from './api.js';

/**
 * This browser's side of push notifications: whether it can have them, and
 * turning them on and off.
 *
 * Firebase is loaded only when one of these is actually called — it is not
 * small, and most visits to a calendar never touch notification settings.
 */

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;

/**
 * - `supported`: can be turned on here.
 * - `needs-install`: iPhone/iPad in a Safari tab. Apple only allows web push
 *   from an app added to the Home Screen, so the answer is "install it".
 * - `unsupported`: this browser can't do web push at all.
 * - `unconfigured`: the build has no Firebase keys (VITE_FIREBASE_*).
 */
export type PushSupport = 'supported' | 'needs-install' | 'unsupported' | 'unconfigured';

export async function pushSupport(): Promise<PushSupport> {
  if (!firebaseConfig.apiKey || !firebaseConfig.appId || !vapidKey) return 'unconfigured';
  if (isIos() && !isStandalone()) return 'needs-install';
  if (
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !('Notification' in window)
  ) {
    return 'unsupported';
  }
  const { isSupported } = await import('firebase/messaging');
  return (await isSupported()) ? 'supported' : 'unsupported';
}

function isIos(): boolean {
  // iPadOS reports itself as a Mac; the touch screen gives it away.
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1)
  );
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * The token this browser registered for this account, if it did.
 *
 * Kept per account: a second person signing in on the same browser should not
 * inherit the first person's "yes" and start receiving their notifications.
 */
const storageKey = (userId: string) => `push-token:${userId}`;

export function savedToken(userId: string): string | null {
  try {
    return localStorage.getItem(storageKey(userId));
  } catch {
    return null;
  }
}

function saveToken(userId: string, token: string | null): void {
  try {
    if (token) localStorage.setItem(storageKey(userId), token);
    else localStorage.removeItem(storageKey(userId));
  } catch {
    // Storage refused (private mode). The device is still registered; it just
    // won't remember so on the next visit.
  }
}

let messaging: Promise<Messaging> | undefined;

function getMessagingInstance(): Promise<Messaging> {
  messaging ??= (async () => {
    const [{ initializeApp, getApps }, { getMessaging }] = await Promise.all([
      import('firebase/app'),
      import('firebase/messaging'),
    ]);
    return getMessaging(getApps()[0] ?? initializeApp(firebaseConfig));
  })();
  return messaging;
}

/** The registered service worker, or a clear failure instead of waiting forever. */
async function serviceWorker(): Promise<ServiceWorkerRegistration> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(
      () =>
        reject(new Error('The app’s service worker isn’t running. Reload the page and try again.')),
      10_000,
    ),
  );
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

async function registerToken(userId: string): Promise<void> {
  const { getToken } = await import('firebase/messaging');
  const token = await getToken(await getMessagingInstance(), {
    vapidKey,
    serviceWorkerRegistration: await serviceWorker(),
  });
  await api.registerPushDevice({
    token,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  saveToken(userId, token);
}

/**
 * Ask for permission and register this browser.
 *
 * Must be called straight from a tap: Safari only shows the permission prompt
 * in direct response to one, which is why the prompt comes before anything
 * that awaits — an `await` first would spend the gesture.
 */
export async function enablePush(userId: string): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new PermissionDeniedError();
  }
  await registerToken(userId);
}

export async function disablePush(userId: string): Promise<void> {
  const token = savedToken(userId);
  saveToken(userId, null);
  if (token) await api.unregisterPushDevice(token);
  try {
    const { deleteToken } = await import('firebase/messaging');
    await deleteToken(await getMessagingInstance());
  } catch {
    // Already gone on Firebase's side; the server has forgotten it either way.
  }
}

/**
 * Re-register on launch if this browser is turned on for this account.
 *
 * Tokens rotate, the session they were tied to may have been signed out, and
 * the time zone may have changed with a flight. Re-sending is idempotent, so
 * doing it every launch is simpler than detecting any of those.
 */
export async function refreshPush(userId: string): Promise<void> {
  if (!savedToken(userId)) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    // Revoked in the browser's own settings: stop claiming to be on.
    saveToken(userId, null);
    return;
  }
  if ((await pushSupport()) !== 'supported') return;
  await registerToken(userId);
}

export class PermissionDeniedError extends Error {
  constructor() {
    super('Notifications are blocked for this site.');
    this.name = 'PermissionDeniedError';
  }
}
