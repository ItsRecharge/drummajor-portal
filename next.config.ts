import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (dev DB) ships WASM + a Node FS layer that breaks when bundled.
  // Keep it (and its Prisma adapter) external so it's loaded via native require.
  serverExternalPackages: ["@electric-sql/pglite", "pglite-prisma-adapter"],
};

export default nextConfig;
