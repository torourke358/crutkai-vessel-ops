import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const nextConfig: NextConfig = {
  // Pin Turbopack's project root to this app. Without this, a stray
  // package-lock.json in C:\Users\Owner makes Next infer the wrong workspace
  // root, which can destabilize Turbopack's module resolution.
  turbopack: {
    root: dirname(fileURLToPath(import.meta.url)),
  },
};

export default nextConfig;
