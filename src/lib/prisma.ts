import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";

// Prisma 7 uses a driver adapter for the database connection.
//
// - Production / any real Postgres: set DATABASE_URL and we use @prisma/adapter-pg.
// - Local dev with no DATABASE_URL: we fall back to in-process PGlite (real
//   Postgres compiled to run inside Node), persisted to ./.pglite — so a fresh
//   clone runs with just `npm install && npm run dev`, no database to install.
//   The schema is applied by scripts/dev-db.mjs via the "predev" npm hook.

const connectionString = process.env.DATABASE_URL;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient() {
  if (connectionString) {
    return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  }
  const adapter = new PrismaPGlite(new PGlite({ dataDir: "./.pglite" }));
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
