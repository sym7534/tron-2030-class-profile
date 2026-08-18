/* deeper motion recheck: deceleration profile + keyboard scrolling still works */
const { chromium } = require("playwright");
const fs = require("fs");
const http = require("http");
const path = require("path");
const PORT = 3230;
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
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await p.goto(`http://127.0.0.1:${PORT}`, { waitUntil: "load" });
  await p.waitForTimeout(1200);
  let failures = 0;

  // deceleration: sample velocity after a single wheel event; speed must
  // shrink monotonically-ish (ease-out), not stay constant or grow
  const vel = await p.evaluate(async () => {
    window.dispatchEvent(new WheelEvent("wheel", { deltaY: 600, cancelable: true, bubbles: true }));
    const ys = [];
    const t0 = performance.now();
    while (performance.now() - t0 < 800) {
      ys.push(window.scrollY);
      await new Promise((r) => setTimeout(r, 40));
    }
    const v = [];
    for (let i = 1; i < ys.length; i++) v.push(Math.round(ys[i] - ys[i - 1]));
    return v;
  });
  console.log("velocity per 40ms:", vel.join(","));
  // setTimeout sampling jitters ±10ms, so don't demand strict monotonic decay;
  // require the smoothed profile to collapse: early third fast, late third ~0
  const third = Math.floor(vel.length / 3);
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const early = mean(vel.slice(0, third));
  const late = mean(vel.slice(-third));
  const settles = vel[vel.length - 1] <= 2;
  const decays = early > 50 && late < early / 5;
  console.log(`early mean ${Math.round(early)} vs late mean ${Math.round(late)}`);
  console.log(decays && settles ? "deceleration profile OK" : "FAIL: not easing out");
  if (!(decays && settles)) failures++;

  // keyboard: PageDown / arrow / End must still scroll (Lenis leaves keyboard native)
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(200);
  await p.click("body");
  await p.keyboard.press("PageDown");
  await p.waitForTimeout(600);
  const afterPgDn = await p.evaluate(() => window.scrollY);
  await p.keyboard.press("End");
  await p.waitForTimeout(1200);
  const afterEnd = await p.evaluate(() => window.scrollY);
  console.log("after PageDown:", afterPgDn, "after End:", afterEnd);
  const kbOk = afterPgDn > 100 && afterEnd > afterPgDn + 1000;
  console.log(kbOk ? "keyboard scroll OK" : "FAIL: keyboard scrolling broken");
  if (!kbOk) failures++;

  // no scrollbar hijack: page height unchanged by lenis (no fake body height)
  const heights = await p.evaluate(() => ({
    doc: document.documentElement.scrollHeight,
    body: document.body.scrollHeight,
  }));
  console.log("heights:", JSON.stringify(heights));
  const hOk = Math.abs(heights.doc - heights.body) < 200;
  console.log(hOk ? "layout height OK" : "FAIL: suspicious height mismatch");
  if (!hOk) failures++;

  await b.close();
  server.close();
  console.log(failures === 0 ? "MOTION RECHECK PASS" : `MOTION RECHECK: ${failures} failures`);
  process.exit(failures ? 1 : 0);
})();
