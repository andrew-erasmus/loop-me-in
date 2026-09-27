# Getting sign-in working, and getting it online

Three stages, each usable on its own. Stage 1 takes about ten minutes and gets real Google
sign-in working on your laptop. Stage 2 gets it onto the internet so both of you can use it from
anywhere. Stage 3 is what to do if it outgrows a single machine — which, for two people, it
probably never will.

---

## Stage 0 — where you are now

`apps/api/.env` exists with `AUTH_DEV_USER=alice@example.com`. That skips Google entirely and
signs every request in as Alice. Run `npm run dev` and you have a working app immediately.

To see it as two people, open a second browser profile (or a private window) — but note that the
dev bypass signs *everyone* in as the same user, so for genuine two-person testing you either
switch `AUTH_DEV_USER` to `bob@example.com` and restart, or finish Stage 1 and use real accounts.

---

## Stage 1 — real Google sign-in, locally

### 1. Create a Google Cloud project

Go to <https://console.cloud.google.com/>. Create a project — call it whatever you like. This is
free and has no billing requirement for what we're doing.

### 2. Configure the consent screen

**APIs & Services → OAuth consent screen.**

- User type: **External**. (Internal is only available with a Google Workspace organisation.)
- Fill in an app name, your email as support contact, and your email as the developer contact.
  Nothing else is required.
- Scopes: you don't need to add any. The app requests `openid`, `profile` and `email`, which are
  non-sensitive and need no review.
- **Test users: add both your email address and hers.**
- Leave the app in **Testing** mode. Do not click "Publish app".

> **Why Testing mode matters.** A published External app that requests profile scopes gets put
> through Google's verification review. Testing mode skips that entirely — the tradeoff is a cap
> of 100 test users and a consent screen that says "Google hasn't verified this app". For an app
> with exactly two users, that is the right trade. You will see that warning screen once each and
> then never again.

### 3. Create the OAuth client

**APIs & Services → Credentials → Create credentials → OAuth client ID.**

- Application type: **Web application**
- Name: anything, e.g. `calendar-local`
- **Authorised redirect URIs** — add exactly this, character for character:

  ```
  http://localhost:5173/api/auth/google/callback
  ```

> **Why port 5173 and not 3031.** That is Vite, the web app — not the API. Vite proxies `/api`
> straight through to the API, so routing sign-in through it keeps the entire flow on one origin.
> The session cookie is then unambiguously a first-party cookie, which is the difference between
> "it works" and a confusing afternoon. If you register the API's own port here instead, Google
> will reject the callback with `redirect_uri_mismatch`.

Google gives you a **Client ID** and a **Client secret**.

### 4. Put them in your .env

Open `apps/api/.env` and fill in:

```sh
GOOGLE_CLIENT_ID=<the long one ending in .apps.googleusercontent.com>
GOOGLE_CLIENT_SECRET=<the shorter one>
```

Then **comment out the dev bypass**, or it will keep overriding Google:

```sh
# AUTH_DEV_USER=alice@example.com
```

### 5. Restart and try it

```bash
npm run dev
```

Open <http://localhost:5173>. You should get the sign-in screen, then Google's consent screen
(with the unverified-app warning — click through it), then the calendar with your real name and
Google avatar in the header.

### 6. Add her

Press **Invite** in the header, copy the link, send it to her. She opens it, signs in with Google,
and lands in *your* space rather than getting one of her own.

> The invite must be followed **before** her first sign-in. If she signs in cold first, she gets
> her own empty space, and accepting an invite afterwards leaves her in two — usable, but she'll
> have to pick yours from the switcher, and anything she added to the wrong one stays there.

### If something goes wrong

| Symptom | Cause |
|---|---|
| `redirect_uri_mismatch` | The URI in the Google console isn't character-identical to `http://localhost:5173/api/auth/google/callback`. Check for a trailing slash or `https`. |
| Signs in, immediately bounces back to the sign-in screen | The cookie isn't sticking. Check `WEB_ORIGIN` matches where you actually opened the app. |
| "Google sign-in is not configured on this server" | The client id/secret aren't reaching the process. Restart `npm run dev` — env files are read at boot. |
| Still signed in as Alice | `AUTH_DEV_USER` is still set. It wins over Google by design. |

