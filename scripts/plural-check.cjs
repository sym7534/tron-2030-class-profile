/* verify "1 person" pluralization in tooltips */
const { chromium } = require("playwright");
const fs = require("fs");
const http = require("http");
const path = require("path");
const PORT = 3237;
const ROOT = path.join(process.cwd(), "out");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".ttf": "font/ttf", ".woff2": "font/woff2" };
const server = http.createServer((req, res) => {
  let f = decodeURIComponent(req.url.split("?")[0]);
  if (f.endsWith("/")) f += "index.html";
  const fp = path.join(ROOT, f);
  if (!fs.existsSync(fp)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "application/octet-stream" });
  fs.createReadStream(fp).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  await p.goto(`http://127.0.0.1:${PORT}`, { waitUntil: "load" });
  await p.waitForTimeout(1300);
  let failures = 0;

  // longestAwake × wage produces small buckets; hover each box until we find n=1
  await p.selectOption("#x-axis", "longestAwake");
  await p.selectOption("#y-axis", "wage");
  await p.waitForTimeout(600);
  await p.evaluate(() => document.querySelector("#builder").scrollIntoView());
  await p.waitForTimeout(300);

  const nLabels = await p.evaluate(() =>
    [...document.querySelectorAll(".builder .chart-frame svg text")]
      .map((t) => t.textContent)
      .filter((t) => /^n=\d+$/.test(t))
  );
  console.log("bucket sizes:", JSON.stringify(nLabels));

  // hover over each bucket slot, collect tooltip texts
  const tips = [];
  const svg = await p.$(".builder .chart-frame svg");
  const box = await svg.boundingBox();
  const slots = nLabels.length;
  for (let i = 0; i < slots; i++) {
    const x = box.x + 58 + ((box.width - 72) / slots) * (i + 0.5);
    const y = box.y + box.height / 2;
    await p.mouse.move(x, y);
    await p.waitForTimeout(150);
    const tip = await p.evaluate(() => document.querySelector(".chart-tooltip")?.innerText ?? "");
    if (tip) tips.push(tip.replace(/\n/g, " | "));
  }
  console.log("tooltips seen:");
  tips.forEach((t) => console.log("  ", t));

  const onePeople = tips.filter((t) => /\b1 people\b/.test(t)).length;
  const onePerson = tips.filter((t) => /\b1 person\b/.test(t)).length;
  console.log(`"1 people": ${onePeople}, "1 person": ${onePerson}`);
  if (onePeople > 0) failures++;
  if (nLabels.includes("n=1") && onePerson === 0) {
    console.log("  WARN: an n=1 bucket exists but its tooltip was not captured");
  }

  // page-wide sweep for any rendered "1 people" text
  const staticLeak = await p.evaluate(() => document.body.innerText.match(/\b1 people\b/g)?.length ?? 0);
  console.log(`static "1 people" occurrences: ${staticLeak}`);
  if (staticLeak > 0) failures++;

  await b.close();
  server.close();
  console.log(failures === 0 ? "PLURAL CHECK PASS" : "PLURAL CHECK FAIL");
  process.exit(failures ? 1 : 0);
})();
