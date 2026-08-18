/* confirm fonts actually load & apply in the browser */
const { chromium } = require("playwright");
const fs = require("fs");
const http = require("http");
const path = require("path");
const PORT = 3228;
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
  const p = await b.newPage();
  const fontRequests = [];
  p.on("response", (res) => {
    if (/\.(woff2?|ttf)/.test(res.url())) fontRequests.push({ url: res.url().split("/").pop(), status: res.status() });
  });
  await p.goto(`http://127.0.0.1:${PORT}`, { waitUntil: "load" });
  await p.waitForTimeout(1500);
  const check = await p.evaluate(async () => {
    await document.fonts.ready;
    const h1 = document.querySelector(".hero-title");
    const cs = getComputedStyle(h1);
    const loaded = [...document.fonts].map((f) => `${f.family} ${f.status}`);
    return {
      heroFontFamily: cs.fontFamily.slice(0, 80),
      fontsLoaded: loaded.filter((l) => l.includes("loaded")).length,
      families: [...new Set([...document.fonts].map((f) => f.family))],
    };
  });
  console.log("font network:", JSON.stringify(fontRequests));
  console.log("hero font-family:", check.heroFontFamily);
  console.log("families registered:", JSON.stringify(check.families));
  console.log("fonts loaded:", check.fontsLoaded);
  const ok = fontRequests.every((f) => f.status === 200) && check.fontsLoaded > 0;
  console.log(ok ? "FONTS OK" : "FONTS FAILED");
  await b.close();
  server.close();
  process.exit(ok ? 0 : 1);
})();