---

## Stage 2 — online, for both of you, from anywhere

### What actually has to change

Three things, and only three:

1. **The API needs a public address**, because her phone can't reach your laptop.
2. **The database needs to live somewhere permanent**, not in a file that vanishes when a
   container restarts.
3. **HTTPS**, because the session cookie is marked `Secure` in production and browsers discard
   secure cookies sent over plain HTTP.

### The shape I'd recommend: one origin

There are two ways to arrange this, and the choice matters more than which host you pick.

**Option A — one service (recommended).** The API serves the built web app as static files.
Everything is on one domain: `calendar.yourname.com` serves the app at `/` and the API at `/api`.

- The cookie stays first-party. `SameSite=Lax` keeps working, exactly as it does in development.
- No CORS configuration, because there is no cross-origin request.
- One thing to deploy, one set of environment variables, one place to look when something breaks.
- The callback URL stays the same shape you already know: `WEB_ORIGIN + /api/auth/google/callback`.

**Option B — two services.** Web app on Vercel/Netlify, API on Fly/Railway, separate domains.

- More moving parts, and the cookie becomes cross-site — you **must** set `COOKIE_SAMESITE=none`
  on the API, or the app signs in successfully and then behaves as though it never did, with no
  error message anywhere. This is the single most common way this setup fails.
- Worth it if you want the web app on a CDN. For two users, you don't — unless the host you want
  is Vercel, which only *has* Option B's shape: it serves static files and short-lived serverless
  functions, never a single long-running process with a local disk, so "the API serves the built
  web app" isn't a thing Vercel can do. See the recipe below.

Option A needs one small change the app doesn't have yet: registering `@fastify/static` in
`apps/api/src/server.ts` to serve `apps/web/dist`, with a catch-all falling back to `index.html`.
That's a handful of lines. Option B works with the code as it stands today, given
`COOKIE_SAMESITE=none`.

### A concrete recipe (Option A, on Fly.io)

Fly suits this well: it gives you a persistent volume, so SQLite stays viable, and a free TLS
certificate.

1. **Install and sign up**

   ```bash
   brew install flyctl
   fly auth signup
   ```

2. **Create the app and a volume for the database**

   ```bash
   fly launch --no-deploy          # answer no to Postgres/Redis prompts
   fly volumes create calendar_data --size 1   # 1GB is enormous for this
   ```

   In the generated `fly.toml`, mount it and pin yourself to a single machine:

   ```toml
   [mounts]
     source = "calendar_data"
     destination = "/data"

   [http_service]
     internal_port = 3031
     force_https = true
     auto_stop_machines = "suspend"
     min_machines_running = 1
   ```

   > **Pin it to one machine.** SQLite is a file on one disk. Two machines means two disks means
   > two different calendars, silently. `min_machines_running = 1` and no autoscaling is not a
   > limitation here — it is the correct configuration for this database.

3. **Set the secrets** (these are the keys from `apps/api/.env.production.example`)

   ```bash
   fly secrets set \
     NODE_ENV=production \
     SESSION_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" \
     GOOGLE_CLIENT_ID=... \
     GOOGLE_CLIENT_SECRET=... \
     WEB_ORIGIN=https://your-app.fly.dev \
     DATABASE_URL=/data/calendar.db
   ```

   > **Generate `SESSION_SECRET` once and leave it alone.** It signs the session cookies. Rotating
   > it signs both of you out of every device. It must be a stored secret, never something
   > regenerated per deploy.

4. **Make a second OAuth client for production.** Back in the Google console, create another Web
   application client with the authorised redirect URI:

   ```
   https://your-app.fly.dev/api/auth/google/callback
   ```

   Use a separate client from your local one, so rotating a leaked production secret can't break
   your laptop, and vice versa. Add both your emails as test users on the consent screen again if
   you made a new project.

