/* Mobile recheck round 2:
   1. media-query boundary: 699px gets mobile styles, 701px gets desktop styles
   2. desktop computed styles match pre-mobile expectations (wrap nav, inline selects)
   3. tap targets at 390 after the nav padding fix
   4. mobile interactions actually work: preset tap, axis change, table toggle */
const { chromium } = require("playwright");
const fs = require("fs");
const http = require("http");
const path = require("path");
const PORT = 3244;
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

  const probe = async (width) => {
    const p = await b.newPage({ viewport: { width, height: 900 } });
    await p.goto(`http://127.0.0.1:${PORT}`, { waitUntil: "load" });
    await p.waitForTimeout(900);
    const st = await p.evaluate(() => {
      const nav = getComputedStyle(document.querySelector(".topnav"));
      const sel = getComputedStyle(document.querySelector("#x-axis"));
      const ctl = getComputedStyle(document.querySelector(".axis-ctl"));
      return {
        navWrap: nav.flexWrap,
        navOverflowX: nav.overflowX,
        selFont: sel.fontSize,
        ctlWidth: ctl.width,
        vw: document.documentElement.clientWidth,
      };
    });
    await p.close();
    return st;
  };

  const d1440 = await probe(1440);
  const d701 = await probe(701);
  const d699 = await probe(699);
  console.log("1440:", JSON.stringify(d1440));
  console.log(" 701:", JSON.stringify(d701));
  console.log(" 699:", JSON.stringify(d699));

  // desktop (1440 & 701) must be the original layout: wrapping nav, natural-width
  // controls. (Select font is 16px on BOTH because of the global text bump, so
  // the discriminators are flex-wrap and the axis-ctl width.)
  for (const [name, st] of [["1440", d1440], ["701", d701]]) {
    const ok = st.navWrap === "wrap" && parseFloat(st.ctlWidth) < 400;
    console.log(ok ? `desktop@${name} styles OK` : `FAIL: desktop@${name} got mobile styles ${JSON.stringify(st)}`);
    if (!ok) failures++;
  }
  // 699 must be mobile: nowrap scrollable nav, full-width controls, 16px selects
  const mOk =
    d699.navWrap === "nowrap" &&
    d699.navOverflowX === "auto" &&
    d699.selFont === "16px" &&
    parseFloat(d699.ctlWidth) > 500;
  console.log(mOk ? "mobile@699 styles OK" : `FAIL: mobile styles missing at 699 ${JSON.stringify(d699)}`);
  if (!mOk) failures++;

  // tap targets at 390 (after nav padding fix)
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto(`http://127.0.0.1:${PORT}`, { waitUntil: "load" });
  await p.waitForTimeout(1100);
  const tiny = await p.evaluate(() => {
    let n = 0;
    for (const el of document.querySelectorAll("button, select, a")) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.height < 32 || r.width < 24)) n++;
    }
    return n;
  });
  console.log(`tap targets <32px tall at 390: ${tiny}`);
  if (tiny > 0) failures++;

  // interactions on mobile
  await p.evaluate(() => document.querySelector("#builder").scrollIntoView());
  await p.waitForTimeout(300);
  // 1. preset tap
  await p.click(".preset-row button >> nth=1");
  await p.waitForTimeout(500);
  const title1 = await p.evaluate(() => document.querySelector(".builder-title")?.innerText);
  // 2. axis change
  await p.selectOption("#x-axis", "caffeine");
  await p.waitForTimeout(500);
  const title2 = await p.evaluate(() => document.querySelector(".builder-title")?.innerText);
  // 3. table toggle
  await p.evaluate(() => {
    [...document.querySelectorAll(".builder .chart-views button")]
      .find((b) => b.innerText.trim() === "table")
      ?.click();
  });
  await p.waitForTimeout(400);
  const rows = await p.evaluate(() => document.querySelectorAll(".builder .data-table tbody tr").length);
  console.log("interactions:", JSON.stringify({ title1, title2, tableRows: rows }));
  const intOk = title1 && title2 && title1 !== title2 && rows > 0;
  console.log(intOk ? "mobile interactions OK" : "FAIL: mobile interaction broken");
  if (!intOk) failures++;

  await b.close();
  server.close();
  console.log(failures === 0 ? "MOBILE RECHECK PASS" : `MOBILE RECHECK: ${failures} failures`);
  process.exit(failures ? 1 : 0);
})();
