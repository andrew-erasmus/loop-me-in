# Calendar

A shared calendar for two people, with colour-coded events, four date views — month, week, day
and agenda — and a fifth for lists: the films you keep meaning to watch, the places you keep
meaning to go, the things you keep meaning to do. Give one of them a date and it appears on the
calendar without leaving the list.

Sign-in is Google OAuth. Everything lives in a **space** that both of you belong to, and any one
event can be kept back: *Surprise* shows the other person that the time is taken without showing
what it is, and *Just me* hides it from them completely.

Built as a monorepo so that a React Native app can be added later without a rewrite: all the
calendar logic lives in a UI-free package that both platforms import.

## Quick start

```bash
npm install
npm run db:push     # create the SQLite schema
npm run seed        # a demo space, two accounts, categories, events and three lists
npm run dev         # API on :3031, web on :5173
```

The seed creates **alice@example.com** and **bob@example.com** in a shared space. To use the app
as one of them without setting up Google credentials first, put this in `apps/api/.env`:

```
AUTH_DEV_USER=alice@example.com
```

Then open <http://localhost:5173>. API docs are at <http://localhost:3031/docs>.

`npm run seed` is safe to re-run — it does nothing if a space already exists. To start over,
delete `apps/api/calendar.db*` and run `db:push` and `seed` again.

### Stopping it

`Ctrl+C` in the terminal running `npm run dev` is the clean way. If the terminal is gone, or the
port still looks busy afterwards:

```bash
npm stop
```

> **Why a script rather than killing the process on the port.** `npm run dev` builds a four-deep
> tree — npm → concurrently → npm → `tsx watch` → node — and `tsx watch` is a *supervisor*: kill
> the node process holding 3031 and it immediately starts a replacement, so the port never
> appears to free up. Closing the terminal doesn't reliably help either, because npm does not
> forward signals to grandchildren; the orphans get reparented to PID 1 and keep running.
> `npm stop` kills the supervisors first, so nothing is left to respawn.
>
> It only touches processes whose command line contains this directory, so it will not disturb
> other projects. If a port is still held afterwards, it names the process rather than killing
> something it cannot prove is ours.

## Signing in with Google

`AUTH_DEV_USER` is for local work only; real sign-in needs a Google OAuth client, which takes
about ten minutes to set up.

**→ [OAUTH-AND-DEPLOYMENT.md](./OAUTH-AND-DEPLOYMENT.md)** walks through it step by step, and
then through getting the app online so both of you can use it from anywhere.

The one detail worth repeating here, because getting it wrong costs an afternoon: the authorised
redirect URI is `http://localhost:5173/api/auth/google/callback` — pointed at **Vite, not the
API**. Vite proxies `/api` through, so the whole flow stays on one origin and the session cookie
is unambiguously first-party.

## Sharing it with someone

Press **Invite** in the header. That mints a single-use link, valid for seven days. Whoever opens
it signs in with Google and lands in your space rather than getting one of their own — which is
why the invite has to be followed *before* their first sign-in, and why there is never a second
space to merge afterwards.

## API docs

Swagger UI is served at **<http://localhost:3031/docs>**, with the raw OpenAPI 3.1 document at
`/docs/json`. Every endpoint is documented with its request body, response shapes and failure
cases, and **Try it out** issues real requests against your local database — the prefilled example
payloads are valid, so you can press Execute without editing them first.

The spec is **generated from the Zod schemas in `packages/core`**, not hand-written. That matters:
the schema the server validates against and the schema the docs describe are the same object, so
they cannot drift. Add a field to `eventInputSchema` and it appears in the docs on the next
restart.

One consequence worth knowing: route schemas here are for **documentation and response
serialization only** — request validation stays with Zod, via a pass-through validator compiler in
`apps/api/src/server.ts`. Zod is the stricter of the two (it trims before length checks, and
enforces the cross-field rule that an event may not end before it starts, neither of which JSON
Schema can express), so letting both validate would only mean two validators racing to reject the
same request with different wording.

## Layout

```
packages/core     Platform-agnostic calendar logic. No React, no DOM.
apps/api          Fastify + SQLite (Drizzle), Google OAuth, server-side sessions.
apps/web          React + Vite + Tailwind.
apps/mobile       Expo + React Native. Agenda screen; StyleSheet, no Tailwind.
```

### `packages/core` — the part that makes mobile cheap

| File | What it holds |
|---|---|
| `types.ts` | Domain types and the Zod schemas both the API and the clients validate with |
| `dates.ts` | Month grid, week days, hour slots, view ranges, period navigation |
| `layout.ts` | Overlap/column layout for the time grid, returned as **fractions, not pixels** |
| `drag.ts` | What a drag does to an event's times — move, resize, re-date |
| `events.ts` | Range filtering, grouping by day, category and person colour resolution |
| `lists.ts` | Item sorting and grouping, keenness, and the event→item index |
| `client.ts` | Typed `fetch` client |

