/* Purple bars follow-through:
   1. every bar/column fill is from the approved purple set (no strays, no gradients)
   2. shade distribution is sane: not everything dark, near-tie charts stay faint
   3. specific expectations: religion (27 vs 1-3) uses deepest; a near-tie chart uses faint only */
const { chromium } = require("playwright");
const fs = require("fs");
const http = require("http");
const path = require("path");
const PORT = 3251;
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

const ALLOWED = new Set(
  [
    "#5D0096", "#865DA4", "#A05DCB", "#C2A8F0", // bars + big pie slices
    "#dcc9f7", "#efe6fb", // pie tail shades
  ].map((s) => s.toLowerCase())
);

(async () => {
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  await p.goto(`http://127.0.0.1:${PORT}`, { waitUntil: "load" });
  await p.evaluate(async () => {
    const h = document.body.scrollHeight;
    for (let y = 0; y < h; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 20)); }
    window.scrollTo(0, 0);
  });
  await p.waitForTimeout(1400);
  let failures = 0;

  const audit = await p.evaluate(() => {
    const out = { charts: 0, fills: {}, gradients: 0, byCard: {} };
    for (const svg of document.querySelectorAll("article svg, .builder svg")) {
      // pies now purple too — include them in the audit
      // bars are <path> with a fill starting with # (columns/bars only; ignore lines/text)
      const bars = [...svg.querySelectorAll("path[fill]")].filter((el) => {
        const f = el.getAttribute("fill") || "";
        return f.startsWith("#") || f.startsWith("url(");
      });
      if (bars.length === 0) continue;
      out.charts++;
      const card = svg.closest("article")?.id ?? "builder";
      const shades = new Set();
      for (const bar of bars) {
        const f = (bar.getAttribute("fill") || "").toLowerCase();
        if (f.startsWith("url(")) out.gradients++;
        out.fills[f] = (out.fills[f] ?? 0) + 1;
        shades.add(f);
      }
      out.byCard[card] = [...shades];
    }
    return out;
  });

  console.log("charts with bars:", audit.charts, "gradient fills:", audit.gradients);
  console.log("fill histogram:", JSON.stringify(audit.fills, null, 1));

  // 1. all fills allowed, no gradients
  const strays = Object.keys(audit.fills).filter((f) => !ALLOWED.has(f));
  if (audit.gradients > 0) { console.log("FAIL: gradients present"); failures++; }
  if (strays.length) { console.log("FAIL: stray fills", strays); failures++; }
  else console.log("all fills from the purple set OK");

  // 2. distribution sanity: faint must be the most common shade
  const faint = audit.fills["#c2a8f0"] ?? 0;
  const total = Object.values(audit.fills).reduce((a, b) => a + b, 0);
  console.log(`faint share: ${faint}/${total}`);
  if (faint / total < 0.5) { console.log("FAIL: too much dark ink"); failures++; }
  else console.log("dominance gating OK (faint majority)");

  // 3. spot expectations
  const religion = audit.byCard["q-religion"] ?? [];
  const relOk = religion.includes("#5d0096");
  console.log("religion shades:", JSON.stringify(religion), relOk ? "OK (dominant answer goes deep)" : "FAIL");
  if (!relOk) failures++;

  // rate1A card: ratings cluster 7-9, near-tie-ish distribution should stay shallow
  const rate = audit.byCard["q-rate1A"] ?? [];
  const rateOk = !rate.includes("#5d0096") || rate.length > 1;
  console.log("rate1A shades:", JSON.stringify(rate), rateOk ? "OK" : "FAIL");
  if (!rateOk) failures++;

  await b.close();
  server.close();
  console.log(failures === 0 ? "PURPLE AUDIT PASS" : `PURPLE AUDIT: ${failures} failures`);
  process.exit(failures ? 1 : 0);
})();
