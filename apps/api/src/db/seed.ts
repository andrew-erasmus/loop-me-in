import { randomUUID } from 'node:crypto';
import { CATEGORY_PALETTE } from '../core.js';
import { db, schema } from './index.js';

/**
 * Seeds a demo space with two accounts in it, the five starter categories, a
 * handful of events in the current week, and three lists with things on them —
 * so a fresh install is a working two-person calendar rather than an empty grid.
 *
 * The two accounts exist so the sharing behaviour is testable before any Google
 * credentials are set up: run the API with `AUTH_DEV_USER=alice@example.com`,
 * or with Bob's address in a second browser profile, and you are looking at the
 * same space as two different people.
 *
 * Idempotent: if the demo space already exists it does nothing rather than
 * duplicating everything.
 */

const DEMO_USERS = [
  { email: 'alice@example.com', name: 'Alice' },
  { email: 'bob@example.com', name: 'Bob' },
];

const STARTER_CATEGORIES = [
  { name: 'Work', color: '#3b82f6' },
  { name: 'Personal', color: '#22c55e' },
  { name: 'Health', color: '#ec4899' },
  { name: 'Social', color: '#f97316' },
  { name: 'Other', color: '#64748b' },
];

const STARTER_LISTS = [
  {
    name: 'Movies to watch',
    emoji: '🎬',
    color: '#8b5cf6',
    items: [
      {
        title: 'Dune: Part Two',
        url: 'https://www.imdb.com/title/tt15239678/',
        keen: 'both',
        effort: 'low',
        cost: 'medium',
      },
      { title: 'Past Lives', keen: 'one', effort: 'low', cost: 'low' },
      {
        title: 'The Grand Budapest Hotel',
        notes: 'Rewatch',
        keen: 'none',
        // Sat here a while with nobody deciding on it — shows the "added a
        // while ago" nudge without having to wait three real weeks for it.
        ageDays: 21,
      },
    ],
  },
  {
    name: 'Places to go',
    emoji: '📍',
    color: '#14b8a6',
    items: [
      { title: 'That Thai place on Kloof St', keen: 'both', effort: 'low', cost: 'medium' },
      { title: 'Sunday market at the old biscuit mill', keen: 'one', effort: 'low', cost: 'low' },
      {
        title: 'Kirstenbosch summer concert',
        keen: 'both',
        schedule: true,
        effort: 'medium',
        cost: 'medium',
      },
    ],
  },
  {
    name: 'Things to do',
    emoji: '✨',
    color: '#eab308',
    items: [
      { title: 'Hike Lion’s Head at sunrise', keen: 'both', effort: 'medium', cost: 'low' },
      { title: 'Finally frame the photos', keen: 'one', effort: 'low', cost: 'low' },
      { title: 'Pottery class', keen: 'none', effort: 'high', cost: 'high', ageDays: 18 },
    ],
  },
];