`layout.ts` is the piece worth protecting. Working out where overlapping events sit is the
genuinely fiddly part of a calendar, and because it returns ratios rather than pixels the same
function drives the web grid (`ratio * HOUR_HEIGHT`) and, later, a React Native one
(`ratio * measuredHeight`).

`drag.ts` follows the same rule from the other direction. A gesture is reduced to "N days
sideways, M minutes vertically" *before* it reaches core, so the file knows nothing about pointers
or pixels. The web hooks in `apps/web/src/hooks/useEventDrag.ts` and `useMonthEventDrag.ts` hold
all the DOM-specific parts — hit-testing columns, the click-versus-drag threshold — and a React
Native `PanResponder` will replace those while calling the same `moveEvent` / `resizeEventEnd`.

Tests sit in `packages/core/src/__tests__/`, one file per module.

### `apps/web/src` — grouped by kind, then by feature

```
components/
  calendar/   The four date views, the header, the filter bar, the event dialogs
  lists/      The lists screen and its two dialogs
  auth/       Sign-in gate and the invite dialog
  ui/         Modal, Avatar and Icon — the components crossing feature lines
hooks/        Server state (TanStack Query) and the drag gestures
lib/          api client, date-input conversion, chip decorations, query keys
```

The split follows the import graph rather than taste: nothing in `calendar/` imports from
`lists/` or `auth/`, and the components that *are* shared live in `ui/`. If a third feature ever
needs something out of `calendar/`, that is the signal it belongs in `ui/`.

`hooks/` is deliberately left flat — six files whose names already say which feature they serve
(`useCalendarData`, `useLists`, `useAuth`) don't need folders on top of that. Subdivide a
directory when it stops being scannable, not for symmetry.

### Icons

Every status/UI icon — chevrons, close, delete, external link, lock, gift, people, calendar,
checkmark, heart/thumbs-up — is FontAwesome (the free solid set), through a thin `Icon` wrapper
in each app (`components/ui/Icon.tsx` on web, `components/Icon.tsx` on mobile) rather than calling
`FontAwesomeIcon` directly everywhere. Two things are deliberately *not* FontAwesome:

- **A list's own emoji** (`list.emoji`, e.g. 🎬 for "Movies to watch") — that is content the user
  picked, stored as a string in the database, not app chrome. Swapping it for an icon-name enum
  would be a schema change, and emoji is arguably the better UX for "pick a mascot" anyway. The
  emoji-picker suggestions in `ListModal.tsx` are the same call.
- **Google's four-colour "G"** on the sign-in button — a brand mark, not a generic icon.

