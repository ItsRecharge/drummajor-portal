// Dev database bootstrap (runs via the "predev" npm hook).
//
// When no DATABASE_URL is set, the app uses an in-process PGlite database in
// ./.pglite. This script ensures the schema exists by applying the generated
// initial migration once. It's idempotent and a no-op when a real DATABASE_URL
// is configured.

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

if (process.env.DATABASE_URL) {
  console.log("[dev-db] DATABASE_URL set — using that Postgres, skipping PGlite.");
  process.exit(0);
}

const db = new PGlite({ dataDir: "./.pglite" });
await db.waitReady;

const { rows } = await db.query(`SELECT to_regclass('public."User"') AS t`);
if (rows[0]?.t) {
  console.log("[dev-db] PGlite schema already present (.pglite).");
} else {
  const sql = readFileSync("prisma/migrations/0_stage1_init/migration.sql", "utf8");
  await db.exec(sql);
  console.log("[dev-db] Applied initial migration to PGlite (.pglite).");
}

await db.close();
