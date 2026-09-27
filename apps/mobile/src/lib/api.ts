import Constants from 'expo-constants';
import { createCalendarClient } from '@date-calendar/core';

/**
 * The API client for the phone.
 *
 * A device cannot reach `localhost` — that is the phone itself. It needs your
 * laptop's address on the network, which is a moving target between cafés and
 * home wifi, and hard-coding it means editing a file every time it changes.
 *
 * Metro already solved this: the bundler is serving this JavaScript *from* that
 * exact address, and Expo puts it in the manifest as `hostUri`. So the dev
 * machine's IP is simply wherever the app was loaded from, with the API's port
 * swapped in.
 *
 * `EXPO_PUBLIC_API_URL` overrides it — set that once there is a deployed API,
 * where the two hosts are no longer the same machine.
 */

const API_PORT = 3031;

function resolveBaseUrl(): string {
  const explicit = process.env['EXPO_PUBLIC_API_URL'];
  if (explicit) return explicit.replace(/\/$/, '');

  // e.g. "192.168.10.78:8081" — the host half is the laptop.
  const hostUri = Constants.expoConfig?.hostUri;
  const host = hostUri?.split(':')[0];

  if (host) return `http://${host}:${API_PORT}/api`;

  // No manifest means a production build with nothing configured. Fail loudly
  // at the first request rather than silently pointing at the device itself.
  throw new Error(
    'Cannot work out the API address. Set EXPO_PUBLIC_API_URL to your API origin.',
  );
}

export const apiBaseUrl = resolveBaseUrl();

/**
 * The same typed client the web app uses, from @date-calendar/core — every
 * route, every Zod response schema, one definition. `fetch` is global in React
 * Native, so the file crosses unchanged; only this base URL differs.
 */
export const api = createCalendarClient({ baseUrl: apiBaseUrl });
