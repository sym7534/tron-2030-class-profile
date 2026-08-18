/* Stress test: every preset + a wide random sweep of axis pairs, watching for crashes */
const { chromium } = require("playwright");
const fs = require("fs");
const http = require("http");
const path = require("path");

const PORT = 3225;
const ROOT = path.join(process.cwd(), "out");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".ttf": "font/ttf", ".woff": "font/woff", ".woff2": "font/woff2", ".png": "image/png" };
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
  const errors = [];
  p.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  await p.goto(`http://127.0.0.1:${PORT}`, { waitUntil: "load" });
  await p.waitForTimeout(1200);
  await p.evaluate(() => document.querySelector("#builder").scrollIntoView());

  // ---- every preset button
  const presets = await p.$$eval(".preset-row button", (bs) => bs.map((b) => b.innerText));
  let presetBad = 0;
  for (const name of presets) {
    await p.click(`.preset-row button:text-is("${name}")`);
    await p.waitForTimeout(320);
    const st = await p.evaluate(() => {
      const bd = document.querySelector(".builder");
      const svg = bd.querySelector("svg");
      return { h: svg ? Math.round(svg.getBoundingClientRect().height) : 0, title: bd.querySelector(".builder-title")?.innerText };
    });
    if (st.h < 40) { console.log("  PRESET EMPTY:", name, JSON.stringify(st)); presetBad++; }
  }
  console.log(`presets: ${presets.length} tested, ${presetBad} empty`);

  // ---- sweep axis pairs
  const opts = await p.$$eval("#x-axis option", (os) => os.map((o) => o.value));
  const pairs = [];
  for (let i = 0; i < opts.length; i++) {
    pairs.push([opts[i], opts[(i * 7 + 3) % opts.length]]);
    pairs.push([opts[i], "count"]);
  }
  let bad = 0, tested = 0;
  for (const [x, y] of pairs) {
    await p.selectOption("#x-axis", x);
    await p.selectOption("#y-axis", y);
    await p.waitForTimeout(140);
    tested++;
    const st = await p.evaluate(() => {
      const bd = document.querySelector(".builder");
      const svg = bd.querySelector("svg");
      const grid = bd.querySelector(".mbti-grid, [data-mbti]");
      const txt = bd.querySelector(".word-wall, blockquote");
      const msg =
        bd.innerText.includes("nobody answered both") ||
        bd.innerText.includes("pick a question");
      return { h: svg ? Math.round(svg.getBoundingClientRect().height) : 0, grid: !!grid, txt: !!txt, msg };
    });
    if (st.h < 30 && !st.grid && !st.txt && !st.msg) { console.log("  EMPTY:", x, "x", y, JSON.stringify(st)); bad++; }
  }
  console.log(`axis pairs: ${tested} tested, ${bad} rendered nothing`);
  console.log("ERRORS:", errors.length ? errors.slice(0, 10) : "none");
  await b.close();
  server.close();
  process.exit(bad || presetBad || errors.length ? 1 : 0);
})();
