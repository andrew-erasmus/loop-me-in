/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
  type PrecacheEntry,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

/**
 * The service worker: the offline app shell, and push notifications.
 *
 * Kept free of the Firebase SDK on purpose. Firebase Cloud Messaging delivers
 * to browsers over the standard Web Push protocol, so a plain `push` listener
 * receives everything; the SDK would only add weight here, plus its own idea
 * of when to show a notification and when to stay quiet.
 */

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: (PrecacheEntry | string)[];
};

/* -------------------------------------------------------------------------- */
/* App shell                                                                   */
/* -------------------------------------------------------------------------- */

// `registerType: 'autoUpdate'`: a new deploy takes over straight away instead
// of waiting for every tab of the old one to close.
self.skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Any navigation gets the cached app shell, so it opens offline — except
// /api, whose answers are never served from cache, so a stale event list is
// never shown as though it were current. In development nothing is precached
// and there is no shell to bind to; navigation simply goes to Vite.
try {
  registerRoute(
    new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/api\//] }),
  );
} catch {
  // index.html isn't in the precache manifest (development).
}

/* -------------------------------------------------------------------------- */
/* Push                                                                        */
/* -------------------------------------------------------------------------- */

interface PushData {
  title?: string;
  body?: string;
  tag?: string;
}

self.addEventListener('push', (event) => {
  // FCM wraps a data-only message as `{ data: {...}, from, fcmMessageId }`.
  // A console-sent test arrives with `notification` instead — accept either.
  let payload: { data?: PushData; notification?: PushData } = {};
  try {
    payload = (event.data?.json() ?? {}) as typeof payload;
  } catch {
    // Not JSON. Still show something: Safari revokes push permission from
    // sites that receive a push and don't put a notification on screen.
  }
  const data = payload.data ?? payload.notification ?? {};

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(data.title ?? 'Loop Me In', {
        body: data.body ?? 'Something changed.',
        tag: data.tag,
        icon: '/icons/icon-192.png',
      });

      // An open copy of the app refetches, so what the notification says is
      // already on screen when they look.
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) client.postMessage({ type: 'push' });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    (async () => {
      // Bring an already-open copy forward rather than stacking a second one.
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows[0];
      if (open) {
        await open.focus();
        return;
      }
      await self.clients.openWindow(self.registration.scope);
    })(),
  );
});
