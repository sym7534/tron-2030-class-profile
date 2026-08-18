// On Windows the build/export lands outside OneDrive (see next.config.ts);
// copy it back to ./out so the deploy artifact is always in the same place.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const EXTERNAL = path.resolve(ROOT, "../../../../tron-2030-build");
const DEST = path.join(ROOT, "out");

if (process.platform === "win32" && fs.existsSync(path.join(EXTERNAL, "index.html"))) {
  // OneDrive often holds a handle on ./out — overwrite in place if rm fails
  // (chunk filenames are content-hashed, so stale leftovers are harmless)
  try {
    fs.rmSync(DEST, { recursive: true, force: true });
  } catch {
    console.log("out/ is locked (OneDrive) — overwriting in place");
  }
  fs.cpSync(EXTERNAL, DEST, { recursive: true, force: true });
  console.log(`Copied export -> ${DEST}`);
} else {
  console.log("Export already in ./out — nothing to copy.");
}
