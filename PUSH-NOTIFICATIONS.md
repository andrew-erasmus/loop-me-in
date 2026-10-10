# Push notifications

When one of you adds, moves or removes a plan, adds to a list, is keen on something or gives it
a date, the other gets a notification on their phone or laptop. Each of you picks which kinds
under **Settings (the gear) → Notifications**, and turns notifications on per device on the same
page.

Delivery goes through **Firebase Cloud Messaging** (FCM). It's free, and it is the one push service
that reaches Chrome, Edge, Firefox *and* Safari — including iPhone, once the app is on the Home
Screen.

## How it fits together

```
 Sam moves a plan ──► API saves it ──► firebase-admin ──► FCM ──► Web Push ──► Alex's service worker
                       (routes/events.ts)  (notifications/)                    (apps/web/src/sw.ts)
                                                                               shows the notification,
                                                                               and an open app refetches
```

- **The browser** asks permission, gets an FCM token from Firebase, and hands it to the API
  (`POST /api/notifications/devices`). The token is tied to that sign-in session, so signing out
  of a device stops it receiving.
- **The API** works out who else is in the space, drops anyone who has switched that kind off,
  writes the text in each device's own time zone and sends it. It never holds up the request
  that caused it.
- **What a notification says follows the same rules as the calendar.** Someone else's *Just me*
  event never notifies anyone. A *Surprise* tells the other person only that a time is taken —
  never what it is.

## Setting it up: about 15 minutes, once

You need two things from Firebase: a **web app config** (public, goes in the web build) and a
**service-account key** (secret, goes on the API).

### 1. Create the Firebase project

1. Open <https://console.firebase.google.com> and sign in with the Google account that owns your
   OAuth client.
2. **Create a project.** When it asks for a name, pick your **existing Google Cloud project**
   from the dropdown (the one you made for sign-in) rather than starting a new one. That keeps
   everything in one place. A new project works just as well if you'd rather.
3. Google Analytics: **off**. It isn't needed.

### 2. Register the web app → five `VITE_` values

1. On the project overview, click the **`</>`** (Web) icon.
2. Nickname: `Loop Me In web`. **Leave "Firebase Hosting" unticked** — Vercel hosts the app.
3. Click **Register app**. It shows a `firebaseConfig` object. You need four of its values:
   `apiKey`, `projectId`, `messagingSenderId`, `appId`. Skip the `npm install` step it suggests;
   that's already done.

   (Lost the screen? **⚙ Project settings → General → Your apps** shows it again.)

### 3. Generate the Web Push key → `VITE_FIREBASE_VAPID_KEY`

1. **⚙ Project settings → Cloud Messaging**.
2. Check that **Firebase Cloud Messaging API (V1)** says *Enabled*. If it doesn't, click the ⋮
   next to it and enable it in Google Cloud.
3. Scroll to **Web configuration → Web Push certificates → Generate key pair**.
4. Copy the long **Key pair** string. That's the public VAPID key. 


### 4. Create the service-account key → `FIREBASE_SERVICE_ACCOUNT`

1. **⚙ Project settings → Service accounts → Firebase Admin SDK**.
2. **Generate new private key → Generate key**. A `.json` file downloads.
3. Turn it into a single line the env file can't misread:

   ```bash
   base64 -i ~/Downloads/<project>-firebase-adminsdk-*.json | tr -d '\n'
   ```

4. **Treat it like a password.** Anyone holding it can send notifications as your app. Never
   commit it, never put it in a `VITE_` variable, and delete the downloaded file once it's stored
   on the API.

### 5. Local development

`apps/web/.env.local` (gitignored — create it):

```bash
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
VITE_FIREBASE_APP_ID=1:1234567890:web:abc123
VITE_FIREBASE_VAPID_KEY=BExample...
```

`apps/api/.env`:

```bash
FIREBASE_SERVICE_ACCOUNT=<the base64 line from step 4>
NOTIFY_SELF=true   # local only — see below
```

