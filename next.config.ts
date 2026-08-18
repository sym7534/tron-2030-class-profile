import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  // on Windows, keep the build dir out of OneDrive's reach — its sync steals
  // file handles mid-build and corrupts .next (ENOENT on manifests); the
  // export is copied back to ./out by scripts/copy-out.mjs
  distDir: process.platform === "win32" ? "../../../../tron-2030-build" : ".next",
};

export default nextConfig;
