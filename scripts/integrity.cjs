/* deployment integrity: every asset referenced by out/index.html must exist in out/ */
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "out");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

const refs = new Set();
// src/href attributes
for (const m of html.matchAll(/(?:src|href)="(\/[^"]+)"/g)) refs.add(m[1]);
// next chunk preloads inside inline script payloads
for (const m of html.matchAll(/\/_next\/static\/[^"\\ )]+\.(?:js|css|woff2|ttf)/g)) refs.add(m[0]);

let missing = 0, checked = 0;
for (const r of refs) {
  const clean = r.split("?")[0].split("#")[0];
  if (!clean.startsWith("/")) continue;
  const fp = path.join(ROOT, decodeURIComponent(clean));
  checked++;
  if (!fs.existsSync(fp)) {
    console.log("MISSING:", clean);
    missing++;
  }
}
console.log(`checked ${checked} referenced assets, ${missing} missing`);

// fonts: the custom display font must be in the payload
const fontFiles = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const fp = path.join(d, e.name);
    if (e.isDirectory()) walk(fp);
    else if (/\.(woff2?|ttf)$/.test(e.name)) fontFiles.push(path.relative(ROOT, fp));
  }
})(ROOT);
console.log("font files shipped:", fontFiles.length, fontFiles.slice(0, 5));

// survey data is inlined into the page bundle (static export) — hero numbers present?
for (const probe of ["MECHATRONICS", "median daily caffeine", "12,532", "high school vs. university"]) {
  if (!html.includes(probe)) { console.log("CONTENT MISSING:", probe); missing++; }
}
console.log(missing === 0 ? "EXPORT INTEGRITY OK" : "EXPORT INTEGRITY FAILED");
process.exit(missing ? 1 : 0);
