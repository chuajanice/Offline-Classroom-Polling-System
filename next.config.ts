import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

// Phase 6: pin the project root explicitly. Without this, Turbopack walks up from the
// project and can pick a stray package-lock.json in a parent folder (for example the
// user's home directory) as the workspace root. Setting it here changes no files.
const projectRoot = fileURLToPath(new URL(".", import.meta.url));

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: false,
  partialPrefetching: false,
  turbopack: {
    root: projectRoot,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
