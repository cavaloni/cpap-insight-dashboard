import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Mark native modules as external (server-side only)
  serverExternalPackages: ['duckdb', 'better-sqlite3'],
  // Empty turbopack config to silence the warning about webpack config
  turbopack: {},
};

export default nextConfig;
