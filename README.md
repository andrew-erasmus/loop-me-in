# Calendar

A shared calendar for two people, with colour-coded events, five date views — month, week,
three-day, day and agenda — and one more for lists: the films you keep meaning to watch, the places you keep
meaning to go, the things you keep meaning to do. Give one of them a date and it appears on the
calendar without leaving the list.

Sign-in is Google OAuth. Everything lives in a **space** that both of you belong to, and any one
event can be kept back: *Surprise* shows the other person that the time is taken without showing
what it is, and *Just me* hides it from them completely.

Built as a monorepo with the calendar logic in a UI-free package: where an event sits, what a
drag means and which days a view covers are all decided there, and can be tested without a
browser to render them in.

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
```

### `packages/core` — the logic worth keeping separate

| File | What it holds |
|---|---|
| `types.ts` | Domain types and the Zod schemas both the API and the clients validate with |
| `dates.ts` | Month grid, week days, hour slots, view ranges, period navigation |
| `layout.ts` | Overlap/column layout for the time grid, returned as **fractions, not pixels** |
| `span.ts` | Which day columns a multi-day event covers, and how bars stack into lanes |
| `drag.ts` | What a drag does to an event's times — move, resize, re-date |
| `events.ts` | Range filtering, grouping by day, category and person colour resolution |
| `lists.ts` | Item sorting and grouping, keenness, and the event→item index |
| `client.ts` | Typed `fetch` client |

`layout.ts` is the piece worth protecting. Working out where overlapping events sit is the
genuinely fiddly part of a calendar, and because it returns ratios rather than pixels it can be
tested on its own — turning a ratio into `ratio * HOUR_HEIGHT` is the grid's job, not the maths'.

`span.ts` is the same idea on the other axis. `layout.ts` answers "where does this sit on an hour
axis"; `span.ts` answers "which days does it reach across, and what does it sit above or below".
It returns column indices and lane numbers, so a Mon–Thu trip is one bar four cells wide rather
than four identical chips, and turning a lane into a CSS grid row is the view's job. It takes any
run of consecutive days, which is why one function serves the month grid's seven columns and the
time grid's all-day band at seven, three or one.

`drag.ts` follows the same rule from the other direction. A gesture is reduced to "N days
sideways, M minutes vertically" *before* it reaches core, so the file knows nothing about pointers
or pixels. The web hooks in `apps/web/src/hooks/useEventDrag.ts` and `useMonthEventDrag.ts` hold
all the DOM-specific parts — hit-testing columns, the click-versus-drag threshold — and call
`moveEvent` / `resizeEventEnd` once the gesture has a meaning rather than a pixel count.

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

### Why the root `package.json` pins versions

`zod` sits in `overrides` because `zod-to-json-schema` accepts `^3 || ^4`: left alone, npm gives
the API v4 while `packages/core` keeps v3, and two copies of the same validator disagree about
what a valid event is. `react` and `react-dom` are pinned so everything resolves one copy.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | API and web together |
| `npm stop` | Stop both and free their ports |
| `npm run dev:api` / `npm run dev:web` | One at a time |
| `npm test` | Vitest over `packages/core` (130 tests) |
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
- **Something lasting more than a day** — anything crossing midnight draws as one continuous bar
  across the days it covers, squared off where it crosses into the next week rather than rounded,
  which would claim it ends there. Dragging the bar moves the whole thing and keeps its length.
  In Agenda it still appears on each day, marked `Day 2 of 4`.
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

## The rule that keeps the core worth having


`packages/core` must never import React, `react-dom`, or any DOM API. That is what lets the
fiddly parts — overlap layout, drag arithmetic, view ranges — be tested directly, with no
renderer to stand up first. If a piece of logic can't live there, check whether it is genuinely
presentational before putting it in a component.
