import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema.js';

// `file:./calendar.db` locally (a real embedded SQLite file, same as before —
// no Turso account needed for local work) or a `libsql://...` Turso database
// in production, selected purely by which URL is in the environment. Same
// driver, same schema, same SQL either way — that's the point of libSQL over
// plain SQLite here: it runs as a local file AND as a hosted database Vercel's
// stateless functions can actually reach, with no code branch between them.
const url =
  process.env.TURSO_DATABASE_URL ??
  // A bare DATABASE_URL from before the libSQL switch (e.g. `./calendar.db`)
  // needs the `file:` scheme libSQL requires; a value that already looks like
  // a URL (file:, libsql:, http:) is passed through untouched.
  (process.env.DATABASE_URL
    ? /^[a-z]+:/i.test(process.env.DATABASE_URL)
      ? process.env.DATABASE_URL
      : `file:${process.env.DATABASE_URL}`
    : 'file:./calendar.db');
const authToken = process.env.TURSO_AUTH_TOKEN;

const client = createClient({ url, authToken });

// Foreign keys are off by default in SQLite — without this the ON DELETE SET
// NULL on events.category_id would silently do nothing. Set once at boot: for
// a local file this is a real, persistent connection-level pragma; for a
// remote Turso database libSQL enforces foreign keys server-side regardless,
// so this is belt-and-braces rather than load-bearing there.
await client.execute('PRAGMA foreign_keys = ON');

export const db = drizzle(client, { schema });
export { schema, client };
