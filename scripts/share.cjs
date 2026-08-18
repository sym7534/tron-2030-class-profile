/* verify the #gx/#gy hash sharing round-trips */
const { chromium } = require("playwright");
const fs = require("fs");
const http = require("http");
const path = require("path");
const PORT = 3226;
const ROOT = path.join(process.cwd(), "out");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".ttf": "font/ttf", ".woff2": "font/woff2", ".png": "image/png" };
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
  await p.waitForTimeout(900);

  // change axes, read the hash back
  await p.selectOption("#x-axis", "caffeine");
  await p.selectOption("#y-axis", "cumAvg");
  await p.waitForTimeout(400);
  const hash = await p.evaluate(() => location.hash);
  console.log("hash after selecting caffeine/cumAvg:", hash);

  // reload straight into that hash in a fresh page
  const p2 = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  await p2.goto(`http://127.0.0.1:${PORT}/${hash}`, { waitUntil: "load" });
  await p2.waitForTimeout(1100);
  const restored = await p2.evaluate(() => ({
    x: document.querySelector("#x-axis").value,
    y: document.querySelector("#y-axis").value,
    title: document.querySelector(".builder-title")?.innerText,
  }));
  console.log("restored from hash:", JSON.stringify(restored));
  console.log(restored.x === "caffeine" && restored.y === "cumAvg" ? "SHARE OK" : "SHARE BROKEN");
  await b.close();
  server.close();
})();
