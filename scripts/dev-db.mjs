// Dev database bootstrap (runs via the "predev" npm hook).
//
// When no DATABASE_URL is set, the app uses an in-process PGlite database in
// ./.pglite. This script applies every generated migration in prisma/migrations
// (sorted) exactly once, tracking applied names in a small bookkeeping table so
// it stays idempotent across runs. It's a no-op when a real DATABASE_URL is set
// (prod uses `prisma migrate deploy` instead).

import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

if (process.env.DATABASE_URL) {
  console.log("[dev-db] DATABASE_URL set — using that Postgres, skipping PGlite.");
  process.exit(0);
}

const db = new PGlite({ dataDir: "./.pglite" });
await db.waitReady;

await db.exec(
  `CREATE TABLE IF NOT EXISTS "_dev_migrations" ("name" TEXT PRIMARY KEY, "appliedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
);

const migrationsDir = "prisma/migrations";
const names = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

const { rows: appliedRows } = await db.query(`SELECT "name" FROM "_dev_migrations"`);
const applied = new Set(appliedRows.map((r) => r.name));

// A .pglite created before this bookkeeping table existed already has the
// 0_stage1_init schema but no tracking row. Mark it applied so the loop below
// doesn't try to re-run it (which would fail on "relation already exists").
const { rows: userRows } = await db.query(`SELECT to_regclass('public."User"') AS t`);
if (userRows[0]?.t && !applied.has("0_stage1_init")) {
  await db.query(
    `INSERT INTO "_dev_migrations" ("name") VALUES ('0_stage1_init') ON CONFLICT DO NOTHING`,
  );
  applied.add("0_stage1_init");
}

for (const name of names) {
  if (applied.has(name)) continue;
  const file = join(migrationsDir, name, "migration.sql");
  if (!existsSync(file)) continue;
  await db.exec(readFileSync(file, "utf8"));
  await db.query(`INSERT INTO "_dev_migrations" ("name") VALUES ($1)`, [name]);
  console.log(`[dev-db] Applied migration ${name} to PGlite (.pglite).`);
}

await db.close();
console.log("[dev-db] Migrations up to date.");