5. **Create the schema once**, after the first deploy:

   ```bash
   fly ssh console -C "npm run db:push --workspace @date-calendar/api"
   ```

   Do **not** run `npm run seed` in production — it creates the fake Alice and Bob accounts. Your
   first real Google sign-in creates your account and space automatically.

6. **Deploy**

   ```bash
   fly deploy
   ```

Then open the URL, sign in, and send her an invite link from the header. That's the whole thing.

### A concrete recipe (Option B, on Vercel + Turso)

Vercel's functions have no local disk that survives between requests, so SQLite-as-a-file cannot
work there — this is not a configuration problem, it is what "serverless" means. Turso is a
hosted libSQL database (libSQL is SQLite's own wire-compatible superset) with a free tier, and
`apps/api/src/db/index.ts` already speaks to it through the same `@libsql/client` driver it uses
for the local file, so nothing about the schema or the queries changes — only which URL they
point at.

This is **two Vercel projects** connected to the same repo, not one — a static site and a set of
serverless functions are different things to Vercel, and trying to force them into one project
fights the platform rather than using it. They still read as "one app" to the two of you: each
gets its own `*.vercel.app` URL, and the web app's build points at the API's URL.

1. **Install the CLIs and sign in** (both open a browser)

   ```bash
   npm install -g vercel
   vercel login

   curl -sSfL https://get.tur.so/install.sh | bash   # or: brew install tursodatabase/tap/turso
   turso auth login
   ```

2. **Create the database**

   ```bash
   turso db create loop-me-in
   turso db show loop-me-in --url            # → TURSO_DATABASE_URL
   turso db tokens create loop-me-in          # → TURSO_AUTH_TOKEN
   ```

3. **Push the schema** — from your laptop, against the real database, once:

   ```bash
   TURSO_DATABASE_URL=<from above> TURSO_AUTH_TOKEN=<from above> \
     npm run db:push --workspace @date-calendar/api
   ```

   Do **not** run `npm run seed` against it — that creates the fake Alice and Bob accounts. Your
   first real Google sign-in creates your account and space automatically.

4. **Make a production OAuth client.** Google Cloud console → the same project as before →
   **APIs & Services → Credentials → Create credentials → OAuth client ID**. Authorised redirect
   URI, once you know the **API** project's URL from step 5 — not the web project's:

   ```
   https://<your-api-project>.vercel.app/api/auth/google/callback
   ```

   That's the domain the `/api/auth/google/*` routes actually live on. The sign-in *link* the web
   app shows points here too (it's built from `VITE_API_BASE_URL`, the same value as step 6) — the
   web app's own domain has no such route and 404s if either of these points at it instead. A
   separate client from your local one, so rotating a leaked production secret can't touch your
   laptop. Add both your emails as test users again.

5. **Create the API project.** From the repo root:

   ```bash
   cd apps/api
   vercel link      # "Set up and deploy?" → yes; creates a new project
   ```

   In the Vercel dashboard for that project (Settings → Environment Variables), set everything
   from `apps/api/.env.production.example`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
   `SESSION_SECRET` (generate once, see the file), `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`,
   `COOKIE_SAMESITE=none`, `WEB_ORIGIN` (the web project's URL from step 6 — circular with step 4,
   so deploy once, note both URLs, then fill in the ones that reference each other and redeploy),
   **and `OAUTH_CALLBACK_URL`** set explicitly to this project's own URL
   (`https://<your-api-project>.vercel.app/api/auth/google/callback`) — leaving it unset falls
   back to `WEB_ORIGIN + /api/auth/google/callback`, which is the *wrong* domain once the API and
   web app are two separate Vercel projects. Then:

   ```bash
   vercel --prod
   ```

6. **Create the web project.**

   ```bash
   cd ../web
   vercel link
   ```

   Set one environment variable in that project's settings: `VITE_API_BASE_URL`, to
   `https://<your-api-project>.vercel.app/api`. Then:

   ```bash
   vercel --prod
   ```

7. **Reconcile the circular URLs.** Now that both projects have real `.vercel.app` URLs, go back
   and set the API project's `WEB_ORIGIN` to the *actual* web URL if it differs from what you
   guessed, and redeploy the API (`vercel --prod` from `apps/api`). The OAuth redirect URI and
   `OAUTH_CALLBACK_URL` from step 4 only depend on the *API's* URL, which was already known then,
   so they don't need touching here. Vercel's own generated URLs are stable once a project exists,
   so this is a one-time reconciliation, not an ongoing chore.

   **Deployment Protection.** New Vercel projects on a team plan can come with "Vercel
   Authentication" (SSO) enabled on every deployment by default — it'll silently redirect *every*
   request, including your API calls, to a Vercel login page, which looks exactly like a broken
   deploy. Turn it off for both projects: `vercel project protection disable <project> --sso`.

Then open the web project's URL, sign in, and send her an invite link from the header.

**Local dev is unaffected.** `npm run dev` at the repo root still runs both apps against the
local `file:./calendar.db` — nothing about local work touches Turso or Vercel.

### Using it from a phone

It's a web app, so it just works in mobile Safari/Chrome. Both of you can "Add to Home Screen" and
it behaves close enough to an app for daily use. The README's `Adding the mobile app` section
covers the real React Native route if you ever want it — note that native sign-in uses
`expo-auth-session` rather than this browser redirect, though everything behind the session table
stays as it is.

---

## Stage 3 — only if you outgrow it

You will know you've hit this when you want more than one API machine, or you start worrying about
the volume. For two people, realistically neither happens.

**Moving to Postgres.** Drizzle makes this genuinely small: swap the driver in
`apps/api/src/db/index.ts`, change `dialect` in `drizzle.config.ts`, and point `DATABASE_URL` at a
Neon or Supabase connection string. The schema file itself barely changes — mostly
`sqliteTable` → `pgTable` and the boolean/timestamp column helpers. The one thing to plan is
getting the existing rows across, which for a calendar this size is a script, not a migration
strategy.

**Backups.** Worth doing well before Stage 3, honestly. On Fly, `fly ssh console -C "cat
/data/calendar.db" > backup.db` on a schedule is crude but sufficient. SQLite's real backup
command is `sqlite3 /data/calendar.db ".backup /data/backup.db"`, which is safe to run while the
app is live.

---

## Environment file reference

| File | Committed? | What it's for |
|---|---|---|
| `apps/api/.env` | No | Your actual local settings. Already created. |
| `apps/api/.env.example` | Yes | The documented template for the API. |
| `apps/api/.env.production.example` | Yes | Keys to set on your production host. |
| `apps/api/.env.staging.example` | Yes | Same, for a throwaway environment. |
| `apps/web/.env.example` | Yes | Web build-time config. Unused in dev. |
| `apps/web/.env.production.example` | Yes | Only needed for Option B (split origins). |

Real `.env` files are gitignored; every `*.example` is committed. Nothing secret belongs in a
`VITE_`-prefixed variable — those are inlined into the JavaScript bundle and readable by anyone.

### The API's variables

| Variable | Required | Notes |
|---|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | For real sign-in | From the Google console. |
| `SESSION_SECRET` | In production | Generate once, keep forever. The API refuses to boot without it when `NODE_ENV=production`. |
| `WEB_ORIGIN` | Yes | Where the browser app lives. Sign-in returns here; invite links are built from it. |
| `OAUTH_CALLBACK_URL` | Only if it isn't `WEB_ORIGIN` + `/api/auth/google/callback` | Must match the Google console verbatim. |
| `COOKIE_SAMESITE` | Only for split origins | Set to `none`. Requires HTTPS. |
| `AUTH_DEV_USER` | No | Local bypass. Ignored when `NODE_ENV=production`. |
| `TURSO_DATABASE_URL` | No | Defaults to the local file `file:./calendar.db`. Set to `libsql://...` for a real Turso database. |
| `TURSO_AUTH_TOKEN` | Only with a `libsql://` URL | From `turso db tokens create`. |
| `PORT` | No | Defaults to 3031. Most hosts inject their own; Vercel manages this itself. |
