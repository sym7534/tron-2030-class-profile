/* Empty-state edge cases: swap with empty axes, filter-only, count-only, mobile empty state */
const { chromium } = require("playwright");
const fs = require("fs");
const http = require("http");
const path = require("path");
const PORT = 3248;
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
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/_vercel\/insights/.test(m.location()?.url ?? "")) errs.push(m.text()); }); // vercel analytics 404s off-vercel
  await p.goto(`http://127.0.0.1:${PORT}`, { waitUntil: "load" });
  await p.waitForTimeout(1200);
  let failures = 0;

  // 1. swap with both axes empty: should not crash, stays empty
  await p.click(".swap");
  await p.waitForTimeout(300);
  const s1 = await p.evaluate(() => ({
    title: document.querySelector(".builder-title")?.innerText,
    xVal: document.querySelector("#x-axis").value,
  }));
  const ok1 = s1.title === "Compare any stat against any other" && s1.xVal === "";
  console.log("swap-empty:", JSON.stringify(s1), ok1 ? "OK" : "FAIL");
  if (!ok1) failures++;

  // 2. count-only on one axis from empty
  await p.selectOption("#y-axis", "count");
  await p.waitForTimeout(300);
  const s2 = await p.evaluate(() => ({
    title: document.querySelector(".builder-title")?.innerText,
    hasPrompt: /Build your own graph/.test(document.querySelector(".builder .chart-frame")?.innerText ?? ""),
  }));
  // count with no field = still nothing to draw; must show the invite, not crash
  const ok2 = s2.hasPrompt || s2.title === "Compare any stat against any other";
  console.log("count-only:", JSON.stringify(s2), ok2 ? "OK" : "FAIL");
  if (!ok2) failures++;

  // 3. filter with empty axes: pick a filter, should not crash
  await p.selectOption("#filter-field", "stream").catch(() => p.selectOption(".builder select >> nth=2", "stream"));
  await p.waitForTimeout(400);
  const s3ok = (await p.evaluate(() => document.querySelector(".builder-title")?.innerText ?? "")).length > 0;
  console.log("filter-empty:", s3ok ? "OK" : "FAIL");
  if (!s3ok) failures++;

  // 4. single axis then back to select (deselect flow)
  await p.selectOption("#x-axis", "wage");
  await p.waitForTimeout(400);
  await p.selectOption("#x-axis", "");
  await p.waitForTimeout(400);
  const s4 = await p.evaluate(() => ({
    title: document.querySelector(".builder-title")?.innerText,
    hasPrompt: /Build your own graph/.test(document.querySelector(".builder .chart-frame")?.innerText ?? ""),
    hash: location.hash,
  }));
  // y is still count from step 2; title may be count-ish but must not crash. If y was reset, prompt shows.
  console.log("deselect:", JSON.stringify(s4));

  // 5. mobile empty state renders the prompt
  const m = await b.newPage({ viewport: { width: 390, height: 844 } });
  await m.goto(`http://127.0.0.1:${PORT}`, { waitUntil: "load" });
  await m.waitForTimeout(1100);
  const m1 = await m.evaluate(() => ({
    title: document.querySelector(".builder-title")?.innerText,
    hasPrompt: /Build your own graph/.test(document.querySelector(".builder .chart-frame")?.innerText ?? ""),
  }));
  const ok5 = m1.title === "Compare any stat against any other" && m1.hasPrompt;
  console.log("mobile-empty:", JSON.stringify(m1), ok5 ? "OK" : "FAIL");
  if (!ok5) failures++;

  console.log("console errors:", errs.length ? errs.slice(0, 6) : "none");
  if (errs.length) failures++;

  await b.close();
  server.close();
  console.log(failures === 0 ? "EDGE CASES PASS" : `EDGE CASES: ${failures} failures`);
  process.exit(failures ? 1 : 0);
})();