/** An ISO instant at `hour:minute` local time, `dayOffset` days from today. */
function at(dayOffset: number, hour: number, minute = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

async function seed() {
  const existing = await db.select().from(schema.spaces).all();
  if (existing.length > 0) {
    console.log(`Skipping seed — ${existing.length} space(s) already exist.`);
    return;
  }

  const now = new Date().toISOString();

  const space = { id: randomUUID(), name: 'Loop Me In', createdAt: now };
  await db.insert(schema.spaces).values(space);

  const users = DEMO_USERS.map((user, index) => ({
    id: randomUUID(),
    // A demo account has no real Google identity; the prefix keeps these from
    // ever colliding with a genuine subject claim.
    googleSub: `demo|${user.email}`,
    email: user.email,
    name: user.name,
    avatarUrl: null,
    color: CATEGORY_PALETTE[index % CATEGORY_PALETTE.length]!,
    createdAt: now,
  }));
  await db.insert(schema.users).values(users);

  await db.insert(schema.spaceMembers).values(
    users.map((user, index) => ({
      spaceId: space.id,
      userId: user.id,
      role: index === 0 ? ('owner' as const) : ('member' as const),
      joinedAt: now,
    })),
  );

  const [alice, bob] = users as [(typeof users)[number], (typeof users)[number]];

  const categories = STARTER_CATEGORIES.map((category) => ({
    id: randomUUID(),
    spaceId: space.id,
    ...category,
    createdAt: now,
  }));
  await db.insert(schema.categories).values(categories);
  const categoryByName = new Map(categories.map((c) => [c.name, c.id]));

  const sampleEvents = [
    {
      title: 'Team standup',
      startsAt: at(0, 9, 30),
      endsAt: at(0, 9, 45),
      categoryId: categoryByName.get('Work')!,
      createdBy: alice.id,
    },
    {
      // Deliberately overlaps the design review below, so the side-by-side
      // column layout is visible the moment you open the app.
      title: 'Sprint planning',
      startsAt: at(0, 14, 0),
      endsAt: at(0, 15, 30),
      categoryId: categoryByName.get('Work')!,
      createdBy: alice.id,
    },
    {
      title: 'Design review',
      startsAt: at(0, 14, 30),
      endsAt: at(0, 16, 0),
      categoryId: categoryByName.get('Work')!,
      createdBy: bob.id,
    },
    {
      title: 'Gym',
      startsAt: at(1, 7, 0),
      endsAt: at(1, 8, 0),
      categoryId: categoryByName.get('Health')!,
      createdBy: bob.id,
    },
    {
      title: 'Dentist',
      startsAt: at(2, 11, 0),
      endsAt: at(2, 11, 45),
      categoryId: categoryByName.get('Health')!,
      createdBy: alice.id,
    },
    {
      title: 'Dinner with friends',
      startsAt: at(3, 19, 0),
      endsAt: at(3, 22, 0),
      categoryId: categoryByName.get('Social')!,
      createdBy: alice.id,
    },
    {
      // Private to Bob — signed in as Alice you should not see this at all.
      // Here so the visibility rule is visible without setting one up.
      title: 'Pick up Alice’s birthday present',
      startsAt: at(4, 17, 0),
      endsAt: at(4, 18, 0),
      visibility: 'private' as const,
      categoryId: categoryByName.get('Personal')!,
      createdBy: bob.id,
    },
    {
      // A surprise from Bob: as Alice you see this slot is taken, but the
      // title, the notes and the category are stripped before they reach you.
      // The pair of these two events is the quickest way to see the difference
      // between "hidden" and "hidden in plain sight".
      title: 'Dinner at the Test Kitchen for Alice’s birthday',
      notes: 'Booked for 19:00. Do not let her see this one.',
      startsAt: at(6, 19, 0),
      endsAt: at(6, 22, 0),
      visibility: 'surprise' as const,
      categoryId: categoryByName.get('Social')!,
      createdBy: bob.id,
    },
    {
      title: 'Public holiday',
      startsAt: at(5, 0, 0),
      endsAt: at(5, 23, 59),
      allDay: true,
      categoryId: categoryByName.get('Other')!,
      createdBy: alice.id,
    },
  ];

  await db.insert(schema.events).values(
    sampleEvents.map((event) => ({
      id: randomUUID(),
      spaceId: space.id,
      notes: null,
      allDay: false,
      visibility: 'shared' as const,
      // Spread last so a per-event `notes`/`visibility` overrides the default
      // rather than the other way round.
      ...event,
      createdAt: now,
      updatedAt: now,
    })),
  );

  let itemCount = 0;
  let scheduledCount = 0;

  for (const [listIndex, list] of STARTER_LISTS.entries()) {
    const listRow = {
      id: randomUUID(),
      spaceId: space.id,
      name: list.name,
      emoji: list.emoji,
      color: list.color,
      position: listIndex,
      createdBy: alice.id,
      createdAt: now,
    };
    await db.insert(schema.lists).values(listRow);

    for (const [itemIndex, item] of list.items.entries()) {
      const scheduled = 'schedule' in item && item.schedule;
      let eventId: string | null = null;

      if (scheduled) {
        // One item starts out already on the calendar, so the link between a
        // list and the grid is visible without having to set one up first.
        eventId = randomUUID();
        await db.insert(schema.events).values({
          id: eventId,
          spaceId: space.id,
          title: item.title,
          notes: null,
          startsAt: at(6, 18, 0),
          endsAt: at(6, 21, 0),
          allDay: false,
          visibility: 'shared',
          createdBy: alice.id,
          categoryId: categoryByName.get('Social')!,
          createdAt: now,
          updatedAt: now,
        });
        scheduledCount += 1;
      }

      const createdAt =
        'ageDays' in item && item.ageDays
          ? new Date(Date.now() - item.ageDays * 24 * 60 * 60 * 1000).toISOString()
          : now;

      const itemRow = {
        id: randomUUID(),
        spaceId: space.id,
        listId: listRow.id,
        title: item.title,
        notes: 'notes' in item ? (item.notes ?? null) : null,
        url: 'url' in item ? (item.url ?? null) : null,
        doneAt: null,
        effort: 'effort' in item ? (item.effort ?? null) : null,
        cost: 'cost' in item ? (item.cost ?? null) : null,
        position: itemIndex,
        scheduledEventId: eventId,
        createdBy: itemIndex % 2 === 0 ? alice.id : bob.id,
        createdAt,
        updatedAt: now,
      };
      await db.insert(schema.listItems).values(itemRow);
      itemCount += 1;

      const voters =
        item.keen === 'both' ? users : item.keen === 'one' ? [alice] : [];
      if (voters.length > 0) {
        await db.insert(schema.itemVotes).values(
          voters.map((user) => ({
            itemId: itemRow.id,
            userId: user.id,
            createdAt: now,
          })),
        );
      }
    }
  }

  console.log(
    [
      `Seeded the space "${space.name}" with ${users.length} demo accounts:`,
      ...users.map((user) => `  • ${user.name} <${user.email}>`),
      `${categories.length} categories, ${sampleEvents.length + scheduledCount} events,`,
      `${STARTER_LISTS.length} lists and ${itemCount} items.`,
      '',
      'To use it without Google credentials, run the API with:',
      `  AUTH_DEV_USER=${users[0]!.email} npm run dev:api`,
    ].join('\n'),
  );
}

await seed();
