import { createCalendarClient } from '@date-calendar/core';

/**
 * The single client instance for the web app.
 *
 * Defaults to the relative `/api`, so in development Vite's dev proxy forwards
 * it to the API server and the browser stays same-origin — no CORS involved.
 *
 * Set `VITE_API_BASE_URL` to an absolute URL when the API is deployed on its
 * own domain. That is a build-time substitution, not a runtime lookup: Vite
 * inlines it into the bundle, so it must be set wherever the app is *built*,
 * not where it is served. The API already enables CORS with credentials for
 * exactly this case.
 */
export const baseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api';

export const api = createCalendarClient({ baseUrl });
