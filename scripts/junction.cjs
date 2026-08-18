// OneDrive sync steals file handles mid-build and corrupts .next. Junctioning
// ALL of .next breaks Node module resolution (require() realpaths through the
// junction, so compiled bundles can't find react from outside the project).
// The workable middle ground: .next stays a real project directory, and only
// .next/cache — the write-heavy part that provokes OneDrive — is a junction to
// %USERPROFILE%\.tron-2030-next-cache. Runs via the predev/prebuild npm hooks.
const fs = require("fs");
const path = require("path");
const os = require("os");

function main() {
  if (process.platform !== "win32") return;
  const dotNext = path.join(__dirname, "..", ".next");
  const cacheLink = path.join(dotNext, "cache");
  const target = path.join(os.homedir(), ".tron-2030-next-cache");

  let st = null;
  try {
    st = fs.lstatSync(dotNext);
  } catch {}
  if (st?.isSymbolicLink()) {
    fs.rmdirSync(dotNext); // removes just the link from the old all-of-.next scheme
    st = null;
  }
  if (!st) fs.mkdirSync(dotNext, { recursive: true });

  let cst = null;
  try {
    cst = fs.lstatSync(cacheLink);
  } catch {}
  if (cst?.isSymbolicLink()) return; // already set up
  if (cst) fs.rmSync(cacheLink, { recursive: true, force: true });

  fs.mkdirSync(target, { recursive: true });
  fs.symlinkSync(target, cacheLink, "junction");
  console.log(`.next/cache -> junction -> ${target}`);
}

// Also pre-delete out/ so OneDrive releases its locks while the build runs —
// the exporter's own rmdir at the end of the build otherwise hits EBUSY.
function clearOut() {
  if (process.platform !== "win32") return;
  const out = path.join(__dirname, "..", "out");
  if (!fs.existsSync(out)) return;
  for (let attempt = 0; attempt < 15; attempt++) {
    try {
      fs.rmSync(out, { recursive: true, force: true });
      return;
    } catch {
      if (attempt === 0) console.log("out/ is locked (OneDrive syncing) — waiting for it to let go…");
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
    }
  }
  console.log("out/ still locked after 15s — the export step may fail; try again in a minute");
}

main();
clearOut();