`lib/decorations.ts`'s `chipPrefix` used to return a plain string mixing both (a status glyph plus
the list's own emoji) for the calendar views to concatenate into a chip's title text. It is now
split into `chipStatusIcon` (a FontAwesome `IconDefinition`, or `null`) and `chipListEmoji` (the
user's own emoji, or `undefined`), so a view can render the first as a real icon element and the
second as what it actually is — text.

## The mobile app

```bash
npm run dev          # the API has to be running
npm run mobile:ios   # Expo + iOS simulator, on port 8082
npm run mobile       # Expo only, for scanning with a phone
```

`mobile:ios` needs Xcode. For a physical phone, run `npm run mobile` and scan
the QR code with Expo Go — **the phone must be on the same wifi as your
laptop**, since it talks to the API directly over the LAN.

Both scripts use **port 8082** rather than React Native's default 8081, which is
often already taken by another project. The port does not affect the API
address; that is derived from the host.

`npm stop` shuts down Metro along with the API and web servers.

Two tabs: **Calendar** and **Lists**. Calendar switches between three views —
**Month** (a dot per event; tap a day to open it in Day view), **Day** (an hour
grid with a week strip above it), and **Agenda** (the list). **+** creates an
event from any of them; tapping one opens it, with Edit to change it.

**Week view is deliberately absent on mobile.** Seven columns at phone width is
roughly 50pt each — too narrow for a title and too narrow to tap reliably. Day
view's week strip gives the same orientation without the squeeze.

**Drag to reschedule** works in Day view, the mobile analogue of the web time
grid. **Hold an event, then drag** — a touch has no way to tell a drag from a
scroll from a few pixels of travel the way a mouse pointer does, so the hold
does that job instead: `react-native-gesture-handler`'s `activateAfterLongPress`
only claims the touch once the hold has lasted, and lets go of it beforehand so
a quick swipe still scrolls the day. The bottom edge resizes the same way, via a grip that is a
*sibling* of the event block rather than a child of it — as a child it could never be taller than
the event it resized, so a 30-minute event had a sliver of a target and a 15-minute one had none
at all. It is centred under the block rather than anchored to either edge, since a side-anchored
grip sat exactly where a thumb reaching in from the edge of the phone naturally lands, which made
it easy to grab the block underneath instead of the grip.

A commit that fails is retried once, silently, before anything rolls back or reaches the user —
the server side of a drag's PATCH has been replayed by hand and always succeeds, so a single
dropped request on a flaky connection is the likelier failure than a real rejection. If it fails
twice, the block reverts and an alert shows the *actual* error rather than a canned guess.

Both use the exact `moveEvent`/`resizeEventEnd`/`pixelsToMinutes` functions from
`@date-calendar/core` that the web drag hook calls — only the gesture plumbing
around them differs.

Two things differ from the web on purpose. The block moves via an
`Animated.Value` written straight from the gesture, not React state, because
re-rendering the day on every touch sample is far too slow without
`react-native-reanimated`. And the times a drag produces are always computed
from the event as it was when the finger went down, held in a ref — the
gesture's translation is cumulative from the touch origin, so re-basing each
frame on the previous frame's result compounds and sends the event flying.
`packages/core/src/__tests__/drag.test.ts` has regression tests for both.

As a consequence the column does not reflow around a dragged block the way the
web does; it re-lays-out once, on drop. Month-view dots are not draggable; they carry no visible
surface big enough to grab, and moving an event by day only (no time) would be
a different, smaller feature than this.

Event forms validate with the same `eventInputSchema` the server parses bodies
with, so phone, browser and API agree on what a valid event is.

Lists support adding, editing and deleting items, and scheduling — the same
"date link" as the web app, through the same `scheduleItem`/`unscheduleItem`
API calls. Creating a new *list* (as opposed to items on one) is still
web-only.

There is no IP to configure. Metro is already serving the JavaScript from your
laptop's address, so `src/lib/api.ts` takes the host out of Expo's manifest and
points at port 3031. Set `EXPO_PUBLIC_API_URL` to override it once there is a
deployed API.

Sign-in is not wired up yet, so run the API with `AUTH_DEV_USER` set (it is in
`apps/api/.env` already). Native Google sign-in needs a token-exchange endpoint
and bearer-token support in the guard — see **Adding the mobile app** below.

### Three things that make the monorepo work

**`overrides` in the root `package.json`.** Every Expo package declares a loose
`react` peer, so npm hoists the newest match while each app's exact pin nests a
second copy underneath — and `react-native` then resolves a different React than
your own components. In a Metro bundle that is `Invalid hook call` with no
usable stack. `zod` is pinned for the same reason: `zod-to-json-schema` accepts
`^3 || ^4`, and left alone npm gives the API v4 while `packages/core` keeps v3.

**`watchFolders` in `metro.config.js`.** `@date-calendar/core` lives outside the
mobile app, and Metro does not notice edits to files it is not watching.

**A `resolveRequest` hook**, also in `metro.config.js`. Core imports its own
modules as `./types.js` — correct for Node and Vite, both of which want the
explicit extension. Metro does not do that rewrite, so the hook retries without
the extension when the literal path is not there.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | API and web together |
| `npm stop` | Stop both and free their ports |
| `npm run dev:api` / `npm run dev:web` | One at a time |
| `npm run mobile` / `npm run mobile:ios` | Expo dev server; `:ios` opens the simulator |
| `npm test` | Vitest over `packages/core` (93 tests) |
| `npm run typecheck` | All three packages |
| `npm run db:push` | Apply the Drizzle schema to SQLite |
| `npm run seed` | Create the demo space, two accounts, categories, events and lists |

The API defaults to port **3031** (`PORT` to override) and the database to `apps/api/calendar.db`
(`DATABASE_URL` to override). Vite proxies `/api` to the API, so the browser stays same-origin.
Swagger UI is on the API's own port, so reach it at `:3031/docs` rather than through Vite.

## Using it

- **Add an event** — click any day in Month view, any half-hour slot in Week/Day view, or press `N`.
- **Reschedule by dragging** — in Week/Day view drag an event to change its time, or sideways to
  change its day; drag the handle on its bottom edge to change how long it lasts. In Month view
  drag a chip onto another day to re-date it, keeping its time. Drops snap to 15 minutes, and
  `Esc` mid-drag abandons the move.
- **Categories** — the `Categories` button opens a manager for adding, renaming, recolouring and
  deleting them. The chips under the header double as show/hide filters, alongside a chip per
  person for filtering by whose event it is.
- **Keep something to yourself** — every event has a *Who can see it* setting:

  | | What the other person sees |
  |---|---|
  | **Shared** | Everything. The default. |
  | **Surprise** 🎁 | That the slot is booked, and by whom — nothing else. No title, no notes, no category. They can't move or delete it either. |
  | **Just me** 🔒 | Nothing at all. The slot looks free. |

  *Surprise* is the one worth knowing about: it stops her booking over your anniversary dinner
  without telling her what it is. Redaction happens **on the server** — the real title never
  reaches her browser, so it isn't recoverable from devtools. If the surprise came from a list,
  its date disappears from her copy of that list too, or the two together would give it away.
- **Lists** — press `L`. Make a list, add things to it, and hit 👍 to say you're keen; when
  everyone has, the item lights up green. That is the cue that it is worth a date.
- **Give something a date** — open an item and press *Pick a date for this*. It creates a calendar
  event and links the two. The item **stays on the list**, now reading `Fri 3 Oct`; clicking that
  jumps to the day. The event shows the list's emoji and links back.
- **Keyboard** — `M`/`W`/`D`/`A`/`L` switch views, `←`/`→` move a period, `T` jumps to today, `N`
  is a new event, `Esc` closes a dialog.

### Five decisions worth knowing about

**Times are stored as ISO-8601 UTC and rendered in the viewer's local timezone.** Unambiguous in
the database, correct on screen, and no migration when a phone in another timezone starts writing
to the same API.

**Deleting a category never deletes its events.** The foreign key is `ON DELETE SET NULL`, so the
events survive and render in neutral grey until re-categorised. The confirmation dialog says so
explicitly. Losing appointments because a label was tidied up would be the worst bug this app
could have.

**Un-scheduling never deletes the thing you wanted to do.** `list_items.scheduled_event_id` uses
the same `ON DELETE SET NULL`, so deleting a Friday plan from the calendar returns its item to the
list rather than taking it with it — the same rule reached from either direction. Deleting the
*item* leaves the event alone for the mirror-image reason: cancelling a plan you have already made
should be a separate, deliberate act.

**Making something secret takes ownership of it.** `private` and `surprise` are both defined
relative to an event's creator — "only its creator sees it", "only its creator sees what it is".
Applying one to an event the *other* person created would therefore hide it from the wrong
person: marking her event private would hide it from you and leave it plainly visible to her. So
setting a restrictive visibility reassigns `createdBy` to whoever set it. The secret belongs to
whoever is keeping it.

**Sessions are rows, not JWTs.** Signing out has to actually revoke, and a stateless token needs a
revocation table to manage that anyway — at which point the token may as well be the row's key.
The cookie carries an opaque random id and nothing else. Every request re-checks space membership,
so removing someone takes effect immediately rather than whenever their cookie happens to expire.

## Adding the mobile app

The architecture assumes this is coming. There is no calendar library that covers both web and
React Native with real month/week/day views — the ecosystems are separate — so the strategy is to
own the logic and write the rendering twice.

```bash
npx create-expo-app apps/mobile
# add NativeWind, then import @date-calendar/core
```

What transfers unchanged: every type and Zod schema, all the date maths, the overlap layout, the
list logic in `lists.ts`, the API client, and the TanStack Query hooks. (If you'd rather generate a mobile client than reuse
`client.ts`, `/docs/json` gives you an OpenAPI 3.1 document to point a generator at.) What gets rewritten: the four view components and the
modal, in `View`/`Text`/`Pressable` instead of `div`/`span`/`button`. Roughly 60–70% reuse, and the
30% that differs is the part that *should* differ — a phone calendar shouldn't be laid out like a
desktop one.

Two things to do when that time comes:

1. Point the client at an absolute URL — `createCalendarClient({ baseUrl: 'http://<lan-ip>:3031/api' })`.
   CORS is already enabled on the API for exactly this.
2. Move the database off SQLite if more than one device writes to it. Drizzle makes this a driver
   swap in `apps/api/src/db/index.ts` plus a `dialect` change in `drizzle.config.ts`.
3. Set `WEB_ORIGIN` and `SESSION_SECRET`, and register the deployed callback URL in the Google
   console. The API refuses to start in production without a `SESSION_SECRET`, because a random
   per-boot one would sign everybody out on every deploy.

Native sign-in does not reuse this browser redirect — a phone wants `expo-auth-session` or Google's
native SDK, which returns an id token for the API to verify. The session table and everything
behind it stay exactly as they are; only how a session is *first* obtained differs.

### The rule that keeps this cheap

`packages/core` must never import React, `react-dom`, or any DOM API. If a piece of logic can't
live there, check whether it's genuinely presentational before putting it in a component — the
more that sits in `core`, the less there is to write twice.
