/* Mobile audit: screenshots at 390px of every key area + issue detection */
const { chromium } = require("playwright");
const fs = require("fs");
const http = require("http");
const path = require("path");
const PORT = 3239;
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
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto(`http://127.0.0.1:${PORT}`, { waitUntil: "load" });
  await p.evaluate(async () => {
    const h = document.body.scrollHeight;
    for (let y = 0; y < h; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 20)); }
    window.scrollTo(0, 0);
  });
  await p.waitForTimeout(1400);

  // key shots
  await p.screenshot({ path: "shots/m-00-hero.png" });
  for (const [i, sel] of [["01-builder", "#builder"], ["02-identity", "#identity"], ["03-coop", "#coop"], ["04-takes", "#takes"], ["05-words", "#words"]].entries()) {
    await p.evaluate((s) => document.querySelector(s)?.scrollIntoView(), sel[1]);
    await p.waitForTimeout(500);
    await p.screenshot({ path: `shots/m-${sel[0]}.png` });
  }

  // issue metrics
  const audit = await p.evaluate(() => {
    const out = { tinyTapTargets: 0, hScroll: document.documentElement.scrollWidth > 392, wide: [] };
    for (const el of document.querySelectorAll("button, select, a")) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.height < 32 || r.width < 32)) out.tinyTapTargets++;
    }
    const docW = document.documentElement.clientWidth;
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.right > docW + 2 && r.width > 40) {
        out.wide.push({ tag: el.tagName, cls: String(el.className).slice(0, 44) });
        if (out.wide.length > 6) break;
      }
    }
    // heatmap readability probe
    const heat = document.querySelector(".builder");
    return out;
  });
  console.log(JSON.stringify(audit, null, 1));

  // builder modes on mobile
  await p.selectOption("#x-axis", "residence");
  await p.selectOption("#y-axis", "bestRes");
  await p.waitForTimeout(600);
  await p.evaluate(() => document.querySelector("#builder").scrollIntoView());
  await p.screenshot({ path: "shots/m-06-heatmap.png" });
  await p.selectOption("#x-axis", "cumAvg");
  await p.selectOption("#y-axis", "wage");
  await p.waitForTimeout(600);
  await p.evaluate(() => document.querySelector("#builder").scrollIntoView());
  await p.screenshot({ path: "shots/m-07-buckets.png" });

  await b.close();
  server.close();
})();
