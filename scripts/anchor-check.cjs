/* Hero+spacing follow-through: nav anchor clicks land each section title
   visible below the sticky nav, with the enlarged gaps + Lenis smoothing. */
const { chromium } = require("playwright");
const fs = require("fs");
const http = require("http");
const path = require("path");
const PORT = 3254;
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
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(`http://127.0.0.1:${PORT}`, { waitUntil: "load" });
  await p.waitForTimeout(1400);
  let failures = 0;

  const sections = await p.evaluate(() =>
    [...document.querySelectorAll(".topnav-links a")]
      .map((a) => a.getAttribute("href"))
      .filter((h) => h && h.startsWith("#") && h !== "#top")
  );
  console.log("nav anchors:", JSON.stringify(sections));

  for (const href of sections) {
    await p.click(`.topnav-links a[href="${href}"]`);
    await p.waitForTimeout(1400); // let lenis settle
    const st = await p.evaluate((h) => {
      const el = document.querySelector(h);
      const nav = document.querySelector(".topnav");
      const navBottom = nav.getBoundingClientRect().bottom;
      const r = el.getBoundingClientRect();
      const header = el.querySelector("h2, .section-header");
      const hr = header ? header.getBoundingClientRect() : r;
      return {
        sectionTop: Math.round(r.top),
        headerTop: Math.round(hr.top),
        navBottom: Math.round(navBottom),
        visible: hr.top >= navBottom - 4 && hr.top < window.innerHeight * 0.75,
      };
    }, href);
    console.log(href, JSON.stringify(st), st.visible ? "OK" : "FAIL");
    if (!st.visible) failures++;
  }

  // mobile spacing sanity: gap exists but sections still reachable
  const m = await b.newPage({ viewport: { width: 390, height: 844 } });
  await m.goto(`http://127.0.0.1:${PORT}`, { waitUntil: "load" });
  await m.waitForTimeout(1100);
  const mGap = await m.evaluate(() => {
    const el = document.querySelector("#coop");
    return Math.round(parseFloat(getComputedStyle(el).paddingTop));
  });
  console.log("mobile section padding-top:", mGap, "px");
  if (mGap < 60) { console.log("FAIL: mobile gap too small"); failures++; }

  await b.close();
  server.close();
  console.log(failures === 0 ? "ANCHOR/SPACING PASS" : `ANCHOR/SPACING: ${failures} failures`);
  process.exit(failures ? 1 : 0);
})();
