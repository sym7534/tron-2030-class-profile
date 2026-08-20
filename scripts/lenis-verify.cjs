/* Lenis verification: momentum interpolation, anchors, reduced-motion opt-out */
const { chromium } = require("playwright");
const fs = require("fs");
const http = require("http");
const path = require("path");
const PORT = 3229;
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
  let failures = 0;

  // ---------- 1. default: Lenis active, momentum visible
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/_vercel\/insights/.test(m.location()?.url ?? "")) errs.push(m.text()); }); // vercel analytics 404s off-vercel
  await p.goto(`http://127.0.0.1:${PORT}`, { waitUntil: "load" });
  await p.waitForTimeout(1200);

  const lenisClass = await p.evaluate(() => document.documentElement.className);
  console.log("html classes:", lenisClass);
  if (!/lenis/.test(lenisClass)) { console.log("FAIL: lenis not mounted"); failures++; }

  // one wheel burst, then sample scrollY over time: with momentum the position
  // keeps advancing for a while after the events stop
  const samples = await p.evaluate(async () => {
    const out = [];
    const wheel = (dy) =>
      window.dispatchEvent(new WheelEvent("wheel", { deltaY: dy, cancelable: true, bubbles: true }));
    for (let i = 0; i < 5; i++) wheel(120);
    const t0 = performance.now();
    while (performance.now() - t0 < 900) {
      out.push({ t: Math.round(performance.now() - t0), y: Math.round(window.scrollY) });
      await new Promise((r) => setTimeout(r, 60));
    }
    return out;
  });
  const early = samples[2]?.y ?? 0;
  const late = samples[samples.length - 1].y;
  console.log("scroll samples:", samples.map((s) => s.y).join(","));
  const drifted = late > early && early > 0;
  console.log(drifted ? "momentum drift OK" : "FAIL: no drift after wheel stopped");
  if (!drifted) failures++;

  // anchor click eases (multiple intermediate frames) instead of jumping
  const anchorFrames = await p.evaluate(async () => {
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 120));
    document.querySelector('a[href="#coop"]').click();
    const ys = [];
    const t0 = performance.now();
    while (performance.now() - t0 < 1100) {
      ys.push(Math.round(window.scrollY));
      await new Promise((r) => setTimeout(r, 50));
    }
    return ys;
  });
  const distinct = new Set(anchorFrames.filter((y) => y > 0)).size;
  const landed = anchorFrames[anchorFrames.length - 1] > 1000;
  console.log("anchor frames:", anchorFrames.join(","));
  console.log(distinct >= 5 && landed ? "anchor easing OK" : "FAIL: anchor jumped or never arrived");
  if (!(distinct >= 5 && landed)) failures++;
  console.log("console errors:", errs.length ? errs : "none");
  if (errs.length) failures++;

  // ---------- 2. prefers-reduced-motion: Lenis must NOT instantiate
  const ctx = await b.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 900 } });
  const p2 = await ctx.newPage();
  await p2.goto(`http://127.0.0.1:${PORT}`, { waitUntil: "load" });
  await p2.waitForTimeout(1000);
  const rmClass = await p2.evaluate(() => document.documentElement.className);
  console.log("reduced-motion html classes:", JSON.stringify(rmClass));
  const rmOk = !/lenis/.test(rmClass);
  console.log(rmOk ? "reduced-motion opt-out OK" : "FAIL: lenis mounted despite reduced motion");
  if (!rmOk) failures++;

  await b.close();
  server.close();
  console.log(failures === 0 ? "LENIS VERIFY PASS" : `LENIS VERIFY: ${failures} failures`);
  process.exit(failures ? 1 : 0);
})();
