const { chromium } = require("playwright");
const fs = require("fs");
const http = require("http");
const path = require("path");
const PORT = 3245;
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
  const p = await b.newPage({ viewport: { width: 1440, height: 1100 } });
  await p.goto(`http://127.0.0.1:${PORT}`, { waitUntil: "load" });
  await p.evaluate(async () => {
    const h = document.body.scrollHeight;
    for (let y = 0; y < h; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 20)); }
  });
  await p.waitForTimeout(1300);

  const order = await p.evaluate(() => {
    const out = {};
    for (const sec of ["coop", "firstyear"]) {
      const cards = [...document.querySelectorAll("#" + sec + " article")];
      out[sec] = cards.slice(0, 5).map((a) => a.querySelector("h3")?.innerText.slice(0, 46));
    }
    return out;
  });
  console.log(JSON.stringify(order, null, 1));

  await p.evaluate(() => document.querySelector("#coop").scrollIntoView());
  await p.waitForTimeout(500);
  await p.screenshot({ path: "shots/16-cmp-coop.png" });
  await p.evaluate(() => document.querySelector("#firstyear").scrollIntoView());
  await p.waitForTimeout(500);
  await p.screenshot({ path: "shots/17-cmp-firstyear.png" });
  await b.close();
  server.close();
})();