Then `npm run db:push` (it creates the two new tables) and `npm run dev`.

Open <http://localhost:5173> in **Chrome**. A "Stay in the loop?" prompt offers to turn
notifications on for this browser. Say yes (or use **gear → Notifications → Turn on
notifications**), allow it, then add an event: a notification should appear within a few
seconds. The development service worker is a module worker, which not every browser accepts, so
use Chrome or Edge for local testing.

**Why `NOTIFY_SELF`:** with `AUTH_DEV_USER` every request is the same person, and nobody is ever
notified about their own changes, so locally nothing would arrive. `NOTIFY_SELF=true` notifies
you about yourself, so you can watch real ones appear as you add and move events. Production
ignores it.

### 6. Production (Vercel)

**API project:** add `FIREBASE_SERVICE_ACCOUNT` (the base64 line) under **Settings →
Environment Variables**, then push the new tables to Turso:

```bash
TURSO_DATABASE_URL=<...> TURSO_AUTH_TOKEN=<...> \
  npm run db:push --workspace @date-calendar/api
```

**Web project:** add the five `VITE_FIREBASE_*` variables. They are inlined at **build** time,
so **redeploy** the web project after adding them. An existing build won't pick them up.

Then redeploy the API so it reads the new variable. Both projects are connected to GitHub, so a
push to `main` redeploys both.

### 7. Turn it on, on each phone

**iPhone / iPad** (iOS 16.4 or later): Apple only delivers web push to an app on the Home
Screen.

1. Open the site in **Safari → Share → Add to Home Screen**.
2. Open **Loop Me In from the new icon**, not from Safari.
3. Say yes to the **"Stay in the loop?"** prompt, or go to gear → Notifications → **Turn on
   notifications**, then **Allow**.
4. Have the other person add a plan to check it arrives.

The prompt appears once per account per device. In a Safari tab, it and the settings page
explain the Home Screen step instead of offering a button that can't work there.

**Android:** Chrome works in a tab or installed. Gear → Notifications → Turn on → Allow.

**Desktop:** any modern browser. On macOS, also check **System Settings → Notifications →
<your browser>** is allowed, or the browser accepts the push and macOS hides it silently.

## Troubleshooting

| Symptom | Cause |
|---|---|
| Page says *"aren't set up in this build"* | `VITE_FIREBASE_*` missing from the build. Locally: `apps/web/.env.local`, then restart Vite. On Vercel: add them and **redeploy** the web project. |
| Amber *"server can't send"* banner | `FIREBASE_SERVICE_ACCOUNT` isn't set on the API, or the API wasn't redeployed after setting it. |
| *"service worker isn't running"* | Reload once: the first visit after deploying installs the new worker. Locally, use Chrome. |
| Settings says on, but nothing arrives | Check the other person's change was a kind you have switched on, and wasn't *Just me*. Then check OS-level notifications for the browser (macOS Focus / System Settings), or on iOS that the app was opened from the Home Screen icon, not Safari. Still nothing: turn notifications off and on again on that device for a fresh token. The API also drops tokens FCM reports as dead. |
| *"blocked for Loop Me In"* | Permission was denied once, and browsers don't let a site ask twice. Re-allow in site settings (iOS: Settings → Notifications → Loop Me In). |
| API log: `invalid_grant` / `account not found` | The service-account key was deleted or revoked in Google Cloud. Generate a new one (step 4). |

## Optional hardening

The `VITE_FIREBASE_API_KEY` is public by design, but you can stop anyone else's site using it:
Google Cloud console → **APIs & Services → Credentials** → the *Browser key (auto created by
Firebase)* → **Website restrictions**: add `http://localhost:5173/*` and your web project's
`https://….vercel.app/*`.

## What isn't in yet

- **Reminders before an event starts.** These need something to wake the API on a schedule (a
  Vercel Cron job), not a change somebody makes. `apps/api/src/notifications/notify.ts`
  already has the delivery half (`sendToUsers`) such a job would call.
- **Per-space preferences.** The switches apply to every space you're in.
