import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export: the app is plain files on Workers static assets; all data comes from the API Worker.
  // cacheComponents/partialPrefetching were removed: Next 16.4 fails the build with
  // "Invariant: PPR cannot be enabled in export mode".
  output: "export",
  reactCompiler: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
