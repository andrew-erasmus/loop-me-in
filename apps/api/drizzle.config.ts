import { defineConfig } from 'drizzle-kit';

// The `turso` dialect (not `sqlite`) is what makes `authToken` valid here — it
// is the same SQL dialect, just the driver drizzle-kit talks to. Point
// TURSO_DATABASE_URL/TURSO_AUTH_TOKEN at a real Turso database before running
// `db:push` against production; left unset, this pushes to the local file.
export default defineConfig({
  dialect: 'turso',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL ?? 'file:./calendar.db',
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
});
