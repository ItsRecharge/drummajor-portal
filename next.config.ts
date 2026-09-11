import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (dev DB) ships WASM + a Node FS layer that breaks when bundled.
  // Keep it (and its Prisma adapter) external so it's loaded via native require.
  serverExternalPackages: ["@electric-sql/pglite", "pglite-prisma-adapter"],
  experimental: {
    serverActions: {
      // uploadImageAction accepts images up to 4MB and the Classroom roster import
      // uploads ~2.5MB saved pages; the default 1MB body limit
      // would reject them before the action runs. 5mb leaves multipart headroom.
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
