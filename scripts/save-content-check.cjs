/* Save follow-through: download PNGs for every chart mode and verify each
   contains real ink (not a blank canvas), plus the title band. */
const { chromium } = require("playwright");
const fs = require("fs");
const http = require("http");
const path = require("path");
const PORT = 3250;
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

  const modes = [
    ["buckets-num", "cumAvg", "wage"],
    ["buckets-cat", "stream", "cumAvg"],
    ["heatmap", "residence", "attend1A"],
    ["histogram", "wage", "count"],
    ["bars", "gender", "count"],
  ];

  for (const [name, x, y] of modes) {
    await p.selectOption("#x-axis", x);
    await p.selectOption("#y-axis", y);
    await p.waitForTimeout(600);
    const dlP = p.waitForEvent("download", { timeout: 8000 });
    await p.click(".builder .chart-views button");
    try {
      const d = await dlP;
      const file = await d.path();
      const buf = fs.readFileSync(file);
      // decode via the browser to count dark pixels
      const stats = await p.evaluate(async (b64) => {
        const img = new Image();
        img.src = "data:image/png;base64," + b64;
        await new Promise((r) => (img.onload = r));
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, c.width, c.height).data;
        let dark = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] < 120 && data[i + 3] > 100) dark++;
        }
        return { w: img.width, h: img.height, dark, frac: dark / (c.width * c.height) };
      }, buf.toString("base64"));
      // real ink and the 44px title band (so height > the svg alone)
      const ok = stats.dark > 4000 && stats.h > 250;
      console.log(name, d.suggestedFilename(), `${stats.w}x${stats.h}`, "dark px:", stats.dark, ok ? "OK" : "FAIL");
      if (!ok) failures++;
    } catch (e) {
      console.log(name, "DOWNLOAD FAIL", e.message.slice(0, 60));
      failures++;
    }
  }

  await b.close();
  server.close();
  console.log(failures === 0 ? "SAVE CONTENT PASS" : `SAVE CONTENT: ${failures} failures`);
  process.exit(failures ? 1 : 0);
})();
