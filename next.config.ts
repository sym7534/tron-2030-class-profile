import type { NextConfig } from "next";

// GitHub Pages project sites live under /<repo-name>/ — the deploy workflow
// sets PAGES_BASE_PATH accordingly. Empty for local builds and custom domains.
const basePath = process.env.PAGES_BASE_PATH || "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  images: { unoptimized: true },
  // .next stays at the project root, but on Windows it should be a directory
  // JUNCTION to a folder outside OneDrive (OneDrive sync steals file handles
  // mid-build and corrupts it). `npm run data` recreates the junction if
  // missing — see scripts/build-data.mjs.
};

export default nextConfig;
