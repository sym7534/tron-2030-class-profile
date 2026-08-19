/* verify: no presets, save button downloads a PNG, long x labels show fully when room allows */
const { chromium } = require("playwright");
const fs = require("fs");
const http = require("http");
const path = require("path");
const PORT = 3249;
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
  await p.waitForTimeout(1200);
  let failures = 0;

  // 1. no preset buttons / preset row in the builder
  const presets = await p.evaluate(() => ({
    row: !!document.querySelector(".builder .preset-row"),
    blurb: !!document.querySelector(".builder .preset-blurb"),
    grind: document.querySelector(".builder")?.innerText.includes("does the grind pay?"),
  }));
  const ok1 = !presets.row && !presets.blurb && !presets.grind;
  console.log("presets removed:", JSON.stringify(presets), ok1 ? "OK" : "FAIL");
  if (!ok1) failures++;

  // 2. no chart/table toggle in the builder; save appears once a chart exists
  await p.selectOption("#x-axis", "jobType");
  await p.selectOption("#y-axis", "wage");
  await p.waitForTimeout(700);
  const controls = await p.evaluate(() =>
    [...document.querySelectorAll(".builder .chart-views button")].map((b) => b.innerText.trim())
  );
  const ok2 = controls.includes("save") && !controls.includes("table") && !controls.includes("chart");
  console.log("frame controls:", JSON.stringify(controls), ok2 ? "OK" : "FAIL");
  if (!ok2) failures++;

  // 3. save downloads a PNG
  const dl = p.waitForEvent("download", { timeout: 8000 });
  await p.click(".builder .chart-views button");
  let dlOk = false;
  try {
    const d = await dl;
    const file = await d.path();
    const size = fs.statSync(file).size;
    console.log("download:", d.suggestedFilename(), size, "bytes");
    dlOk = /tron2030-.*\.png/.test(d.suggestedFilename()) && size > 10000;
  } catch (e) {
    console.log("download failed:", e.message.slice(0, 80));
  }
  console.log(dlOk ? "save OK" : "FAIL: save");
  if (!dlOk) failures++;

  // 4. long labels: job type buckets have room at 1440 — none should be truncated
  const labels = await p.evaluate(() =>
    [...document.querySelectorAll(".builder .chart-frame svg text")]
      .map((t) => t.textContent)
      .filter((t) => /Project|Mechanical|Research|Hardware|Software/.test(t))
  );
  const truncated = labels.filter((l) => l.includes("…"));
  console.log("bucket labels:", JSON.stringify(labels));
  const ok4 = labels.length > 0 && truncated.length === 0;
  console.log(ok4 ? "labels full OK" : `FAIL: truncated ${JSON.stringify(truncated)}`);
  if (!ok4) failures++;

  await p.screenshot({ path: "shots/20-save-labels.png" });
  await b.close();
  server.close();
  console.log(failures === 0 ? "SAVE+LABELS PASS" : `SAVE+LABELS: ${failures} failures`);
  process.exit(failures ? 1 : 0);
})();
