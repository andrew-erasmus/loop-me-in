/**
 * Every deployment-specific value in one place, read from the environment.
 *
 * Nothing here is hard-coded to localhost beyond the development defaults, so
 * moving this app to a real host is a matter of setting variables rather than
 * editing code.
 */

const env = process.env;

export const config = {
  port: Number(env['PORT'] ?? 3031),
  isProduction: env['NODE_ENV'] === 'production',

  /** Where the browser app lives. OAuth returns the user here when it's done. */
  webOrigin: env['WEB_ORIGIN'] ?? 'http://localhost:5173',

  google: {
    clientId: env['GOOGLE_CLIENT_ID'] ?? '',
    clientSecret: env['GOOGLE_CLIENT_SECRET'] ?? '',
    /**
     * Points at the *web* origin, not the API's own port, because Vite proxies
     * `/api` through to us. That keeps the whole sign-in flow on one origin, so
     * the session cookie is unambiguous. Register exactly this URI in the
     * Google Cloud console.
     */
    get callbackUrl(): string {
      return (
        env['OAUTH_CALLBACK_URL'] ??
        `${config.webOrigin}/api/auth/google/callback`
      );
    },
  },

  /** Signs the session cookie. Random per-boot in dev; must be set in production. */
  sessionSecret: env['SESSION_SECRET'] ?? '',

  /**
   * Whether the browser will treat the session cookie as cross-site.
   *
   * Same-origin (dev behind Vite's proxy, or the web app served by this API)
   * wants `lax`: it survives the top-level redirect back from Google and is
   * sent on same-origin XHR. But if the web app is on its own domain and the
   * API on another, every `fetch` from it is cross-site and a `lax` cookie is
   * simply not sent — the app would sign in successfully and then behave as
   * though it never had. That case needs `none`, which browsers only honour on
   * a `Secure` cookie, i.e. over HTTPS.
   */
  crossSiteCookie: env['COOKIE_SAMESITE']?.toLowerCase() === 'none',

  /**
   * Development escape hatch: sign every request in as this user, skipping
   * Google entirely. Without it nothing is testable until OAuth credentials
   * exist, and Swagger's "Try it out" stops working. Refused in production.
   */
  devUserEmail: env['AUTH_DEV_USER'] ?? '',
} as const;

/** Whether real Google sign-in is configured. */
export function googleConfigured(): boolean {
  return Boolean(config.google.clientId && config.google.clientSecret);
}

/** Whether the dev bypass is both requested and permitted. */
export function devAuthEnabled(): boolean {
  return Boolean(config.devUserEmail) && !config.isProduction;
}
