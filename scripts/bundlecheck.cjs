const fs = require("fs");
const path = require("path");

function walk(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const fp = path.join(d, e.name);
    if (e.isDirectory()) walk(fp, out);
    else if (e.name.endsWith(".js")) out.push(fp);
  }
  return out;
}

const files = walk("out/_next/static");
let hits = 0;
for (const f of files) {
  const s = fs.readFileSync(f, "utf8");
  if (s.includes("wheelMultiplier")) {
    console.log("lenis code in:", path.relative("out", f), Math.round(fs.statSync(f).size / 1024) + "KB");
    hits++;
  }
}
console.log(hits > 0 ? "BUNDLE OK" : "BUNDLE MISSING LENIS");
process.exit(hits ? 0 : 1);
